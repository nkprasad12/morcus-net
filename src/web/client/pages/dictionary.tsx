import LinkIcon from "@mui/icons-material/Link";
import TocIcon from "@mui/icons-material/Toc";
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
import {
  ClickAwayListener,
  Divider,
  IconButton,
  SxProps,
  Tooltip,
} from "@mui/material";
import { AutocompleteCache } from "./autocomplete_cache";
import { Navigation, RouteContext } from "../components/router";
import { flushSync } from "react-dom";
import { checkPresent } from "@/common/assert";
import { DictsLsApi } from "@/web/utils/rpc/routes";
import { callApi } from "@/web/utils/rpc/client_rpc";

type Placement = "top-start" | "right";
const SCROLL_OPTIONS: ScrollIntoViewOptions = {
  behavior: "smooth",
  block: "start",
};
const ERROR_MESSAGE = new XmlNode(
  "span",
  [],
  ["Failed to fetch the entry. Please try again later."]
);
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
  "p",
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
      "Please wait - searching for matching entries on the server. " +
        "Contact Mórcus if this takes more than a few seconds.",
    ]
  )
);

export function ClickableTooltip(props: {
  titleText: string | JSX.Element;
  className: string | undefined;
  ChildFactory: React.ForwardRefExoticComponent<
    Omit<any, "ref"> & React.RefAttributes<any>
  >;
  placement?: Placement;
  tooltipSx?: SxProps;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Tooltip
        title={
          <Typography
            component={typeof props.titleText === "string" ? "p" : "div"}
          >
            {props.titleText}
          </Typography>
        }
        className={props.className}
        placement={props.placement || "top-start"}
        disableFocusListener
        disableHoverListener
        disableTouchListener
        describeChild={false}
        onClose={() => setOpen(false)}
        open={open}
        arrow
        componentsProps={{
          tooltip: {
            sx: props.tooltipSx,
          },
        }}
      >
        <props.ChildFactory onClick={() => setOpen(!open)} />
      </Tooltip>
    </ClickAwayListener>
  );
}

export function SectionLinkTooltip(props: {
  className: string;
  forwarded: React.ForwardRefExoticComponent<
    Omit<any, "ref"> & React.RefAttributes<any>
  >;
  senseId: string;
}) {
  function onClick() {
    const chunks = window.location.href.split("#");
    navigator.clipboard.writeText(`${chunks[0]}#${props.senseId}`);
  }

  return (
    <ClickableTooltip
      titleText={
        <Typography
          onClick={onClick}
          // TODO: Why do we need both here?
          onTouchStart={onClick}
          sx={{ cursor: "pointer" }}
        >
          <IconButton
            size="small"
            aria-label="copy link"
            aria-haspopup="false"
            color="info"
          >
            <LinkIcon />
          </IconButton>
          <span>Copy section link</span>
        </Typography>
      }
      className={props.className}
      ChildFactory={props.forwarded}
      placement="top-start"
      tooltipSx={{
        backgroundColor: Solarized.mint,
        color: Solarized.base01,
        border: `2px solid ${Solarized.base01}`,
      }}
    />
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

async function fetchEntry(input: string): Promise<XmlNode[]> {
  try {
    return await callApi(DictsLsApi, input);
  } catch (e) {
    console.debug(e);
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
  const theme = useTheme();

  const isSmall = useMediaQuery(theme.breakpoints.down("md"), noSsr);

  const nav = React.useContext(RouteContext);
  const sectionRef = React.useRef<HTMLElement>(null);
  const tocRef = React.useRef<HTMLElement>(null);

  function ContentBox(props: {
    children: JSX.Element;
    contentKey?: string;
    contentRef?: React.RefObject<HTMLElement>;
  }) {
    return (
      <>
        <Box
          sx={{
            padding: 1,
            ml: isSmall ? 1 : 3,
            mr: isSmall ? 1 : 3,
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
      fetchEntry(nav.route.query).then((newEntries) => {
        flushSync(() => {
          const jsxEntries = newEntries.map((e, i) => ({
            element: xmlNodeToJsx(e, nav.route.hash, sectionRef),
            key: e.getAttr("id") || `${i}`,
          }));
          setEntries(jsxEntries);
        });
        sectionRef.current?.scrollIntoView(SCROLL_OPTIONS);
      });
    }
  }, [nav.route.query]);

  function SearchBar() {
    return (
      <Container maxWidth="md" disableGutters={true}>
        <SearchBox input={nav.route.query || ""} smallScreen={isSmall} />
      </Container>
    );
  }

  function TableOfContents() {
    return (
      <>
        {entries.length > 0 && (
          <ContentBox key="tableOfContents" contentRef={tocRef}>
            <div style={{ fontSize: 16, lineHeight: "normal" }}>
              {entries.length > 1 && (
                <>
                  <div>Found {entries.length} results.</div>
                  <br></br>
                </>
              )}
              <div>{"this ".repeat(500)}</div>
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
          <SearchBar />
          <SearchHeader />
          <TableOfContents />
          {entries.length > 0 && (
            <TocIcon
              onClick={() => tocRef.current?.scrollIntoView(SCROLL_OPTIONS)}
              fontSize="large"
              sx={{
                position: "fixed",
                float: "right",
                right: "4%",
                bottom: "2%",
                borderRadius: 2,
                backgroundColor: Solarized.base2 + "A0",
                color: Solarized.base1 + "A0",
              }}
            />
          )}
          <DictionaryEntries />
        </Container>
      );
    }

    if (entries.length === 0) {
      return (
        <Container maxWidth="xl">
          <SearchBar />
        </Container>
      );
    }

    return (
      <Container maxWidth="xl">
        <Stack direction="row" spacing={0} justifyContent="center">
          <div
            style={{
              position: "sticky",
              zIndex: 1,
              top: 0,
              left: 0,
              marginTop: 10,
              overflow: "auto",
              maxHeight: window.innerHeight - 40,
              maxWidth: "25%",
              minWidth: "250px",
            }}
          >
            <TableOfContents />
          </div>
          <div style={{ maxWidth: "none" }}>
            <SearchBar />
            <SearchHeader />
            <DictionaryEntries />
          </div>
        </Stack>
      </Container>
    );
  }

  return <DictionaryPage />;
}
