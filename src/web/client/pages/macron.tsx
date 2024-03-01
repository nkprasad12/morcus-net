import { useState } from "react";

import { callApi } from "@/web/utils/rpc/client_rpc";
import { MacronizeApi } from "@/web/api_routes";
import { SpanButton, TextField } from "@/web/client/components/generic/basics";

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
        <div style={{ marginTop: "16px" }}>
          <SpanButton onClick={handleClick} className="button text md light">
            Macronize
          </SpanButton>
        </div>
      </div>
      {processed && (
        <div
          style={{
            padding: "24px",
            margin: "24px",
            border: "16px",
            borderRadius: "8px",
          }}
          className="macronBox">
          <div style={{ whiteSpace: "pre-wrap" }}>{processed}</div>
        </div>
      )}
    </>
  );
}
