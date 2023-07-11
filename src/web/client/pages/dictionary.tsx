import TocIcon from "@mui/icons-material/Toc";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import Autocomplete from "@mui/material/Autocomplete";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import { useTheme } from "@mui/material/styles";
import TextField from "@mui/material/TextField";
import useMediaQuery from "@mui/material/useMediaQuery";
import Box from "@mui/system/Box";
import React, { MutableRefObject } from "react";

import { Solarized } from "@/web/client/colors";
import Typography from "@mui/material/Typography";
import { XmlNode } from "@/common/lewis_and_short/xml_node";
import { Divider } from "@mui/material";
import { AutocompleteCache } from "./autocomplete_cache";
import { Navigation, RouteContext } from "../components/router";
import { flushSync } from "react-dom";
import { checkPresent } from "@/common/assert";
import { DictsLsApi } from "@/web/api_routes";
import { callApi } from "@/web/utils/rpc/client_rpc";
import { LsOutline, LsResult } from "@/web/utils/rpc/ls_api_result";
import { getBullet } from "@/common/lewis_and_short/ls_outline";
import { ClickableTooltip, SectionLinkTooltip } from "./tooltips";

const SCROLL_JUMP: ScrollIntoViewOptions = {
  behavior: "auto",
  block: "start",
};
const SCROLL_SMOOTH: ScrollIntoViewOptions = {
  behavior: "smooth",
  block: "start",
};
const ERROR_MESSAGE = {
  entry: new XmlNode(
    "span",
    [],
    ["Failed to fetch the entry. Please try again later."]
  ),
};
const HIGHLIGHT_HELP = new XmlNode(
  "div",
  [],
  [
    "Click on ",
    new XmlNode(
      "span",
      [
        ["class", "lsHover"],
        ["title", "Click to dismiss"],
      ],
      ["underlined"]
    ),
    " text for more details. ",
  ]
);
const BUG_HELP = new XmlNode(
  "div",
  [],
  [
    "Please report typos or other bugs " +
      "by clicking on the flag icon in the top bar.",
  ]
);
const BULLET_HELP = new XmlNode(
  "div",
  [],
  [
    "Click on sections buttons (like ",
    new XmlNode(
      "span",
      [
        ["class", "lsSenseBullet"],
        ["senseid", "tutorialExample"],
      ],
      [" A. "]
    ),
    ") to link directly to that section.",
  ]
);
const HELP_ENTRY = new XmlNode(
  "div",
  [],
  [HIGHLIGHT_HELP, BULLET_HELP, BUG_HELP]
);

const LOADING_ENTRY = xmlNodeToJsx(
  new XmlNode(
    "div",
    [],
    [
      "Please wait - checking for results." +
        "Dedit oscula nato non iterum repetenda suo ".repeat(3),
    ]
  )
);

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

export function xmlNodeToJsx(
  root: XmlNode,
  highlightId?: string,
  sectionRef?: MutableRefObject<HTMLElement | null>,
  key?: string
): JSX.Element {
  const children = root.children.map((child, i) => {
    if (typeof child === "string") {
      return child;
    }
    return xmlNodeToJsx(
      child,
      highlightId,
      sectionRef,
      child.getAttr("id") || `${i}`
    );
  });
  const props: { [propKey: string]: any } = {};
  if (key !== undefined) {
    props.key = key;
  }
  let titleText: string | undefined = undefined;
  let className: string | undefined = undefined;
  for (const [attrKey, value] of root.attrs) {
    if (attrKey === "class") {
      className = value;
      props.className = value;
      continue;
    }
    if (attrKey === "title") {
      titleText = value;
      continue;
    }
    props[attrKey] = value;
  }

  if (titleText !== undefined) {
    function hoverForwardedNode(forwardProps: any, forwardRef: any) {
      const allProps = { ...props, ...forwardProps };
      allProps["ref"] = forwardRef;
      return React.createElement(root.name, allProps, children);
    }
    const ForwardedNode = React.forwardRef<HTMLElement>(hoverForwardedNode);
    return (
      <ClickableTooltip
        titleText={titleText}
        className={className}
        ChildFactory={ForwardedNode}
        key={key}
      />
    );
  } else if (className === "lsSenseBullet") {
    function senseForwardedNode(forwardProps: any, forwardRef: any) {
      const allProps = { ...props, ...forwardProps };
      allProps["ref"] = forwardRef;
      return React.createElement(root.name, allProps, children);
    }
    const ForwardedNode = React.forwardRef<HTMLElement>(senseForwardedNode);
    return (
      <SectionLinkTooltip
        forwarded={ForwardedNode}
        className={className}
        senseId={checkPresent(
          root.getAttr("senseid"),
          "lsSenseBullet must have senseid!"
        )}
        key={key}
      />
    );
  } else {
    if (root.getAttr("id") === highlightId && highlightId !== undefined) {
      props["className"] = "highlighted";
      props["ref"] = sectionRef!;
    }
    return React.createElement(root.name, props, children);
  }
}

async function fetchEntry(input: string): Promise<LsResult[]> {
  try {
    return await callApi(DictsLsApi, input);
  } catch (e) {
    return [ERROR_MESSAGE];
  }
}

function SearchBox(props: { input: string; smallScreen: boolean }) {
  const [inputState, setInputState] = React.useState<string>(props.input);
  const [options, setOptions] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const nav = React.useContext(RouteContext);

  async function onEnter(searchTerm: string) {
    if (searchTerm.length === 0) {
      return;
    }
    Navigation.query(nav, searchTerm);
  }

  return (
    <Autocomplete
      freeSolo
      disableClearable
      loading={loading}
      loadingText={"Loading options..."}
      options={options}
      filterOptions={(x) => x}
      sx={{
        padding: 1,
        ml: props.smallScreen ? 1 : 2,
        mr: props.smallScreen ? 1 : 2,
        mt: 2,
        mb: 1,
      }}
      onInputChange={async (event, value) => {
        setInputState(value);
        if (["click", "keydown"].includes(event.type)) {
          onEnter(value);
          return;
        }
        setLoading(true);
        const prefixOptions = await AutocompleteCache.get().getOptions(value);
        setOptions(prefixOptions.slice(0, 200));
        setLoading(false);
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Search for a word"
          InputLabelProps={{
            style: { color: Solarized.base1 },
          }}
          onKeyPress={(e) => {
            if (e.key === "Enter") {
              onEnter(inputState);
            }
          }}
          InputProps={{
            ...params.InputProps,
            type: "search",
          }}
        />
      )}
    />
  );
}

interface ElementAndKey {
  element: JSX.Element;
  key: string;
}

const noSsr = { noSsr: true };

export function Dictionary() {
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
            padding: 1,
            ml: props.ml || (isSmall ? 1 : 3),
            mr: props.mr || (isSmall ? 1 : 3),
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
        <Divider sx={{ ml: isSmall ? 1 : 3, mr: isSmall ? 1 : 3 }} />
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
        <SearchBox input={nav.route.query || ""} smallScreen={isSmall} />
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
            <span style={{ fontSize: 15, lineHeight: "normal" }}>
              Results are taken from a digitization of Lewis & Short kindly
              provided by <a href="https://github.com/PerseusDL">Perseus</a>{" "}
              under a{" "}
              <a href="https://creativecommons.org/licenses/by-sa/4.0/">
                CC BY-SA 4.0
              </a>{" "}
              license.
            </span>
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
        </Container>
      );
    }

    if (entries.length === 0) {
      return (
        <Container maxWidth="xl">
          <SearchBar maxWidth="md" />
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
          </div>
        </Stack>
      </Container>
    );
  }

  return <DictionaryPage />;
}
