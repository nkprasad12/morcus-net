import Stack from "@mui/material/Stack";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { CSSProperties } from "react";
import * as React from "react";

import { EntryOutline } from "@/common/dictionaries/dict_result";
import {
  DictInfo,
  DictsFusedResponse,
} from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
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
import { callApiFull } from "@/web/utils/rpc/client_rpc";
import ReactDOM, { flushSync } from "react-dom";
import { reloadIfOldClient } from "@/web/client/components/page_utils";
import { FontSizes } from "@/web/client/styling/styles";
import {
  DictContext,
  DictContextOptions,
  DictionaryV2Props,
} from "@/web/client/pages/dictionary/dict_context";
import { assert } from "@/common/assert";
import { TitleContext } from "@/web/client/components/title";
import { useDictRouter } from "@/web/client/pages/dictionary/dictionary_routing";
import { Container, Divider } from "@/web/client/components/generic/basics";
import { SvgIcon, SvgIcons } from "@/web/client/components/generic/icons";

export const ERROR_STATE_MESSAGE =
  "Lookup failed. Please check your internet connection" +
  " and / or refresh the page (or if using the app, close and re-open)." +
  " If the issue persists, contact Mórcus.";
export const NO_RESULTS_MESSAGE =
  "No results found. If applicable, try enabling another " +
  "dictionary in settings.";

const TOC_SIDEBAR_STYLE: CSSProperties = {
  position: "sticky",
  zIndex: 1,
  top: 0,
  left: 0,
  marginTop: 10,
  overflow: "auto",
  maxHeight: window.innerHeight - 40,
  minWidth: "min(29%, 300px)",
};

function chooseDicts(
  dicts: undefined | DictInfo | DictInfo[],
  isEmbedded: boolean
): DictInfo[] {
  if (isEmbedded) {
    return LatinDict.AVAILABLE.filter((dict) => dict.languages.from === "La");
  }
  if (dicts === undefined) {
    return LatinDict.AVAILABLE;
  }
  if (Array.isArray(dicts)) {
    return dicts;
  }
  return [dicts];
}

async function fetchEntry(
  query: string,
  inflections: boolean,
  singleArticle: boolean,
  embedded: boolean,
  dicts: DictInfo[]
) {
  const result = callApiFull(DictsFusedApi, {
    query,
    dicts: dicts.map((dict) => dict.key),
    mode: singleArticle ? 2 : inflections || embedded ? 1 : 0,
  });
  try {
    return await result;
  } catch (reason) {
    console.debug(reason);
    return null;
  }
}

const noSsr = { noSsr: true };

type EdgeCaseState = "Landing" | "Error" | "No Results";
type DictState = EdgeCaseState | "Loading" | "Results";

function HorizontalPlaceholder() {
  return (
    <span key={"horizonatalSpacePlaceholder"} className="dictPlaceholder">
      {"pla ceh old er".repeat(20)}
    </span>
  );
}

function NoResultsContent(props: { isSmall: boolean; dicts: DictInfo[] }) {
  const labels =
    props.dicts.length > 0 ? props.dicts.map((d) => d.displayName) : ["None"];
  return (
    <ContentBox isSmall={props.isSmall}>
      <>
        <div>{NO_RESULTS_MESSAGE}</div>
        <div>
          Enabled dictionaries:{" "}
          {labels.map((label) => (
            <span key={label}>
              <FullDictChip label={label} />{" "}
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
  sectionRef: React.RefObject<HTMLElement>,
  hash: string | undefined,
  isEmbedded: boolean
): EntriesByDict[] {
  const result: EntriesByDict[] = [];
  for (const dictKey in response) {
    const rawEntries = response[dictKey];
    const entries = rawEntries.map((e, i) => ({
      element: xmlNodeToJsx(e.entry, hash, sectionRef, undefined, isEmbedded),
      key: e.entry.getAttr("id") || `${dictKey}${i}`,
      inflections: e.inflections,
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
  const { isEmbedded, isSmall, dictsToUse, setDictsToUse, scrollTopRef } =
    React.useContext(DictContext);

  if (isEmbedded) {
    return <></>;
  }
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
          marginBottom: `${-0.1 * scale}em`,
          marginRight: `${-0.1 * scale}em`,
          fontSize: `${0.8 * scale}em`,
          paddingLeft: `${0.1 * scale}em`,
        }}
        pathD={SvgIcons.OpenInNew}
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
    <Container maxWidth="xl" style={{ minHeight: window.innerHeight }}>
      <Stack direction="row" spacing={0} justifyContent="left">
        <div style={TOC_SIDEBAR_STYLE}>{sidebarContent}</div>
        <div style={{ maxWidth: "10000px" }}>
          <SearchBar maxWidth="md" marginLeft="0" />
          {mainContent}
          <HorizontalPlaceholder />
          <Footer />
        </div>
      </Stack>
    </Container>
  );
}

function SummarySection(props: {
  idSearch: boolean;
  entries: EntriesByDict[];
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
          pathD={SvgIcons.Link}
          style={{
            marginBottom: `${-0.2 * scale}em`,
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
            {entry.inflections && (
              <InflectionDataSection
                inflections={entry.inflections}
                textScale={textScale}
              />
            )}
            <div style={{ marginBottom: 5, marginTop: 8 }}>
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
          tocRef={props.tocRef}
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
  tocRef: React.RefObject<HTMLDivElement>;
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
  const [state, setState] = React.useState<DictState>("Landing");
  const [entries, setEntries] = React.useState<EntriesByDict[]>([]);
  const [dictsToUse, setDictsToUse] = React.useState<DictInfo[]>(
    SearchSettings.retrieve()
  );
  const theme = useTheme();
  const isScreenSmall = useMediaQuery(theme.breakpoints.down("md"), noSsr);

  const sectionRef = React.useRef<HTMLElement>(null);
  const tocRef = React.useRef<HTMLDivElement>(null);
  const entriesRef = React.useRef<HTMLDivElement>(null);
  const scrollTopRef = React.useRef<HTMLDivElement>(null);

  const settings = React.useContext(GlobalSettingsContext);
  const { route } = useDictRouter();
  const title = React.useContext(TitleContext);
  const fromInternalLink = React.useRef<boolean>(false);

  const isEmbedded = props?.embedded === true;
  const isSmall = isEmbedded || isScreenSmall;
  const scale = (props?.textScale || 100) / 100;
  const textScale = props?.textScale;
  const idSearch = route.idSearch === true;

  const { initial } = props;
  const query = isEmbedded ? initial : route.query;
  const inflectedSearch =
    settings.data.inflectedSearch === true || route.inflectedSearch === true;
  const queryDicts = React.useMemo(
    () => chooseDicts(route.dicts, isEmbedded),
    [route.dicts, isEmbedded]
  );

  React.useEffect(() => {
    if (query === undefined) {
      return;
    }
    setState("Loading");
    const serverResult = fetchEntry(
      query,
      inflectedSearch,
      idSearch,
      isEmbedded,
      queryDicts
    );
    serverResult.then((newResults) => {
      if (newResults === null) {
        setState("Error");
        return;
      }
      reloadIfOldClient(newResults);

      const allEntries = getEntriesByDict(
        newResults.data,
        sectionRef,
        route.hash,
        isEmbedded
      );
      flushSync(() => {
        setEntries(allEntries);
        const numEntries = allEntries.reduce((s, c) => s + c.entries.length, 0);
        setState(numEntries === 0 ? "No Results" : "Results");
      });
      const scrollElement =
        sectionRef.current || (isEmbedded ? null : scrollTopRef.current);
      const scrollType =
        fromInternalLink.current || isEmbedded
          ? SCROLL_JUMP
          : scrollElement === scrollTopRef.current
          ? SCROLL_SMOOTH
          : SCROLL_JUMP;
      scrollElement?.scrollIntoView(scrollType);
      fromInternalLink.current = false;
    });
  }, [query, route.hash, inflectedSearch, idSearch, isEmbedded, queryDicts]);

  React.useEffect(() => {
    if (!isEmbedded && query !== undefined) {
      title.setCurrentDictWord(query);
    }
  }, [title, isEmbedded, query]);

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
    ]
  );

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
    const noResults = <NoResultsContent isSmall={isSmall} dicts={dictsToUse} />;
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
            />
            <TableOfContents entries={entries} tocRef={tocRef} />
          </div>
          <div ref={entriesRef}>
            <DictionaryEntries entries={entries} />
          </div>
        </>
      }
      twoColSide={<TableOfContents entries={entries} tocRef={tocRef} />}
      twoColMain={
        <>
          <HelpSection />
          <SummarySection
            scrollTopRef={scrollTopRef}
            idSearch={idSearch}
            entries={entries}
          />
          <DictionaryEntries entries={entries} />
        </>
      }
    />
  );
}
