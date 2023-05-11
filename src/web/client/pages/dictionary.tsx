import { lsCall } from "@/web/api_routes";
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
import { ClickAwayListener, Divider, Tooltip } from "@mui/material";
import { AutocompleteCache } from "./autocomplete_cache";
import { Navigation, RouteContext } from "../components/router";
import { flushSync } from "react-dom";

const HELP_ENTRY = new XmlNode(
  "div",
  [],
  [
    "Dashed words are abbreviated in the original text. Click on them to learn more: ",
    new XmlNode(
      "span",
      [
        ["class", "lsHover"],
        ["title", "Click to dismiss"],
      ],
      ["example"]
    ),
    ". If you find bugs, typos, or other issues, please report them " +
      "by clicking on the flag icon in the top navigation bar",
  ]
);

export function ClickableTooltip(props: {
  titleText: string;
  className: string | undefined;
  ChildFactory: React.ForwardRefExoticComponent<
    Omit<any, "ref"> & React.RefAttributes<any>
  >;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Tooltip
        title={<Typography>{props.titleText}</Typography>}
        className={props.className}
        placement="top-start"
        disableFocusListener
        disableHoverListener
        disableTouchListener
        onClose={() => setOpen(false)}
        open={open}
      >
        <props.ChildFactory onClick={() => setOpen(!open)} />
      </Tooltip>
    </ClickAwayListener>
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
  const props: { [key: string]: any } = {};
  if (key !== undefined) {
    props.key = key;
  }
  let titleText: string | undefined = undefined;
  let className: string | undefined = undefined;
  for (const [key, value] of root.attrs) {
    if (key === "class") {
      className = value;
      props.className = value;
      continue;
    }
    if (key === "title") {
      titleText = value;
      continue;
    }
    props[key] = value;
  }

  if (titleText !== undefined) {
    const ForwardedNode = React.forwardRef<HTMLElement>(
      (forwardProps: any, forwardRef: any) => {
        const allProps = { ...props, ...forwardProps };
        allProps["ref"] = forwardRef;
        return React.createElement(root.name, allProps, children);
      }
    );
    return (
      <ClickableTooltip
        titleText={titleText}
        className={className}
        ChildFactory={ForwardedNode}
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

export function Dictionary() {
  const [entries, setEntries] = React.useState<JSX.Element[]>([]);
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
      fetchEntry(nav.route.query).then((newEntries) => {
        flushSync(() => {
          const jsxEntries = newEntries.map((e) =>
            xmlNodeToJsx(e, nav.route.hash, sectionRef)
          );
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
          const jsxEntries = newEntries.map((e) =>
            xmlNodeToJsx(e, nav.route.hash, sectionRef)
          );
          setEntries(jsxEntries);
        }}
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
        <ContentBox>{entry}</ContentBox>
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
