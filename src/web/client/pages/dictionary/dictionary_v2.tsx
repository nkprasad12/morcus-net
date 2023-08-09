import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import React, { CSSProperties } from "react";

import { Solarized } from "@/web/client/colors";
import { RouteContext } from "@/web/client/components/router";
import { flushSync } from "react-dom";
import { DictsFusedApi } from "@/web/api_routes";
import { callApi } from "@/web/utils/rpc/client_rpc";
import { Footer } from "@/web/client/components/footer";
import {
  ElementAndKey,
  HELP_ENTRY,
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

export const ERROR_STATE_MESSAGE =
  "Lookup failed. Please check your internet connection and try again." +
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

async function fetchEntry(input: string): Promise<DictsFusedResponse | null> {
  const parts = input.split(",");
  const dictParts = parts.slice(1).map((part) => part.replace("n", "&"));
  const dicts =
    parts.length > 1
      ? LatinDict.AVAILABLE.filter((dict) => dictParts.includes(dict.key)).map(
          (dict) => dict.key
        )
      : LatinDict.AVAILABLE.map((dict) => dict.key);
  const result = callApi(DictsFusedApi, {
    query: parts[0],
    dicts,
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
    <span
      key={"horizonatalSpacePlaceholder"}
      style={{ color: Solarized.base3, cursor: "default" }}
    >
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

export function DictionaryViewV2() {
  const [state, setState] = React.useState<DictState>("Landing");
  const [entries, setEntries] = React.useState<EntriesByDict[]>([]);
  const [dictsToUse, setDictsToUse] = React.useState<DictInfo[]>(
    SearchSettings.retrieve()
  );

  const sectionRef = React.useRef<HTMLElement>(null);
  const tocRef = React.useRef<HTMLElement>(null);
  const entriesRef = React.useRef<HTMLDivElement>(null);
  const searchBarRef = React.useRef<HTMLDivElement>(null);

  const nav = React.useContext(RouteContext);
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down("md"), noSsr);

  React.useEffect(() => {
    if (nav.route.query === undefined) {
      return;
    }
    setState("Loading");
    fetchEntry(nav.route.query).then((newResults) => {
      if (newResults === null) {
        setState("Error");
        return;
      }
      const allEntries = getEntriesByDict(
        newResults,
        sectionRef,
        nav.route.hash
      );
      flushSync(() => {
        setEntries(allEntries);
        const numEntries = allEntries.reduce((s, c) => s + c.entries.length, 0);
        setState(numEntries === 0 ? "No Results" : "Results");
      });
      const scrollElement = sectionRef.current || searchBarRef.current;
      const scrollType =
        scrollElement === searchBarRef.current ? SCROLL_SMOOTH : SCROLL_JUMP;
      scrollElement?.scrollIntoView(scrollType);
    });
  }, [nav.route.query]);

  function SearchBar(props: {
    maxWidth: "md" | "lg" | "xl";
    marginLeft?: "auto" | "0";
    id?: string;
  }) {
    return (
      <Container
        maxWidth={props.maxWidth}
        disableGutters={true}
        ref={searchBarRef}
        sx={{ marginLeft: props.marginLeft || "auto" }}
        id={props.id}
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
        {` ${props.outline.mainOrth}`}
      </span>
    );
  }

  function SummarySection() {
    const numEntries = entries.reduce((s, c) => s + c.entries.length, 0);
    return (
      <ContentBox isSmall={isSmall} id="DictResultsSummary">
        <>
          <div>
            Found {numEntries} {numEntries > 1 ? "entries" : "entry"}
          </div>
          {numEntries > 1 &&
            entries
              .filter((entry) => entry.outlines.length > 0)
              .map((entry) => (
                <div key={entry.dictKey + "SummarySection"}>
                  <FullDictChip label={entry.name} />{" "}
                  {entry.outlines.map((outline) => (
                    <ToEntryButton
                      outline={outline}
                      key={outline.mainSection.sectionId}
                    />
                  ))}
                </div>
              ))}
        </>
      </ContentBox>
    );
  }

  function HelpSection(props: { id?: string }) {
    return (
      <ContentBox key="helpSection" isSmall={isSmall} id={props.id}>
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

  function SingleDictSection(props: { data: EntriesByDict }) {
    if (props.data.entries.length === 0) {
      return <></>;
    }
    return (
      <>
        {props.data.entries.map((entry) => (
          <ContentBox
            key={entry.key}
            isSmall={isSmall}
            id={QUICK_NAV_ANCHOR + entry.key}
          >
            <>
              <div style={{ marginBottom: 10 }}>
                <FullDictChip label={props.data.name} />
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
        <SearchBar maxWidth="lg" id={QUICK_NAV_ANCHOR + "SearchBox"} />
        {props.Content}
        <Footer id={QUICK_NAV_ANCHOR + "Footer"} />
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
          {/* {ReactDOM.createPortal(<QuickNavMenu />, document.body)} */}
          <HelpSection id={QUICK_NAV_ANCHOR + "HelpSection"} />
          <div id={QUICK_NAV_ANCHOR + "Toc"}>
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
