import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";

import { callApi } from "@/web/utils/rpc/client_rpc";
import { MacronizeApi } from "@/web/api_routes";
import { TextField } from "@/web/client/components/generic/basics";

export function Macronizer() {
  const [rawInput, setRawInput] = useState<string | undefined>(undefined);
  const [processed, setProcessed] = useState<string | undefined>(undefined);

  async function handleClick() {
    if (rawInput === undefined) {
      return;
    }
    try {
      setProcessed(await callApi(MacronizeApi, rawInput));
    } catch (e) {
      setProcessed("Error: please try again later.");
      console.debug(e);
    }
  }

  return (
    <>
      <div style={{ padding: "24px" }} className="macronBox">
        <label className="text sm light" htmlFor="inputBox">
          Enter text to macronize
        </label>
        <TextField
          id="inputBox"
          multiline
          fullWidth
          minRows={10}
          onNewValue={setRawInput}
        />
        <Button
          onClick={handleClick}
          variant="contained"
          className="nonDictText"
          sx={{ mt: 2, display: "block" }}>
          {"Macronize"}
        </Button>
      </div>
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
          }}
          className="macronBox">
          <div style={{ whiteSpace: "pre-wrap" }}>{processed}</div>
        </Box>
      )}
    </>
  );
}
