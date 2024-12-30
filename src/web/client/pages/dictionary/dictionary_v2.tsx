import * as React from "react";

import {
  EntryOutline,
  type DictSubsectionResult,
} from "@/common/dictionaries/dict_result";
import {
  DictInfo,
  DictsFusedRequest,
  DictsFusedResponse,
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
  QUICK_NAV_ANCHOR,
  QNA_EMBEDDED,
  SCROLL_JUMP,
  SCROLL_SMOOTH,
  SearchSettings,
  xmlNodeToJsx,
  DictHelpSection,
} from "@/web/client/pages/dictionary/dictionary_utils";
import { QuickNavMenu } from "@/web/client/pages/dictionary/quick_nav";
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
import ReactDOM from "react-dom";
import { FontSizes } from "@/web/client/styling/styles";
import {
  DictContext,
  DictContextOptions,
  DictionaryV2Props,
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

export const ERROR_STATE_MESSAGE =
  "Lookup failed. Please check your internet connection" +
  " and / or refresh the page (or if using the app, close and re-open)." +
  " If the issue persists, contact Mórcus.";
export const NO_RESULTS_MESSAGE = "No results found";

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

function HorizontalPlaceholder() {
  return (
    <span key={"horizonatalSpacePlaceholder"} className="dictPlaceholder">
      {"pla ceh old er".repeat(20)}
    </span>
  );
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
  isSmall: boolean;
  word?: string;
  dicts: DictInfo[];
}) {
  const labels =
    props.dicts.length > 0 ? props.dicts.map((d) => d.displayName) : ["None"];
  return (
    <ContentBox isSmall={props.isSmall}>
      <>
        <div>
          {NO_RESULTS_MESSAGE + (props.word ? ` for ${props.word}.` : ".")}
        </div>
        <div className="text sm">
          Enabled dictionaries:{" "}
          {labels.map((label) => (
            <span key={label}>
              <FullDictChip label={label} size="sm" />{" "}
            </span>
          ))}
        </div>
      </>
    </ContentBox>
  );
}

function ErrorContent(props: { isSmall: boolean }) {
  return (
    <ContentBox isSmall={props.isSmall}>
      <div>{ERROR_STATE_MESSAGE}</div>
    </ContentBox>
  );
}

function getEntriesByDict(
  response: DictsFusedResponse,
  hash: string | undefined,
  isEmbedded: boolean
): EntriesByDict[] {
  const result: EntriesByDict[] = [];
  for (const dictKey in response) {
    const rawEntries = response[dictKey];
    const entries = rawEntries.map((e, i) => ({
      element: xmlNodeToJsx(e.entry, hash, undefined, isEmbedded),
      key: e.entry.getAttr("id") || `${dictKey}${i}`,
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
  marginLeft?: "auto" | "0";
  id?: string;
  className?: string;
}
function SearchBar(props: SearchBarProps) {
  const {
    isEmbedded,
    isSmall,
    dictsToUse,
    setDictsToUse,
    scrollTopRef,
    searchQuery,
    onSearchQuery,
  } = React.useContext(DictContext);

  return (
    <Container
      maxWidth={props.maxWidth}
      disableGutters
      innerRef={scrollTopRef}
      style={{ marginLeft: props.marginLeft || "auto" }}
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

function ResponsiveLayout(props: {
  oneCol?: React.ReactNode;
  twoColSide?: React.ReactNode;
  twoColMain?: React.ReactNode;
  contextValues: DictContextOptions;
}) {
  const { isSmall } = props.contextValues;
  return (
    <DictContext.Provider value={props.contextValues}>
      {isSmall ? (
        <OneColumnLayout>{props.oneCol || <></>}</OneColumnLayout>
      ) : (
        <TwoColumnLayout>
          {props.twoColSide || <></>}
          {props.twoColMain || <></>}
        </TwoColumnLayout>
      )}
    </DictContext.Provider>
  );
}

function OneColumnLayout(props: { children: React.ReactNode }) {
  const { isEmbedded } = React.useContext(DictContext);
  return (
    <Container maxWidth="lg" disableGutters={isEmbedded}>
      <SearchBar
        maxWidth="lg"
        id={"SearchBox"}
        className={isEmbedded ? QNA_EMBEDDED : QUICK_NAV_ANCHOR}
      />
      {props.children}
      {!isEmbedded && (
        <Footer
          id={"Footer"}
          className={isEmbedded ? QNA_EMBEDDED : QUICK_NAV_ANCHOR}
        />
      )}
    </Container>
  );
}

function TwoColumnLayout(props: { children: React.ReactNode }) {
  const children = React.Children.toArray(props.children);
  assert(children.length <= 2);
  const sidebarContent = children[0] || <></>;
  const mainContent = children[1] || <></>;

  return (
    <Container maxWidth="xl" style={{ minHeight: "100vh" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "left",
        }}>
        <div className="tocSidebar">{sidebarContent}</div>
        <div style={{ maxWidth: "10000px" }}>
          <SearchBar maxWidth="md" marginLeft="0" />
          {mainContent}
          <HorizontalPlaceholder />
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
        <div
          ref={isEmbedded ? scrollTopRef : undefined}
          style={{
            fontSize: isEmbedded ? FontSizes.BIG_SCREEN * scale : undefined,
          }}>
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
  const { isSmall, textScale, scale } = React.useContext(DictContext);
  return (
    <>
      {props.entries.map((entry) => (
        <SingleDictSection
          data={entry}
          key={`${entry.dictKey}EntrySection`}
          isSmall={isSmall}
          textScale={textScale}
          scale={scale}
        />
      ))}
    </>
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
  textScale?: number;
  scale: number;
}) {
  const { isSmall, textScale, scale } = props;
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
      <DictAttribution
        isSmall={isSmall}
        dictKey={props.data.dictKey}
        textScale={textScale}
      />
    </>
  );
}

function DefaultTableOfContents(props: TableOfContentsProps) {
  const { isSmall, textScale } = React.useContext(DictContext);
  return (
    <>
      {props.entries.map((entry) => (
        <TableOfContentsV2
          dictKey={entry.dictKey}
          outlines={entry.outlines}
          isSmall={isSmall}
          key={entry.dictKey + "ToC"}
          textScale={textScale}
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

  const entriesRef = React.useRef<HTMLDivElement>(null);
  const scrollTopRef = React.useRef<HTMLDivElement>(null);

  const settings = React.useContext(GlobalSettingsContext);
  const { route, nav } = useDictRouter();
  const title = React.useContext(TitleContext);
  const fromInternalLink = React.useRef<boolean>(false);

  const isSmall = isEmbedded || isScreenSmall;
  const scale = (props?.textScale || 100) / 100;
  const textScale = props?.textScale;
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
  const queryDicts = React.useMemo(
    () => chooseDicts(allowedDicts),
    [allowedDicts]
  );
  const apiRequest: DictsFusedRequest | null = React.useMemo(
    () =>
      query === undefined || greekTerm !== null
        ? null
        : {
            query,
            dicts: queryDicts.map((dict) => dict.key),
            mode: idSearch ? 2 : inflectedSearch ? 1 : 0,
          },
    [query, queryDicts, idSearch, inflectedSearch, greekTerm]
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

  const onSearchQuery = useCallback(
    (term: string, dict?: DictInfo) => {
      if (setInitial) {
        setInitial(term);
        return;
      }
      nav.to({
        path: ClientPaths.DICT_PAGE.path,
        query: term,
        dicts: dict,
        inflectedSearch: settings.data.inflectedSearch === true,
      });
    },
    [nav, settings.data.inflectedSearch, setInitial]
  );

  const contextValues: DictContextOptions = React.useMemo(
    () => ({
      isEmbedded,
      isSmall,
      scale,
      textScale,
      embeddedOptions: props.embeddedOptions,
      dictsToUse,
      setDictsToUse,
      scrollTopRef,
      setInitial: props.setInitial,
      fromInternalLink,
      searchQuery: query,
      onSearchQuery,
    }),
    [
      isEmbedded,
      isSmall,
      scale,
      textScale,
      props.embeddedOptions,
      dictsToUse,
      setDictsToUse,
      scrollTopRef,
      props.setInitial,
      fromInternalLink,
      query,
      onSearchQuery,
    ]
  );

  if (greekTerm !== null) {
    const greekWorkContent = (
      <GreekWordContent
        isSmall={isSmall}
        word={greekTerm}
        scrollTopRef={scrollTopRef}
      />
    );
    return (
      <ResponsiveLayout
        oneCol={greekWorkContent}
        twoColMain={greekWorkContent}
        contextValues={contextValues}
      />
    );
  }

  if (state === "Landing") {
    return <ResponsiveLayout contextValues={contextValues} />;
  }

  if (state === "Error") {
    return (
      <ResponsiveLayout
        contextValues={contextValues}
        oneCol={<ErrorContent isSmall={isSmall} />}
        twoColMain={<ErrorContent isSmall={isSmall} />}
      />
    );
  }

  if (state === "No Results") {
    const noResults = (
      <NoResultsContent isSmall={isSmall} word={query} dicts={dictsToUse} />
    );
    return (
      <ResponsiveLayout
        oneCol={noResults}
        twoColMain={noResults}
        contextValues={contextValues}
      />
    );
  }

  if (state === "Loading") {
    return (
      <ResponsiveLayout
        contextValues={contextValues}
        oneCol={<LoadingMessage />}
        twoColMain={<LoadingMessage />}
      />
    );
  }

  return (
    <ResponsiveLayout
      contextValues={contextValues}
      oneCol={
        <>
          {!isEmbedded &&
            ReactDOM.createPortal(<QuickNavMenu />, document.body)}
          <HelpSection
            id={"HelpSection"}
            className={isEmbedded ? QNA_EMBEDDED : QUICK_NAV_ANCHOR}
          />
          <div
            id={"Toc"}
            className={isEmbedded ? QNA_EMBEDDED : QUICK_NAV_ANCHOR}>
            <SummarySection
              scrollTopRef={scrollTopRef}
              idSearch={idSearch}
              entries={entries}
              word={query}
            />
            <TableOfContents entries={entries} />
          </div>
          <div ref={entriesRef}>
            <DictionaryEntries entries={entries} />
          </div>
        </>
      }
      twoColSide={<TableOfContents entries={entries} />}
      twoColMain={
        <>
          <HelpSection />
          <SummarySection
            scrollTopRef={scrollTopRef}
            idSearch={idSearch}
            entries={entries}
            word={query}
          />
          <DictionaryEntries entries={entries} />
        </>
      }
    />
  );
}
