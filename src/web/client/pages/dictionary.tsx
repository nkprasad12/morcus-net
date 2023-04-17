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
        title={props.titleText}
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

  async function onEnter() {
    if (inputState.length === 0) {
      return;
    }
    props.onNewEntries(await fetchEntry(inputState));
    history.pushState(`#${inputState}`, "", `#${inputState}`);
  }

  return (
    <Autocomplete
      freeSolo
      disableClearable
      options={options}
      sx={{
        padding: 1,
        ml: props.smallScreen ? 1 : 2,
        mr: props.smallScreen ? 1 : 2,
        mt: 2,
        mb: 1,
      }}
      onInputChange={async (_, value) => {
        setInputState(value);
        const prefixOptions = await AutocompleteCache.get().getOptions(value);
        setOptions(prefixOptions.slice(0, 200));
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
              onEnter();
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

  function contentBox(xmlRoot: XmlNode, key?: string) {
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
          key={key}
        >
          <Typography
            component={"div"}
            style={{
              whiteSpace: "pre-wrap",
              color: Solarized.base02,
            }}
          >
            {xmlNodeToJsx(xmlRoot)}
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
      {entries.length > 1
        ? contentBox(
            new XmlNode("div", [], [`Found ${entries.length} entries.`]),
            "searchHeader"
          )
        : undefined}
      {entries.map((entry) => contentBox(entry))}
    </Container>
  );
}

export namespace Dictionary {
  export interface Props {
    input: string;
  }
}
