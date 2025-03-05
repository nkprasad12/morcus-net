import * as React from "react";

import {
  EntryOutline,
  type DictSubsectionResult,
} from "@/common/dictionaries/dict_result";
import {
  DictInfo,
  DictsFusedRequest,
  DictsFusedResponse,
  type DictLang,
} from "@/common/dictionaries/dictionaries";
import {
  LatinDict,
  type LatinDictInfo,
} from "@/common/dictionaries/latin_dicts";
import { DictsFusedApi } from "@/web/api_routes";
import { Footer } from "@/web/client/components/footer";
import { GlobalSettingsContext } from "@/web/client/components/global_flags";
import { FullDictChip } from "@/web/client/pages/dictionary/dict_chips";
import {
  ElementAndKey,
  InflectionDataSection,
  SCROLL_JUMP,
  SCROLL_SMOOTH,
  SearchSettings,
  xmlNodeToJsx,
  DictHelpSection,
  type XmlNodeToJsxArgs,
} from "@/web/client/pages/dictionary/dictionary_utils";
import { DictionarySearch } from "@/web/client/pages/dictionary/search/dictionary_search";
import {
  ContentBox,
  DictAttribution,
} from "@/web/client/pages/dictionary/sections";
import {
  TableOfContentsV2,
  jumpToSection,
} from "@/web/client/pages/dictionary/table_of_contents_v2";
import { SectionLinkTooltip } from "@/web/client/pages/tooltips";
import {
  DictContext,
  DictContextOptions,
  DictionaryV2Props,
  type OnSearchQuery,
} from "@/web/client/pages/dictionary/dict_context";
import { assert } from "@/common/assert";
import { TitleContext } from "@/web/client/components/title";
import { useDictRouter } from "@/web/client/pages/dictionary/dictionary_routing";
import {
  Container,
  Divider,
  SpanButton,
} from "@/web/client/components/generic/basics";
import { SvgIcon } from "@/web/client/components/generic/icons";
import { useMediaQuery } from "@/web/client/utils/media_query";
import { useCallback } from "react";
import { useApiCall } from "@/web/client/utils/hooks/use_api_call";
import { arrayMapBy } from "@/common/data_structures/collect_map";
import { ClientPaths } from "@/web/client/routing/client_paths";
import { StoredCheckBox } from "@/web/client/components/generic/settings_basics";
import { usePersistedValue } from "@/web/client/utils/hooks/persisted_state";
import { getCommitHash } from "@/web/client/define_vars";
import { textCallback } from "@/web/client/utils/callback_utils";
import { BottomDrawer } from "@/web/client/components/bottom_drawer";

export const ERROR_STATE_MESSAGE =
  "Lookup failed. Please check your internet connection" +
  " and / or refresh the page (or if using the app, close and re-open)." +
  " If the issue persists, contact Mórcus.";
export const NO_RESULTS_MESSAGE = "No results found";

const DRAWER_DEFAULT_HEIGHT = 0.3;
const EMBEDDED_LOGEION_SETTING_LABEL =
  "Automatically open embedded Logeion searches";

function chooseDicts(dicts: undefined | DictInfo | DictInfo[]): DictInfo[] {
  if (dicts === undefined) {
    return LatinDict.AVAILABLE;
  }
  return Array.isArray(dicts) ? dicts : [dicts];
}

type EdgeCaseState = "Landing" | "Error" | "No Results";
type DictState = EdgeCaseState | "Loading" | "Results";

function hasGreek(input: string): boolean {
  return /[\u0370-\u03ff\u1f00-\u1fff]/.test(input);
}

function GreekWordContent(props: {
  isSmall: boolean;
  word: string;
  scrollTopRef: React.RefObject<HTMLDivElement>;
}) {
  const logeionUrl = `https://logeion.uchicago.edu/${props.word}`;
  const defaultShowInline = usePersistedValue<boolean>(
    false,
    EMBEDDED_LOGEION_SETTING_LABEL
  );
  const [showInline, setShowInline] =
    React.useState<boolean>(defaultShowInline);

  return (
    <div ref={props.scrollTopRef}>
      {!defaultShowInline && (
        <>
          <div className="text md">This site does not (yet) support Greek.</div>
          <div className="text sm">
            Click below to embed a Logeion search for {props.word} (or open{" "}
            <a href={logeionUrl} target="_blank" rel="noreferrer">
              in a new tab
            </a>
            ) .
          </div>
          <div style={{ marginTop: "8px", marginBottom: "8px" }}>
            <div>
              <SpanButton
                className="button text light"
                onClick={() => setShowInline((show) => !show)}>
                {(showInline ? "Close" : "Open") + " Embed"}
              </SpanButton>
              <StoredCheckBox
                className="text sm"
                style={{ marginTop: "4px" }}
                initial={false}
                label={EMBEDDED_LOGEION_SETTING_LABEL}
              />
            </div>
          </div>
        </>
      )}
      {defaultShowInline && (
        <div className="text xs light">Using Logeion embed for Greek term</div>
      )}
      {(showInline || defaultShowInline) && (
        <iframe
          style={{ width: "100%", height: "70vh" }}
          src={logeionUrl}></iframe>
      )}
    </div>
  );
}

function NoResultsContent(props: {
  word?: string;
  dicts: LatinDictInfo[];
  inflectedSearch: boolean | undefined;
}) {
  const { embeddedOptions } = React.useContext(DictContext);
  return (
    <>
      <div className="text md" style={{ margin: "6px 12px" }}>
        {NO_RESULTS_MESSAGE + (props.word ? ` for ${props.word}.` : ".")}
      </div>
      {!embeddedOptions?.hideSearch && (
        <LandingContent
          dictsToUse={props.dicts}
          inflectedSearch={props.inflectedSearch}
        />
      )}
    </>
  );
}

function ErrorContent(props: { isSmall: boolean }) {
  return (
    <ContentBox isSmall={props.isSmall}>
      <div>{ERROR_STATE_MESSAGE}</div>
    </ContentBox>
  );
}

function fullLangName(lang: DictLang): string {
  switch (lang) {
    case "La":
      return "Latin";
    case "En":
      return "English";
    case "Fr":
      return "French";
    default:
      return lang;
  }
}

function LandingContent(props: {
  dictsToUse: LatinDictInfo[];
  inflectedSearch: boolean | undefined;
}) {
  const dicts = props.dictsToUse.filter((d) => d.key !== "NUM");
  const fromLangs = Array.from(new Set(dicts.map((d) => d.languages.from)));
  const inflectedLatin =
    props.inflectedSearch && dicts.some((d) => d.languages.from === "La");

  return (
    <div
      className="text xs light"
      style={{ margin: "12px 16px", maxWidth: 550 }}>
      <details>
        <summary className="text xs light">
          You are searching {dicts.length} dictionaries
        </summary>
        {dicts.map((dict) => (
          <div key={dict.key} style={{ marginLeft: "16px", marginTop: "6px" }}>
            <FullDictChip size="xs" label={dict.displayName} />{" "}
            <span>
              (from {fullLangName(dict.languages.from)} to{" "}
              {fullLangName(dict.languages.to)})
            </span>
          </div>
        ))}
      </details>
      <div>
        You can type headwords in{" "}
        {fromLangs
          .filter((lang) => !inflectedLatin || lang !== "La")
          .map((lang) => fullLangName(lang))
          .join(" or ")}
        {inflectedLatin && <span>, and inflected forms of Latin words</span>}
        {"."}
      </div>
      <div className="text xs" style={{ marginTop: "8px" }}>
        Click the {<SvgIcon className="menuIcon" pathD={SvgIcon.Settings} />}{" "}
        icon in the search bar to
        {fromLangs.includes("La") && !props.inflectedSearch
          ? " enable searching inflected (i.e. conjugated or declined) forms of Latin words, and to "
          : ""}
        {" enable or disable dictionaries. "}
      </div>
    </div>
  );
}

function getEntriesByDict(
  response: DictsFusedResponse,
  hash: string | undefined,
  isEmbedded: boolean
): EntriesByDict[] {
  const args: XmlNodeToJsxArgs = { isEmbedded, highlightId: hash };
  const result: EntriesByDict[] = [];
  for (const dictKey in response) {
    const rawEntries = response[dictKey];
    const entries = rawEntries.map((e, i) => ({
      element: xmlNodeToJsx(e.entry, args),
      key: e.entry.getAttr("id") ?? `${dictKey}${i}`,
      inflections: e.inflections,
      subsections: e.subsections,
    }));
    const outlines = rawEntries.map((e) => e.outline);
    const name = LatinDict.BY_KEY.get(dictKey)?.displayName || dictKey;
    result.push({ dictKey, name, entries, outlines });
  }
  return result;
}

interface EntriesByDict {
  dictKey: string;
  name: string;
  entries: ElementAndKey[];
  outlines: EntryOutline[];
}

interface SearchBarProps {
  maxWidth: "md" | "lg" | "xl";
  id?: string;
  className?: string;
}
function SearchBar(props: SearchBarProps) {
  const {
    isEmbedded,
    embeddedOptions,
    isSmall,
    dictsToUse,
    setDictsToUse,
    scrollTopRef,
    searchQuery,
    onSearchQuery,
  } = React.useContext(DictContext);

  if (embeddedOptions?.hideSearch) {
    return null;
  }

  return (
    <Container
      maxWidth={props.maxWidth}
      disableGutters
      innerRef={scrollTopRef}
      style={{ margin: "auto" }}
      id={props.id}
      className={props.className}>
      <DictionarySearch
        smallScreen={isSmall}
        dicts={dictsToUse}
        setDicts={(newDicts) => {
          SearchSettings.store(newDicts);
          setDictsToUse(newDicts);
        }}
        autoFocused={searchQuery === undefined}
        onSearchQuery={onSearchQuery}
        embedded={isEmbedded}
      />
    </Container>
  );
}

function ToEntryButton(props: { outline: EntryOutline; scale: number }) {
  const { scale } = props;
  const label = ` ${props.outline.mainLabel || props.outline.mainKey} `;
  return (
    <span
      className="lsSenseBullet"
      style={{
        marginLeft: 3,
        cursor: "pointer",
        whiteSpace: "nowrap",
        fontWeight: "normal",
      }}
      onClick={() => jumpToSection(props.outline.mainSection.sectionId)}>
      <SvgIcon
        style={{
          marginRight: `${-0.1 * scale}em`,
          fontSize: `${0.8 * scale}em`,
          paddingLeft: `${0.1 * scale}em`,
        }}
        pathD={SvgIcon.OpenInNew}
      />
      <span dangerouslySetInnerHTML={{ __html: label }} />
    </span>
  );
}

function HelpSection(props: { id?: string; className?: string }) {
  const { isEmbedded, isSmall } = React.useContext(DictContext);
  return (
    <ContentBox
      key="helpSection"
      isSmall={isSmall}
      id={props.id}
      className={props.className}
      noDivider={isEmbedded}
      isEmbedded={isEmbedded}>
      <details>
        <summary>
          <span className="text sm light">Usage guide ⓘ</span>
        </summary>
        <div className="text sm" style={{ lineHeight: "1.2" }}>
          <DictHelpSection />
        </div>
      </details>
    </ContentBox>
  );
}

function LoadingMessage() {
  const { isSmall, isEmbedded } = React.useContext(DictContext);

  return (
    <ContentBox isSmall={isSmall} noDivider={isEmbedded}>
      <span>Loading entries, please wait ... </span>
    </ContentBox>
  );
}

interface ResponsiveLayoutComponents {
  mainContent: React.ReactNode;
  sideContent?: React.ReactNode;
  combinedContent?: React.ReactNode;
}

interface ResponsiveLayoutProps extends ResponsiveLayoutComponents {
  contextValues: DictContextOptions;
}

function ResponsiveLayout(props: ResponsiveLayoutProps) {
  return (
    <DictContext.Provider value={props.contextValues}>
      {props.contextValues.isSmall ? (
        <NarrowScreenLayout {...props} />
      ) : (
        <TwoColumnLayout>
          {props.sideContent ?? <></>}
          {props.mainContent}
        </TwoColumnLayout>
      )}
    </DictContext.Provider>
  );
}

function NarrowScreenLayout(props: ResponsiveLayoutProps) {
  const { isEmbedded, mobileLayout } = React.useContext(DictContext);
  const [drawerHeight, setDrawerHeight] = React.useState<number>(
    window.innerHeight * DRAWER_DEFAULT_HEIGHT
  );
  const classicView = mobileLayout === "Classic" || isEmbedded;

  return (
    <>
      <Container className="dictRoot" maxWidth="lg" disableGutters={isEmbedded}>
        <SearchBar maxWidth="lg" id="SearchBox" />
        {classicView && props.combinedContent
          ? props.combinedContent
          : props.mainContent}
        {!isEmbedded && <Footer id="Footer" />}
      </Container>
      {!classicView && props.sideContent && (
        <BottomDrawer
          containerClass="dictRoot"
          drawerHeight={drawerHeight}
          defaultHeightRatio={DRAWER_DEFAULT_HEIGHT}
          setDrawerHeight={setDrawerHeight}>
          <div className="bgAlt" style={{ height: "16px" }} />
          {props.sideContent}
        </BottomDrawer>
      )}
    </>
  );
}

function TwoColumnLayout(props: { children: React.ReactNode }) {
  const children = React.Children.toArray(props.children);
  assert(children.length <= 2);
  const sidebarContent = children[0] || <></>;
  const mainContent = children[1] || <></>;

  return (
    <Container
      className="dictRoot"
      maxWidth="xl"
      style={{ minHeight: "100vh" }}>
      <SearchBar maxWidth="md" />
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "left",
        }}>
        <div className="tocSidebar">{sidebarContent}</div>
        <div style={{ maxWidth: "10000px" }}>
          {mainContent}
          <Footer />
        </div>
      </div>
    </Container>
  );
}

function SummarySection(props: {
  idSearch: boolean;
  entries: EntriesByDict[];
  word?: string;
  scrollTopRef: React.RefObject<HTMLDivElement>;
}) {
  const { isEmbedded, isSmall, scale } = React.useContext(DictContext);
  const { idSearch, entries, scrollTopRef } = props;
  if (idSearch) {
    return <></>;
  }

  const numEntries = entries.reduce((s, c) => s + c.entries.length, 0);
  return (
    <ContentBox
      isSmall={isSmall}
      id="DictResultsSummary"
      isEmbedded={isEmbedded}
      noDivider={isEmbedded}
      mt={0}>
      <>
        <div ref={isEmbedded ? scrollTopRef : undefined} className="text md">
          Found {numEntries} {numEntries > 1 ? "entries" : "entry"}
          {props.word ? ` for ${props.word}` : ""}
        </div>
        {numEntries > 1 &&
          entries
            .filter((entry) => entry.outlines.length > 0)
            .map((entry) => (
              <div key={entry.dictKey + "SummarySection"}>
                <FullDictChip label={entry.name} />
                {entry.outlines.map((outline) => (
                  <span key={outline.mainSection.sectionId}>
                    {" "}
                    <ToEntryButton
                      outline={outline}
                      key={outline.mainSection.sectionId}
                      scale={scale}
                    />
                  </span>
                ))}
              </div>
            ))}
      </>
    </ContentBox>
  );
}

function articleLinkButton(text: string, scale: number) {
  function senseForwardedNode(forwardProps: any, forwardRef: any) {
    return (
      <span
        {...forwardProps}
        className="lsSenseBullet"
        ref={forwardRef}
        style={{
          paddingLeft: 1,
          marginRight: 5,
          paddingTop: 1,
          paddingBottom: 1,
          paddingRight: 4,
        }}>
        <SvgIcon
          pathD={SvgIcon.Link}
          style={{
            marginRight: `${-0.2 * scale}em`,
            fontSize: `${1 * scale}em`,
            paddingLeft: `${0.2 * scale}em`,
            paddingRight: `${0.4 * scale}em`,
          }}
        />
        {`${text}`}
      </span>
    );
  }
  return React.forwardRef<HTMLElement>(senseForwardedNode);
}

function DictionaryEntries(props: { entries: EntriesByDict[] }) {
  const { isSmall, scale, fromInternalLink, onSearchQuery } =
    React.useContext(DictContext);
  const { nav } = useDictRouter();

  const clickHandler = textCallback((query) => {
    // This flag is used only to determine whether or not to trigger
    // certain transition UI affordances (in the current writing, smooth scroll).
    // It is *not* used to calculate VDOM state.
    if (fromInternalLink) {
      fromInternalLink.current = true;
    }
    onSearchQuery(query, { lang: "La", inflectedSearch: true });
    return true;
  }, "latWord");
  const auxClickHandler = textCallback((query) => {
    nav.inNewTab({
      path: ClientPaths.DICT_PAGE.path,
      query,
      lang: "La",
      inflectedSearch: true,
    });
    return true;
  }, "latWord");

  return (
    <div onAuxClick={auxClickHandler} onClick={clickHandler}>
      {props.entries.map((entry) => (
        <SingleDictSection
          data={entry}
          key={`${entry.dictKey}EntrySection`}
          isSmall={isSmall}
          scale={scale}
        />
      ))}
    </div>
  );
}

type DedupedSubsectionResult = Omit<DictSubsectionResult, "id"> & {
  ids: string[];
};

function dedupeSubsectons(
  subsections: DictSubsectionResult[]
): DedupedSubsectionResult[] {
  return Array.from(arrayMapBy(subsections, (s) => s.name).map.values()).map(
    (results) => ({ ...results[0], ids: results.map((r) => r.id) })
  );
}

function SubsectionNote(props: {
  subsections: DictSubsectionResult[];
  scale: number;
}) {
  const { scale } = props;
  const subsections = dedupeSubsectons(props.subsections);

  return (
    <div style={{ marginBottom: "8px" }}>
      <div style={{ marginBottom: "4px" }} className="text sm">
        Found matches for{" "}
        {subsections.map((subsection, i) => (
          <React.Fragment key={subsection.name}>
            {subsection.ids.map((id, j) => (
              <React.Fragment key={id}>
                {j > 0 && ", "}
                <span
                  key={id}
                  onClick={() => {
                    document.getElementById(id)?.scrollIntoView(SCROLL_SMOOTH);
                  }}>
                  <span
                    className="lsSenseBullet"
                    style={{ whiteSpace: "nowrap" }}>
                    <SvgIcon
                      pathD={SvgIcon.KeyboardArrowDown}
                      style={{
                        marginRight: `${-0.2 * scale}em`,
                        fontSize: `${1 * scale}em`,
                        paddingLeft: `${0.2 * scale}em`,
                        paddingRight: `${0.4 * scale}em`,
                      }}
                    />
                    {(j === 0 ? subsection.name + " " : "") +
                      (subsection.ids.length > 1 ? `#${j + 1}` : "") +
                      " "}
                  </span>
                </span>
              </React.Fragment>
            ))}
            {i < subsections.length - 1 && (
              <span>{i < subsections.length - 2 ? " , " : " and "}</span>
            )}
          </React.Fragment>
        ))}
        , which {subsections.length > 1 ? "are" : "is"} part of a larger entry.
      </div>
      {subsections.map(
        (subsection) =>
          subsection.inflections && (
            <details key={subsection.name} open={subsections.length < 2}>
              <summary className="text sm">
                Inflections of <span className="lsOrth">{subsection.name}</span>
              </summary>
              <div style={{ paddingLeft: "12px" }}>
                <InflectionDataSection inflections={subsection.inflections} />
              </div>
            </details>
          )
      )}
    </div>
  );
}

function SingleDictSection(props: {
  data: EntriesByDict;
  isSmall: boolean;
  scale: number;
}) {
  const { isSmall, scale } = props;
  if (props.data.entries.length === 0) {
    return <></>;
  }
  return (
    <>
      {props.data.entries.map((entry, i) => (
        <ContentBox key={entry.key} isSmall={isSmall} id={entry.key}>
          <>
            {entry.subsections && (
              <SubsectionNote
                subsections={entry.subsections}
                scale={props.scale}
              />
            )}
            <div style={{ marginTop: "12px" }}>
              <span>
                <SectionLinkTooltip
                  forwarded={articleLinkButton(
                    props.data.outlines[i].mainKey,
                    scale
                  )}
                  id={props.data.outlines[i].mainSection.sectionId}
                  forArticle
                />
                <FullDictChip label={props.data.name} />
              </span>
              {entry.inflections && (
                <div style={{ marginTop: "6px", marginBottom: "12px" }}>
                  <InflectionDataSection inflections={entry.inflections} />
                </div>
              )}
            </div>
            {entry.element}
          </>
        </ContentBox>
      ))}
      <DictAttribution isSmall={isSmall} dictKey={props.data.dictKey} />
    </>
  );
}

function DefaultTableOfContents(props: TableOfContentsProps) {
  const { isSmall } = React.useContext(DictContext);
  return (
    <>
      {props.entries.map((entry) => (
        <TableOfContentsV2
          dictKey={entry.dictKey}
          outlines={entry.outlines}
          isSmall={isSmall}
          key={entry.dictKey + "ToC"}
        />
      ))}
    </>
  );
}
function HideableTableOfContents(props: TableOfContentsProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <details open={open} onToggle={() => setOpen(!open)}>
        <summary>
          <span className="text md light">Outline</span>
        </summary>
        <DefaultTableOfContents {...props} />
      </details>
      {!open && <Divider style={{ marginTop: "8px" }} />}
    </>
  );
}

interface TableOfContentsProps {
  entries: EntriesByDict[];
}
function TableOfContents(props: TableOfContentsProps) {
  const { embeddedOptions } = React.useContext(DictContext);
  return embeddedOptions?.hideableOutline === true ? (
    <HideableTableOfContents {...props} />
  ) : (
    <DefaultTableOfContents {...props} />
  );
}

export function DictionaryViewV2(props: DictionaryV2Props) {
  const isEmbedded = props?.embedded === true;
  const [state, setState] = React.useState<DictState>("Landing");
  const [entries, setEntries] = React.useState<EntriesByDict[]>([]);
  const [dictsToUse, setDictsToUse] = React.useState<LatinDictInfo[]>(
    SearchSettings.retrieve().filter(
      (dict) => !isEmbedded || ["La", "*"].includes(dict.languages.from)
    )
  );
  const isScreenSmall = useMediaQuery("(max-width: 900px)");

  const scrollTopRef = React.useRef<HTMLDivElement>(null);

  const settings = React.useContext(GlobalSettingsContext);
  const { route, nav } = useDictRouter();
  const title = React.useContext(TitleContext);
  const fromInternalLink = React.useRef<boolean>(false);

  const isSmall = isEmbedded || isScreenSmall;
  const scale = (props?.textScale || 100) / 100;
  const idSearch = route.idSearch === true;

  const { initial, setInitial } = props;
  const query = isEmbedded ? initial : route.query;
  const hash = route.hash;
  const inflectedSetting = isEmbedded
    ? settings.data.embeddedInflectedSearch
    : settings.data.inflectedSearch;
  const inflectedSearch =
    inflectedSetting === true || route.inflectedSearch === true;
  // We would have only needed a single boolean of whether we had a Greek term or now.
  // However, since the scroll (to go past the search bar) is in a useEffect, we want to
  // make sure the useEffect fires even if the query goes from one greek word to another.
  // If we just had a boolean for is Greek or not in the dependency array, it wouldn't fire
  // in this case, so just save the whole word.
  const greekTerm = isEmbedded && query && hasGreek(query) ? query : null;

  const allowedDicts = isEmbedded ? dictsToUse : route.dicts;
  const queryLang = route.lang;
  const queryDicts = React.useMemo(
    () =>
      chooseDicts(allowedDicts).filter(
        (d) => queryLang === undefined || d.languages.from === queryLang
      ),
    [allowedDicts, queryLang]
  );

  // Serialized to a string so that the dependency array doesn't
  // change if the contents don't change.
  const queryDictKeys = queryDicts.map((d) => d.key).join("@@");
  const apiRequest: DictsFusedRequest | null = React.useMemo(
    () =>
      query === undefined || greekTerm !== null
        ? null
        : {
            query,
            dicts: queryDictKeys.split("@@"),
            mode: idSearch ? 2 : inflectedSearch ? 1 : 0,
            commitHash: getCommitHash(),
          },
    [query, queryDictKeys, idSearch, inflectedSearch, greekTerm]
  );
  useApiCall(DictsFusedApi, apiRequest, {
    reloadOldClient: true,
    onError: () => setState("Error"),
    onLoading: () => setState("Loading"),
    onResult: useCallback(
      (result) => {
        const allEntries = getEntriesByDict(result, hash, isEmbedded);
        setEntries(allEntries);
        const numEntries = allEntries.reduce((s, c) => s + c.entries.length, 0);
        setState(numEntries === 0 ? "No Results" : "Results");
      },
      [hash, isEmbedded]
    ),
  });

  React.useEffect(() => {
    if (!isEmbedded && query !== undefined) {
      title.setCurrentDictWord(query);
    }
  }, [title, isEmbedded, query]);

  React.useEffect(() => {
    if (state !== "Results" && greekTerm === null) {
      return;
    }
    const highlighted =
      hash === undefined ? null : document.getElementById(hash);
    const scrollElement = highlighted || scrollTopRef.current;
    const scrollType =
      fromInternalLink.current || isEmbedded
        ? SCROLL_JUMP
        : scrollElement === scrollTopRef.current
        ? SCROLL_SMOOTH
        : SCROLL_JUMP;
    scrollElement?.scrollIntoView(scrollType);
    fromInternalLink.current = false;
  }, [state, isEmbedded, hash, greekTerm]);

  const onSearchQuery: OnSearchQuery = useCallback(
    (query, options) => {
      if (setInitial) {
        setInitial(query);
        return;
      }
      const filterDicts = (d: LatinDictInfo) =>
        options?.lang === undefined || d.languages.from === options?.lang;
      const available = LatinDict.AVAILABLE.filter(filterDicts);
      const canUse = dictsToUse.filter(filterDicts);
      nav.to({
        path: ClientPaths.DICT_PAGE.path,
        query,
        lang: options?.lang,
        inflectedSearch:
          options?.inflectedSearch ?? settings.data.inflectedSearch === true,
        dicts:
          options?.dicts ??
          (available.length === canUse.length ? undefined : canUse),
      });
    },
    [nav, settings.data.inflectedSearch, setInitial, dictsToUse]
  );

  const contextValues: DictContextOptions = React.useMemo(
    () => ({
      isEmbedded,
      isSmall,
      scale,
      embeddedOptions: props.embeddedOptions,
      dictsToUse,
      setDictsToUse,
      scrollTopRef,
      fromInternalLink,
      searchQuery: query,
      onSearchQuery,
      mobileLayout: settings.data.dictionaryMobileLayout,
    }),
    [
      isEmbedded,
      isSmall,
      scale,
      props.embeddedOptions,
      dictsToUse,
      setDictsToUse,
      scrollTopRef,
      fromInternalLink,
      query,
      onSearchQuery,
      settings.data.dictionaryMobileLayout,
    ]
  );

  const simpleContent =
    greekTerm !== null ? (
      <GreekWordContent
        isSmall={isSmall}
        word={greekTerm}
        scrollTopRef={scrollTopRef}
      />
    ) : state === "Landing" ? (
      <LandingContent
        dictsToUse={dictsToUse}
        inflectedSearch={settings.data.inflectedSearch}
      />
    ) : state === "Error" ? (
      <ErrorContent isSmall={isSmall} />
    ) : state === "No Results" ? (
      <NoResultsContent
        word={query}
        dicts={dictsToUse}
        inflectedSearch={settings.data.inflectedSearch}
      />
    ) : state === "Loading" ? (
      <LoadingMessage />
    ) : null;

  if (simpleContent !== null) {
    return (
      <ResponsiveLayout
        mainContent={simpleContent}
        contextValues={contextValues}
      />
    );
  }

  const tableOfContents = <TableOfContents entries={entries} />;
  const summarySection = (
    <SummarySection
      scrollTopRef={scrollTopRef}
      idSearch={idSearch}
      entries={entries}
      word={query}
    />
  );
  const dictionaryEntries = <DictionaryEntries entries={entries} />;
  const helpSection = <HelpSection />;
  const mainContent = (
    <>
      {helpSection}
      {summarySection}
      {dictionaryEntries}
    </>
  );
  const combinedContent = (
    <>
      {helpSection}
      {summarySection}
      {tableOfContents}
      {dictionaryEntries}
    </>
  );
  return (
    <ResponsiveLayout
      contextValues={contextValues}
      mainContent={mainContent}
      sideContent={tableOfContents}
      combinedContent={combinedContent}
    />
  );
}
