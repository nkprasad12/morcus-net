import { lsCall } from "@/web/api_routes";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Box from "@mui/system/Box";
import React from "react";

import { getHash } from "@/web/client/browser_utils";
import { Solarized } from "@/web/client/colors";
import Typography from "@mui/material/Typography";
import { parseEntries, XmlNode } from "@/common/lewis_and_short/xml_node";
import { ClickAwayListener, Tooltip } from "@mui/material";

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

export function xmlNodeToJsx(root: XmlNode): JSX.Element {
  const children = root.children.map((child) => {
    if (typeof child === "string") {
      return child;
    }
    return xmlNodeToJsx(child);
  });
  const props: { [key: string]: string } = {};
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

async function fetchEntry(input: string): Promise<XmlNode> {
  const response = await fetch(`${location.origin}${lsCall(input)}`);
  if (!response.ok) {
    return new XmlNode(
      "span",
      [],
      ["Failed to fetch the entry. Please try again later."]
    );
  }
  const rawText = await response.text();
  return parseEntries([rawText])[0];
}

export function Dictionary(props: Dictionary.Props) {
  const [entry, setEntry] = React.useState<XmlNode | undefined>(undefined);
  const [inputState, setInputState] = React.useState<string>(props.input);

  async function onEnter() {
    if (inputState.length === 0) {
      return;
    }
    setEntry(await fetchEntry(inputState));
    history.pushState(`#${inputState}`, "", `#${inputState}`);
  }

  function contentBox(xmlRoot: XmlNode) {
    return (
      <Box
        sx={{
          padding: 1,
          ml: 3,
          mr: 3,
          mt: 1,
          mb: 2,
          border: 2,
          borderRadius: 1,
          borderColor: Solarized.base2,
        }}
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
    );
  }

  React.useEffect(() => {
    const hashListener = () => {
      const input = getHash();
      if (input.length === 0) {
        setEntry(undefined);
        return;
      }
      fetchEntry(input).then(setEntry);
    };
    window.addEventListener("hashchange", hashListener, false);
    if (props.input.length > 0) {
      fetchEntry(props.input).then(setEntry);
    }
    return () => {
      window.removeEventListener("hashchange", hashListener);
    };
  }, [props.input]);

  return (
    <>
      <Autocomplete
        freeSolo
        disableClearable
        options={[]}
        sx={{ padding: 1, ml: 2, mr: 2, mt: 2, mb: 1 }}
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
            onChange={(e) => {
              setInputState(e.target.value);
            }}
            InputProps={{
              ...params.InputProps,
              type: "search",
            }}
          />
        )}
      />
      {entry && contentBox(entry)}
    </>
  );
}

export namespace Dictionary {
  export interface Props {
    input: string;
  }
}
