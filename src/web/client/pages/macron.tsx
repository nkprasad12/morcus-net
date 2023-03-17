import React, { useState } from "react";
import Box from "@mui/system/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";

import { macronizeCall } from "@/web/api_routes";
import { Solarized } from "../colors";

export const ERROR_MESSAGE = "Processing failed, please try again later.";

async function process(input: string): Promise<string> {
  const address = `${location.origin}${macronizeCall()}`;
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
    body: input,
  };
  const response = await fetch(address, options);
  if (!response.ok) {
    return ERROR_MESSAGE;
  }
  return await response.text();
}

export function Macronizer() {
  const [rawInput, setRawInput] = useState<string | undefined>(undefined);
  const [processed, setProcessed] = useState<string | undefined>(undefined);

  async function handleClick() {
    if (rawInput === undefined) {
      return;
    }
    setProcessed(await process(rawInput));
  }

  return (
    <>
      <Box
        sx={{
          padding: 3,
          ml: 3,
          mr: 3,
          mt: 3,
          mb: 3,
          border: 2,
          borderRadius: 1,
          borderColor: Solarized.base2,
        }}
      >
        <TextField
          label="Enter text to macronize"
          multiline
          fullWidth
          minRows={10}
          variant="filled"
          InputLabelProps={{
            style: { color: Solarized.base1 },
          }}
          onChange={(e) => {
            setRawInput(e.target.value);
          }}
        />
        <Button
          onClick={handleClick}
          variant="contained"
          color="primary"
          sx={{ mt: 2, color: Solarized.base00, display: "block" }}
        >
          {"Macronize"}
        </Button>
      </Box>
      {processed && (
        <Box
          sx={{
            padding: 3,
            ml: 3,
            mr: 3,
            mt: 3,
            mb: 3,
            border: 2,
            borderRadius: 1,
            borderColor: Solarized.base2,
          }}
        >
          <pre>{processed}</pre>
        </Box>
      )}
    </>
  );
}
