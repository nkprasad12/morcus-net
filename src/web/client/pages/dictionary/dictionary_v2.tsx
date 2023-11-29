import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import LinkIcon from "@mui/icons-material/Link";
import React, { CSSProperties } from "react";

import { RouteContext } from "@/web/client/components/router";
import ReactDOM, { flushSync } from "react-dom";
import { DictsFusedApi } from "@/web/api_routes";
import { callApiFull } from "@/web/utils/rpc/client_rpc";
import { Footer } from "@/web/client/components/footer";
import {
  ElementAndKey,
  HELP_ENTRY,
  InflectionDataSection,
  QUICK_NAV_ANCHOR,
  SCROLL_JUMP,
  SCROLL_SMOOTH,
  SearchSettings,
  xmlNodeToJsx,
} from "@/web/client/pages/dictionary/dictionary_utils";
import { DictionarySearch } from "@/web/client/pages/dictionary/search/dictionary_search";
import {
  DictInfo,
  DictsFusedResponse,
} from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { EntryOutline } from "@/common/dictionaries/dict_result";
import {
  ContentBox,
  DictAttribution,
} from "@/web/client/pages/dictionary/sections";
import {
  TableOfContentsV2,
  jumpToSection,
} from "@/web/client/pages/dictionary/table_of_contents_v2";
import { FullDictChip } from "@/web/client/pages/dictionary/dict_chips";
import { QuickNavMenu } from "@/web/client/pages/dictionary/quick_nav";
import { TitleContext } from "../../components/title";
import { GlobalSettingsContext } from "@/web/client/components/global_flags";
import { getCommitHash } from "@/web/client/define_vars";
import { SectionLinkTooltip } from "@/web/client/pages/tooltips";

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

async function fetchEntry(
  input: string,
  experimentalMode: boolean,
  singleArticle: boolean
) {
  const parts = input.split(",");
  const dictParts = parts.slice(1).map((part) => part.replace("n", "&"));
  const dicts =
    parts.length > 1
      ? LatinDict.AVAILABLE.filter((dict) => dictParts.includes(dict.key)).map(
          (dict) => dict.key
        )
      : LatinDict.AVAILABLE.map((dict) => dict.key);
  const result = callApiFull(DictsFusedApi, {
    query: parts[0],
    dicts,
    mode: singleArticle ? 2 : experimentalMode ? 1 : 0,
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
  hash?: string
): EntriesByDict[] {
  const result: EntriesByDict[] = [];
  for (const dictKey in response) {
    const rawEntries = response[dictKey];
    const entries = rawEntries.map((e, i) => ({
      element: xmlNodeToJsx(e.entry, hash, sectionRef),
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

export function DictionaryViewV2(props?: {
  /** Whether the dictionary is embedded in another view. */
  embedded?: boolean;
  /** An initial query, if any. */
  initial?: string;
}) {
  const [state, setState] = React.useState<DictState>("Landing");
  const [entries, setEntries] = React.useState<EntriesByDict[]>([]);
  const [dictsToUse, setDictsToUse] = React.useState<DictInfo[]>(
    SearchSettings.retrieve()
  );

  const sectionRef = React.useRef<HTMLElement>(null);
  const tocRef = React.useRef<HTMLElement>(null);
  const entriesRef = React.useRef<HTMLDivElement>(null);
  const scrollTopRef = React.useRef<HTMLDivElement>(null);

  const settings = React.useContext(GlobalSettingsContext);
  const nav = React.useContext(RouteContext);
  const title = React.useContext(TitleContext);
  const theme = useTheme();
  const isEmbedded = props?.embedded === true;
  const isSmall =
    isEmbedded || useMediaQuery(theme.breakpoints.down("md"), noSsr);
  const idSearch = nav.route.idSearch === true;

  function fetchAndDisplay(query: string) {
    setState("Loading");
    const serverResult = fetchEntry(
      query,
      settings.data.experimentalMode === true ||
        nav.route.experimentalSearch === true,
      idSearch
    );
    serverResult.then((newResults) => {
      if (newResults === null) {
        setState("Error");
        return;
      }
      const serverCommit = newResults.metadata?.commit;
      const clientCommit = getCommitHash();
      if (
        serverCommit !== undefined &&
        clientCommit !== "undefined" &&
        serverCommit !== clientCommit
      ) {
        location.reload();
        return;
      }

      const allEntries = getEntriesByDict(
        newResults.data,
        sectionRef,
        nav.route.hash
      );
      flushSync(() => {
        setEntries(allEntries);
        const numEntries = allEntries.reduce((s, c) => s + c.entries.length, 0);
        setState(numEntries === 0 ? "No Results" : "Results");
      });
      const scrollElement = sectionRef.current || scrollTopRef.current;
      const scrollType =
        nav.route.internalSource === true
          ? SCROLL_JUMP
          : scrollElement === scrollTopRef.current
          ? SCROLL_SMOOTH
          : SCROLL_JUMP;
      scrollElement?.scrollIntoView(scrollType);
    });
  }

  React.useEffect(() => {
    const query = props?.embedded === true ? props?.initial : nav.route.query;
    if (query === undefined) {
      return;
    }
    fetchAndDisplay(query);
  }, [nav.route.query, props?.initial]);

  React.useEffect(() => {
    const filteredEntries = entries.filter(
      (entry) => entry.outlines.length > 0
    );
    if (!(state === "Results" && filteredEntries.length > 0)) {
      title.setCurrentDictWord("");
    } else {
      title.setCurrentDictWord(filteredEntries[0].outlines[0].mainKey);
    }
  }, [state, entries]);

  function SearchBar(props: {
    maxWidth: "md" | "lg" | "xl";
    marginLeft?: "auto" | "0";
    id?: string;
    className?: string;
  }) {
    if (isEmbedded) {
      return <></>;
    }
    return (
      <Container
        maxWidth={props.maxWidth}
        disableGutters={true}
        ref={scrollTopRef}
        sx={{ marginLeft: props.marginLeft || "auto" }}
        id={props.id}
        className={props.className}
      >
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

  function ToEntryButton(props: { outline: EntryOutline }) {
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
        onClick={() => jumpToSection(props.outline.mainSection.sectionId)}
      >
        <OpenInNewIcon
          sx={{
            marginBottom: "-0.1em",
            marginRight: "-0.1em",
            fontSize: "0.8rem",
            paddingLeft: "0.1em",
          }}
        />
        <span dangerouslySetInnerHTML={{ __html: label }} />
      </span>
    );
  }

  function SummarySection() {
    const numEntries = entries.reduce((s, c) => s + c.entries.length, 0);
    if (idSearch) {
      return <></>;
    }
    return (
      <ContentBox isSmall={isSmall} id="DictResultsSummary">
        <>
          <div ref={props?.embedded ? scrollTopRef : undefined}>
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
                      />
                    </span>
                  ))}
                </div>
              ))}
        </>
      </ContentBox>
    );
  }

  function HelpSection(props: { id?: string; className?: string }) {
    return (
      <ContentBox
        key="helpSection"
        isSmall={isSmall}
        id={props.id}
        className={props.className}
      >
        <div style={{ fontSize: 14, lineHeight: "normal" }}>
          {xmlNodeToJsx(HELP_ENTRY)}
        </div>
      </ContentBox>
    );
  }

  function LoadingMessage() {
    return (
      <ContentBox isSmall={isSmall}>
        <span>Loading entries, please wait ... </span>
      </ContentBox>
    );
  }

  function articleLinkButton(text: string) {
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
          }}
        >
          <LinkIcon
            sx={{
              marginBottom: "-0.2em",
              marginRight: "-0.2em",
              paddingLeft: "0.2em",
              paddingRight: "0.4em",
            }}
          />
          {`${text}`}
        </span>
      );
    }
    return React.forwardRef<HTMLElement>(senseForwardedNode);
  }

  function SingleDictSection(props: { data: EntriesByDict }) {
    if (props.data.entries.length === 0) {
      return <></>;
    }
    return (
      <>
        {props.data.entries.map((entry, i) => (
          <ContentBox key={entry.key} isSmall={isSmall} id={entry.key}>
            <>
              {entry.inflections && (
                <InflectionDataSection inflections={entry.inflections} />
              )}
              <div style={{ marginBottom: 5, marginTop: 8 }}>
                <span>
                  <SectionLinkTooltip
                    forwarded={articleLinkButton(
                      props.data.outlines[i].mainKey
                    )}
                    id={props.data.outlines[i].mainSection.sectionId}
                    forArticle={true}
                  />
                  <FullDictChip label={props.data.name} />
                </span>
              </div>
              {entry.element}
            </>
          </ContentBox>
        ))}
        <DictAttribution isSmall={isSmall} dictKey={props.data.dictKey} />
      </>
    );
  }

  function DictionaryEntries() {
    return (
      <>
        {entries.map((entry) => (
          <SingleDictSection
            data={entry}
            key={`${entry.dictKey}EntrySection`}
          />
        ))}
      </>
    );
  }

  function TableOfContents() {
    return (
      <>
        {entries.map((entry) => (
          <TableOfContentsV2
            dictKey={entry.dictKey}
            outlines={entry.outlines}
            isSmall={isSmall}
            tocRef={tocRef}
            key={entry.dictKey + "ToC"}
          />
        ))}
      </>
    );
  }

  function OneColumnLayout(props: { Content: JSX.Element }) {
    return (
      <Container maxWidth="lg">
        <SearchBar
          maxWidth="lg"
          id={"SearchBox"}
          className={QUICK_NAV_ANCHOR}
        />
        {props.Content}
        <Footer id={"Footer"} className={QUICK_NAV_ANCHOR} />
      </Container>
    );
  }

  function TwoColumnLayout(props: {
    SidebarContent: JSX.Element;
    MainContent: JSX.Element;
  }) {
    return (
      <Container maxWidth="xl" sx={{ minHeight: window.innerHeight }}>
        <Stack direction="row" spacing={0} justifyContent="left">
          <div style={TOC_SIDEBAR_STYLE}>{props.SidebarContent}</div>
          <div style={{ maxWidth: "10000px" }}>
            <SearchBar maxWidth="md" marginLeft="0" />
            {props.MainContent}
            <HorizontalPlaceholder />
            <Footer />
          </div>
        </Stack>
      </Container>
    );
  }

  function ResponsiveLayout(props: {
    oneCol?: JSX.Element;
    twoColSide?: JSX.Element;
    twoColMain?: JSX.Element;
  }) {
    return isSmall ? (
      <OneColumnLayout Content={props.oneCol || <></>} />
    ) : (
      <TwoColumnLayout
        SidebarContent={props.twoColSide || <></>}
        MainContent={props.twoColMain || <></>}
      />
    );
  }

  if (state === "Landing") {
    return <ResponsiveLayout />;
  }

  if (state === "Error") {
    const errorContent = <ErrorContent isSmall={isSmall} />;
    return <ResponsiveLayout oneCol={errorContent} twoColMain={errorContent} />;
  }

  if (state === "No Results") {
    const noResults = <NoResultsContent isSmall={isSmall} dicts={dictsToUse} />;
    return <ResponsiveLayout oneCol={noResults} twoColMain={noResults} />;
  }

  if (state === "Loading") {
    return (
      <ResponsiveLayout
        oneCol={<LoadingMessage />}
        twoColMain={<LoadingMessage />}
      />
    );
  }

  return (
    <ResponsiveLayout
      oneCol={
        <>
          {!props?.embedded &&
            ReactDOM.createPortal(<QuickNavMenu />, document.body)}
          <HelpSection id={"HelpSection"} className={QUICK_NAV_ANCHOR} />
          <div id={"Toc"} className={QUICK_NAV_ANCHOR}>
            <SummarySection />
            <TableOfContents />
          </div>
          <div ref={entriesRef}>
            <DictionaryEntries />
          </div>
        </>
      }
      twoColSide={<TableOfContents />}
      twoColMain={
        <>
          <HelpSection />
          <SummarySection />
          <DictionaryEntries />
        </>
      }
    />
  );
}
