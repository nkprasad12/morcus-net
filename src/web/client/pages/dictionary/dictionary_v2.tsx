import TocIcon from "@mui/icons-material/Toc";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
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
  SCROLL_JUMP,
  SCROLL_SMOOTH,
  SearchSettings,
  xmlNodeToJsx,
} from "@/web/client/pages/dictionary/dictionary_utils";
import {
  DictChip,
  DictionarySearch,
} from "@/web/client/pages/dictionary/search/dictionary_search";
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
import { TableOfContentsV2 } from "@/web/client/pages/dictionary/table_of_contents_v2";
import Typography from "@mui/material/Typography";

export const ERROR_STATE_MESSAGE =
  "Lookup failed. Please check your internet connection and try again." +
  " If the issue persists, contact Mórcus.";
export const NO_RESULTS_MESSAGE =
  "No results found. If applicable, try enabling another " +
  +"dictionary in settings.";

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

function JumpToNextButton(props: { onClick: () => any }) {
  return (
    <ArrowDownwardIcon
      onClick={props.onClick}
      sx={{
        position: "sticky",
        float: "right",
        right: "4%",
        bottom: "2%",
        fontSize: "1.75rem",
        borderRadius: 1,
        backgroundColor: Solarized.base2 + "80",
        color: Solarized.base1 + "80",
      }}
      aria-label="jump to entry"
    />
  );
}

function JumpToMenuButton(props: { onClick: () => any }) {
  return (
    <TocIcon
      onClick={props.onClick}
      fontSize="large"
      sx={{
        position: "sticky",
        float: "right",
        right: "4%",
        bottom: "2%",
        borderRadius: 2,
        backgroundColor: Solarized.base2 + "D0",
        color: Solarized.base1 + "D0",
      }}
      aria-label="jump to outline"
    />
  );
}

function NoResultsContent(props: { isSmall: boolean; dicts: DictInfo[] }) {
  const labels =
    props.dicts.length > 0 ? props.dicts.map((d) => d.key) : ["None"];
  return (
    <ContentBox isSmall={props.isSmall}>
      <>
        <div>{NO_RESULTS_MESSAGE}</div>
        <div>
          Enabled dictionaries:{" "}
          {labels.map((label) => (
            <DictChip label={label} key={label} />
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
        const numEntries = allEntries.reduce(
          (sum, current) => sum + current.entries.length,
          0
        );
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
  }) {
    return (
      <Container
        maxWidth={props.maxWidth}
        disableGutters={true}
        ref={searchBarRef}
        sx={{ marginLeft: props.marginLeft || "auto" }}
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

  function HelpSection() {
    return (
      <ContentBox key="helpSection" isSmall={isSmall}>
        <div style={{ fontSize: 16, lineHeight: "normal" }}>
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
          <ContentBox key={entry.key} isSmall={isSmall}>
            <>
              <div style={{ marginBottom: 10 }}>
                <Typography
                  component={"span"}
                  style={{
                    whiteSpace: "pre-wrap",
                    borderRadius: 4,
                    color: Solarized.base03 + "60",
                    backgroundColor: Solarized.base2 + "60",
                    fontWeight: "bold",
                    padding: 4,
                    paddingLeft: 6,
                    paddingRight: 6,
                  }}
                >
                  {props.data.name}
                </Typography>
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
        <SearchBar maxWidth="lg" />
        {props.Content}
        <Footer />
      </Container>
    );
  }

  function TwoColumnLayout(props: {
    SidebarContent: JSX.Element;
    MainContent: JSX.Element;
  }) {
    return (
      <Container maxWidth="xl" sx={{ minHeight: window.innerHeight }}>
        <Stack direction="row" spacing={1} justifyContent="left">
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
          <HelpSection />
          <div>
            <JumpToNextButton
              onClick={() => entriesRef.current?.scrollIntoView(SCROLL_JUMP)}
            />
            <TableOfContents />
          </div>
          <div ref={entriesRef}>
            <DictionaryEntries />
            <JumpToMenuButton
              onClick={() => tocRef.current?.scrollIntoView(SCROLL_JUMP)}
            />
          </div>
        </>
      }
      twoColSide={<TableOfContents />}
      twoColMain={
        <>
          <HelpSection />
          <DictionaryEntries />
        </>
      }
    />
  );
}