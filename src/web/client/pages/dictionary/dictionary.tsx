import TocIcon from "@mui/icons-material/Toc";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import React from "react";

import { Solarized } from "@/web/client/colors";
import { RouteContext } from "@/web/client/components/router";
import { flushSync } from "react-dom";
import { DictsLsApi } from "@/web/api_routes";
import { callApi } from "@/web/utils/rpc/client_rpc";
import { LsOutline, LsResult } from "@/web/utils/rpc/ls_api_result";
import { Footer } from "@/web/client/components/footer";
import {
  ERROR_MESSAGE,
  ElementAndKey,
  HELP_ENTRY,
  LOADING_ENTRY,
  SCROLL_JUMP,
  SCROLL_SMOOTH,
  xmlNodeToJsx,
} from "@/web/client/pages/dictionary/dictionary_utils";
import { GlobalSettingsContext } from "@/web/client/components/global_flags";
import { SearchBox } from "@/web/client/pages/dictionary/search/legacy/parts";
import {
  ContentBox,
  LsAttribution,
} from "@/web/client/pages/dictionary/sections";
import { TableOfContents } from "@/web/client/pages/dictionary/table_of_contents";
import { DictionaryViewV2 } from "@/web/client/pages/dictionary/dictionary_v2";
import { XmlNode } from "@/common/xml_node";

async function fetchEntry(input: string): Promise<LsResult[]> {
  try {
    return await callApi(DictsLsApi, input);
  } catch (e) {
    return [ERROR_MESSAGE];
  }
}

const noSsr = { noSsr: true };

function DictionaryViewV1() {
  const [entries, setEntries] = React.useState<ElementAndKey[]>([]);
  const [outlines, setOutlines] = React.useState<(LsOutline | undefined)[]>([]);

  const sectionRef = React.useRef<HTMLElement>(null);
  const tocRef = React.useRef<HTMLElement>(null);
  const entriesRef = React.useRef<HTMLDivElement>(null);
  const searchBarRef = React.useRef<HTMLDivElement>(null);

  const nav = React.useContext(RouteContext);
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down("md"), noSsr);

  React.useEffect(() => {
    if (nav.route.query !== undefined) {
      setEntries([{ element: LOADING_ENTRY, key: "LOADING_ENTRY" }]);
      fetchEntry(nav.route.query).then((fetchResults) => {
        const newResults =
          fetchResults.length === 0
            ? [
                {
                  entry: new XmlNode(
                    "span",
                    [],
                    [`Could not find entry for ${nav.route.query}`]
                  ),
                },
              ]
            : fetchResults;
        const jsxEntries = newResults.map((e, i) => ({
          element: xmlNodeToJsx(e.entry, nav.route.hash, sectionRef),
          key: e.entry.getAttr("id") || `${i}`,
        }));
        flushSync(() => {
          setEntries(jsxEntries);
          setOutlines(newResults.map((r) => r.outline));
        });
        const scrollElement = sectionRef.current || searchBarRef.current;
        const scrollType =
          scrollElement === searchBarRef.current ? SCROLL_SMOOTH : SCROLL_JUMP;
        scrollElement?.scrollIntoView(scrollType);
      });
    }
  }, [nav.route.query]);

  function SearchBar(props: { maxWidth: "md" | "lg" | "xl" }) {
    return (
      <Container
        maxWidth={props.maxWidth}
        disableGutters={true}
        ref={searchBarRef}
      >
        <SearchBox input={nav.route.query || ""} smallScreen={isSmall} />
      </Container>
    );
  }

  function SearchHeader() {
    return (
      <>
        {entries.length > 0 && (
          <ContentBox key="searchHeader" isSmall={isSmall}>
            <div style={{ fontSize: 16, lineHeight: "normal" }}>
              {xmlNodeToJsx(HELP_ENTRY)}
            </div>
          </ContentBox>
        )}
      </>
    );
  }

  function DictionaryEntries(props: {
    isSmall: boolean;
    entries: ElementAndKey[];
  }) {
    const entries = props.entries;

    return (
      <>
        {entries.map((entry) => (
          <ContentBox key={entry.key} isSmall={props.isSmall}>
            {entry.element}
          </ContentBox>
        ))}
        {entries.length > 0 && <LsAttribution isSmall={props.isSmall} />}
      </>
    );
  }

  function DictionaryPage() {
    if (isSmall) {
      return (
        <Container maxWidth="lg">
          <SearchBar maxWidth="lg" />
          <SearchHeader />
          <div>
            {entries.length > 0 && (
              <ArrowDownwardIcon
                onClick={() => entriesRef.current?.scrollIntoView(SCROLL_JUMP)}
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
            )}
            <TableOfContents
              entries={entries}
              outlines={outlines}
              isSmall={isSmall}
              tocRef={tocRef}
            />
          </div>
          <div ref={entriesRef}>
            <DictionaryEntries isSmall={isSmall} entries={entries} />
            {entries.length > 0 && (
              <TocIcon
                onClick={() => tocRef.current?.scrollIntoView(SCROLL_JUMP)}
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
            )}
          </div>
          <Footer />
        </Container>
      );
    }

    if (entries.length === 0) {
      return (
        <Container maxWidth="xl">
          <SearchBar maxWidth="md" />
          <Footer />
        </Container>
      );
    }

    return (
      <Container maxWidth="xl" sx={{ minHeight: window.innerHeight }}>
        <Stack direction="row" spacing={1} justifyContent="left">
          <div
            style={{
              position: "sticky",
              zIndex: 1,
              top: 0,
              left: 0,
              marginTop: 10,
              overflow: "auto",
              maxHeight: window.innerHeight - 40,
              minWidth: "min(29%, 300px)",
            }}
          >
            <TableOfContents
              entries={entries}
              outlines={outlines}
              isSmall={isSmall}
              tocRef={tocRef}
            />
          </div>
          <div style={{ maxWidth: "10000px" }}>
            <SearchBar maxWidth="xl" />
            <SearchHeader />
            <DictionaryEntries isSmall={isSmall} entries={entries} />
            <span
              key={"horizonatalSpacePlaceholder"}
              style={{ color: Solarized.base3, cursor: "default" }}
            >
              {"pla ceh old er".repeat(20)}
            </span>
            <Footer />
          </div>
        </Stack>
      </Container>
    );
  }

  return <DictionaryPage />;
}

export function DictionaryView() {
  const globalSettings = React.useContext(GlobalSettingsContext);
  return globalSettings.data.experimentalMode === true ? (
    <DictionaryViewV2 />
  ) : (
    <DictionaryViewV1 />
  );
}
