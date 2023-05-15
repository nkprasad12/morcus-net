import { lsCall } from "@/web/api_routes";
import LinkIcon from "@mui/icons-material/Link";
import Autocomplete from "@mui/material/Autocomplete";
import Container from "@mui/material/Container";
import { useTheme } from "@mui/material/styles";
import TextField from "@mui/material/TextField";
import useMediaQuery from "@mui/material/useMediaQuery";
import Box from "@mui/system/Box";
import React, { MutableRefObject } from "react";

import { Solarized } from "@/web/client/colors";
import Typography from "@mui/material/Typography";
import { parseEntries, XmlNode } from "@/common/lewis_and_short/xml_node";
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

type Placement = "top-start" | "right";

const HELP_ENTRY = new XmlNode(
  "div",
  [],
  [
    new XmlNode(
      "span",
      [
        ["class", "lsHover"],
        ["title", "Click to dismiss"],
      ],
      ["Highlighted words"]
    ),
    " are abbreviated in the original text - click on them to learn more. " +
      "Click on section headers (like ",
    new XmlNode(
      "span",
      [
        ["class", "lsSenseBullet"],
        ["senseid", "tutorialExample"],
      ],
      [" A. "]
    ),
    ") to link directly to a particular section.",
    new XmlNode(
      "p",
      [],
      [
        "If you find bugs, typos, or other issues, please report them " +
          "by clicking on the flag icon in the top navigation bar.",
      ]
    ),
  ]
);

const LOADING_ENTRY = xmlNodeToJsx(
  new XmlNode("div", [], ["Please wait - loading entries"])
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
  const response = await fetch(`${location.origin}${lsCall(input)}`);
  if (!response.ok) {
    return [
      new XmlNode(
        "span",
        [],
        ["Failed to fetch the entry. Please try again later."]
      ),
    ];
  }
  const rawText = await response.text();
  return parseEntries(JSON.parse(rawText));
}

function SearchBox(props: {
  input: string;
  onNewEntries: (entries: XmlNode[]) => any;
  onLoading: () => any;
  smallScreen: boolean;
}) {
  const [inputState, setInputState] = React.useState<string>(props.input);
  const [options, setOptions] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const nav = React.useContext(RouteContext);

  async function onEnter(searchTerm: string) {
    if (searchTerm.length === 0) {
      return;
    }
    Navigation.query(nav, searchTerm);
    props.onLoading();
    props.onNewEntries(await fetchEntry(searchTerm));
  }

  return (
    <Autocomplete
      freeSolo
      disableClearable
      loading={loading}
      loadingText={"Loading options..."}
      options={options}
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

export function Dictionary() {
  const [entries, setEntries] = React.useState<ElementAndKey[]>([]);
  const theme = useTheme();
  const smallScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const nav = React.useContext(RouteContext);
  const sectionRef = React.useRef<HTMLElement | null>(null);

  function ContentBox(props: { children: JSX.Element; contentKey?: string }) {
    return (
      <>
        <Box
          sx={{
            padding: 1,
            ml: smallScreen ? 1 : 3,
            mr: smallScreen ? 1 : 3,
            mt: 1,
            mb: 2,
            borderColor: Solarized.base2,
          }}
          key={props.contentKey}
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
        <Divider sx={{ ml: smallScreen ? 1 : 3, mr: smallScreen ? 1 : 3 }} />
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
        sectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  }, [nav.route.query]);

  return (
    <Container maxWidth="lg">
      <SearchBox
        input={nav.route.query || ""}
        onNewEntries={(newEntries) => {
          const jsxEntries = newEntries.map((e, i) => ({
            element: xmlNodeToJsx(e, nav.route.hash, sectionRef),
            key: e.getAttr("id") || `${i}`,
          }));
          setEntries(jsxEntries);
        }}
        onLoading={() =>
          setEntries([{ element: LOADING_ENTRY, key: "LOADING_ENTRY" }])
        }
        smallScreen={smallScreen}
      />
      {entries.length > 0 && (
        <ContentBox key="searchHeader">
          <div style={{ fontSize: 16, lineHeight: "normal" }}>
            {entries.length > 1 && (
              <>
                <div>Found {entries.length} results.</div>
                <br></br>
              </>
            )}
            {xmlNodeToJsx(HELP_ENTRY)}
          </div>
        </ContentBox>
      )}
      {entries.map((entry) => (
        <ContentBox key={entry.key}>{entry.element}</ContentBox>
      ))}
      {entries.length > 0 && (
        <ContentBox key="attributionBox">
          <span style={{ fontSize: 15, lineHeight: "normal" }}>
            Results are taken from a digitization of Lewis & Short kindly
            provided by <a href="https://github.com/PerseusDL">Perseus</a> under
            a{" "}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/">
              CC BY-SA 4.0
            </a>{" "}
            license.
          </span>
        </ContentBox>
      )}
    </Container>
  );
}
