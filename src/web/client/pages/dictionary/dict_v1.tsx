import TocIcon from "@mui/icons-material/Toc";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import Box from "@mui/system/Box";
import React from "react";

import { Solarized } from "@/web/client/colors";
import Typography from "@mui/material/Typography";
import { Divider } from "@mui/material";
import { RouteContext } from "@/web/client/components/router";
import { flushSync } from "react-dom";
import { DictsLsApi } from "@/web/api_routes";
import { callApi } from "@/web/utils/rpc/client_rpc";
import { LsOutline, LsResult } from "@/web/utils/rpc/ls_api_result";
import { getBullet } from "@/common/lewis_and_short/ls_outline";
import { getBuildDate } from "@/web/client/define_vars";
import { Footer } from "@/web/client/components/footer";
import {
  ERROR_MESSAGE,
  HELP_ENTRY,
  LOADING_ENTRY,
  SCROLL_JUMP,
  SCROLL_SMOOTH,
  SelfLink,
  xmlNodeToJsx,
} from "@/web/client/pages/dictionary/dictionary_utils";
import { DictionarySearch } from "@/web/client/pages/dictionary/search/dictionary_search";

async function fetchEntry(input: string): Promise<LsResult[]> {
  try {
    return await callApi(DictsLsApi, input);
  } catch (e) {
    return [ERROR_MESSAGE];
  }
}

function OutlineSection(props: {
  outline: LsOutline | undefined;
  onClick: (section: string) => any;
}) {
  const outline = props.outline;
  if (outline === undefined) {
    return <span>Missing outline data</span>;
  }

  const senses = outline.senses;

  return (
    <div>
      <Divider variant="middle" light={true} sx={{ padding: "5px" }} />
      <br />
      <span onClick={() => props.onClick(outline.mainSection.sectionId)}>
        <span
          className="lsSenseBullet"
          style={{ backgroundColor: Solarized.base01 + "30" }}
        >
          <OpenInNewIcon
            sx={{
              marginBottom: "-0.1em",
              marginRight: "-0.1em",
              fontSize: "0.8rem",
              paddingLeft: "0.1em",
            }}
          />
          {` ${outline.mainOrth}`}
        </span>
        {" " + outline.mainSection.text}
      </span>
      {senses && (
        <ol style={{ paddingLeft: "0em" }}>
          {senses.map((sense) => {
            const header = getBullet(sense.ordinal);
            return (
              <li
                key={sense.sectionId}
                style={{
                  cursor: "pointer",
                  marginBottom: "4px",
                  paddingLeft: `${(sense.level - 1) / 2}em`,
                }}
                onClick={() => props.onClick(sense.sectionId)}
              >
                <span
                  className="lsSenseBullet"
                  style={{ backgroundColor: Solarized.base01 + "30" }}
                >
                  <OpenInNewIcon
                    sx={{
                      marginBottom: "-0.1em",
                      marginRight: "-0.1em",
                      fontSize: "0.8rem",
                      paddingLeft: "0.1em",
                    }}
                  />
                  {` ${header}. `}
                </span>
                <span>{" " + sense.text}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

interface ElementAndKey {
  element: JSX.Element;
  key: string;
}

const noSsr = { noSsr: true };

export function DictionaryView() {
  const [entries, setEntries] = React.useState<ElementAndKey[]>([]);
  const [outlines, setOutlines] = React.useState<(LsOutline | undefined)[]>([]);
  const theme = useTheme();

  const isSmall = useMediaQuery(theme.breakpoints.down("md"), noSsr);

  const nav = React.useContext(RouteContext);
  const sectionRef = React.useRef<HTMLElement>(null);
  const tocRef = React.useRef<HTMLElement>(null);
  const entriesRef = React.useRef<HTMLDivElement>(null);
  const searchBarRef = React.useRef<HTMLDivElement>(null);

  function ContentBox(props: {
    children: JSX.Element;
    contentKey?: string;
    contentRef?: React.RefObject<HTMLElement>;
    ml?: string;
    mr?: string;
  }) {
    return (
      <>
        <Box
          sx={{
            paddingY: 1,
            paddingLeft: isSmall ? 0 : 1,
            ml: props.ml || (isSmall ? 0 : 3),
            mr: props.mr || (isSmall ? 0 : 3),
            mt: 1,
            mb: 2,
            borderColor: Solarized.base2,
          }}
          key={props.contentKey}
          ref={props.contentRef}
        >
          <Typography
            component={"div"}
            style={{
              whiteSpace: "pre-wrap",
              color: Solarized.base02,
            }}
          >
            {props.children}
          </Typography>
        </Box>
        <Divider sx={{ ml: isSmall ? 0 : 3, mr: isSmall ? 0 : 3 }} />
      </>
    );
  }

  React.useEffect(() => {
    if (nav.route.query !== undefined) {
      setEntries([{ element: LOADING_ENTRY, key: "LOADING_ENTRY" }]);
      fetchEntry(nav.route.query).then((newResults) => {
        flushSync(() => {
          const jsxEntries = newResults.map((e, i) => ({
            element: xmlNodeToJsx(e.entry, nav.route.hash, sectionRef),
            key: e.entry.getAttr("id") || `${i}`,
          }));
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
        <DictionarySearch input={nav.route.query || ""} smallScreen={isSmall} />
      </Container>
    );
  }

  function TableOfContents() {
    return (
      <>
        {entries.length > 0 && (
          <ContentBox
            key="tableOfContents"
            contentRef={tocRef}
            ml="0px"
            mr="0px"
          >
            <div style={{ fontSize: 16, lineHeight: "normal" }}>
              <span>
                Found {entries.length} result{entries.length > 1 ? "s" : ""}.
              </span>
              {outlines.map((outline, index) => (
                <OutlineSection
                  key={outline?.mainSection.sectionId || `undefined${index}`}
                  outline={outline}
                  onClick={(section) => {
                    const selected = document.getElementById(section);
                    if (selected === null) {
                      return;
                    }
                    window.scrollTo({
                      behavior: "auto",
                      top: selected.offsetTop,
                    });
                  }}
                />
              ))}
            </div>
          </ContentBox>
        )}
      </>
    );
  }

  function SearchHeader() {
    return (
      <>
        {entries.length > 0 && (
          <ContentBox key="searchHeader">
            <div style={{ fontSize: 16, lineHeight: "normal" }}>
              {xmlNodeToJsx(HELP_ENTRY)}
            </div>
          </ContentBox>
        )}
      </>
    );
  }

  function DictionaryEntries() {
    return (
      <>
        {entries.map((entry) => (
          <ContentBox key={entry.key}>{entry.element}</ContentBox>
        ))}
        {entries.length > 0 && (
          <ContentBox key="attributionBox">
            <div style={{ fontSize: 15, lineHeight: "normal" }}>
              <div>
                Text provided under a CC BY-SA license by Perseus Digital
                Library, <SelfLink to="http://www.perseus.tufts.edu" />, with
                funding from The National Endowment for the Humanities.
              </div>
              <div>
                Data originally from{" "}
                <SelfLink to="https://github.com/PerseusDL/lexica/" />.
              </div>
              <div>
                Data accessed from{" "}
                <SelfLink to="https://github.com/nkprasad12/lexica/" />{" "}
                {getBuildDate()}.
              </div>
            </div>
          </ContentBox>
        )}
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
            <TableOfContents />
          </div>
          <div ref={entriesRef}>
            <DictionaryEntries />
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
            <TableOfContents />
          </div>
          <div style={{ maxWidth: "10000px" }}>
            <SearchBar maxWidth="xl" />
            <SearchHeader />
            <DictionaryEntries />
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
