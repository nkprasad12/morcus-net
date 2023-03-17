import { lsCall } from "@/web/api_routes";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Box from "@mui/system/Box";
import React from "react";

import { getHash } from "@/web/client/browser_utils";
import { Solarized } from "@/web/client/colors";

async function fetchEntry(input: string): Promise<string> {
  const response = await fetch(`${location.origin}${lsCall(input)}`);
  if (!response.ok) {
    return "Failed to fetch the entry. Please try again later.";
  }
  return await response.text();
}

export function Dictionary(props: Dictionary.Props) {
  const [entry, setEntry] = React.useState<string>("");
  const [inputState, setInputState] = React.useState<string>(props.input);

  async function onEnter() {
    if (inputState.length === 0) {
      return;
    }
    setEntry(await fetchEntry(inputState));
    history.pushState(`#${inputState}`, "", `#${inputState}`);
  }

  React.useEffect(() => {
    const hashListener = () => {
      const input = getHash();
      if (input.length === 0) {
        setEntry("");
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
        sx={{ padding: 1, ml: 3, mr: 3, mt: 3, mb: 1 }}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Search for a word (can be an inflected form)"
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
      {entry && (
        <Box
          sx={{
            padding: 1,
            ml: 4,
            mr: 4,
            mt: 1,
            mb: 3,
            border: 2,
            borderRadius: 1,
            borderColor: Solarized.base2,
          }}
        >
          <pre>{entry}</pre>
        </Box>
      )}
    </>
  );
}

export namespace Dictionary {
  export interface Props {
    input: string;
  }
}
