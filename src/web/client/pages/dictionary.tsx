import { lsCall } from "@/web/api_routes";
import Autocomplete from "@mui/material/Autocomplete";
import Container from "@mui/material/Container";
import { useTheme } from "@mui/material/styles";
import TextField from "@mui/material/TextField";
import useMediaQuery from "@mui/material/useMediaQuery";
import Box from "@mui/system/Box";
import React from "react";

import { getHash } from "@/web/client/browser_utils";
import { Solarized } from "@/web/client/colors";
import Typography from "@mui/material/Typography";
import { parseEntries, XmlNode } from "@/common/lewis_and_short/xml_node";
import { ClickAwayListener, Divider, Tooltip } from "@mui/material";
import { AutocompleteCache } from "./autocomplete_cache";

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

export function xmlNodeToJsx(root: XmlNode, key?: string): JSX.Element {
  const children = root.children.map((child) => {
    if (typeof child === "string") {
      return child;
    }
    return xmlNodeToJsx(child);
  });
  const props: { [key: string]: string } = {};
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
  }
  return React.createElement(root.name, props, children);
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

  async function onEnter(searchTerm: string) {
    if (searchTerm.length === 0) {
      return;
    }
    props.onNewEntries(await fetchEntry(searchTerm));
    history.pushState(`#${searchTerm}`, "", `#${searchTerm}`);
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

export function Dictionary(props: Dictionary.Props) {
  const [entries, setEntries] = React.useState<XmlNode[]>([]);
  const theme = useTheme();
  const smallScreen = useMediaQuery(theme.breakpoints.down("sm"));

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
    const hashListener = () => {
      const input = getHash();
      if (input.length === 0) {
        setEntries([]);
        return;
      }
      fetchEntry(input).then(setEntries);
    };
    window.addEventListener("hashchange", hashListener, false);
    if (props.input.length > 0) {
      fetchEntry(props.input).then(setEntries);
    }
    return () => {
      window.removeEventListener("hashchange", hashListener);
    };
  }, [props.input]);

  return (
    <Container maxWidth="lg">
      <SearchBox
        input={props.input}
        onNewEntries={setEntries}
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
        <ContentBox key={entry.getAttr("id")}>{xmlNodeToJsx(entry)}</ContentBox>
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

export namespace Dictionary {
  export interface Props {
    input: string;
  }
}
