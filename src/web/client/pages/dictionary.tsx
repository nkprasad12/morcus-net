import { lsCall } from "@/web/api_routes";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { Box } from "@mui/system";
import React from "react";

import { Solarized } from "@/web/client/colors";

async function fetchEntry(input: string): Promise<string> {
  const response = await fetch(`${location.origin}${lsCall(input)}`);
  if (!response.ok) {
    return "Failed to fetch the entry. Please try again later.";
  }
  return await response.text();
}

export function Dictionary() {
  const [entry, setEntry] = React.useState<string>("");
  const [inputState, setInputState] = React.useState<string>("");

  async function onEnter() {
    if (inputState.length === 0) {
      return;
    }
    setEntry(await fetchEntry(inputState));
  }

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
