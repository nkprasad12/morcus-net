import { useEffect, useState } from "react";

import { callApi } from "@/web/utils/rpc/client_rpc";
import { MacronizeApi, type MacronizedResult } from "@/web/api_routes";
import { Divider, TextField } from "@/web/client/components/generic/basics";
import type { ComponentChildren } from "preact";
import { Footer } from "@/web/client/components/footer";

const UNKNOWN_STYLE: React.CSSProperties = {
  color: "red",
  borderBottom: "1px dashed",
};
const AMBIGUOUS_STYLE = {
  color: "navy",
  borderBottom: "1px dotted",
};

function MWords(results: MacronizedResult): ComponentChildren[] {
  return results.map((r, i) => {
    if (typeof r === "string") {
      return r;
    }
    const options = r.options;
    if (options.length === 0) {
      return (
        <span key={i} style={UNKNOWN_STYLE}>
          {r.word}
        </span>
      );
    }
    if (options.length === 1) {
      return <span key={i}>{r.options[0].form}</span>;
    }
    return (
      <span
        key={i}
        style={AMBIGUOUS_STYLE}
        onClick={() => {
          console.log(r.options);
        }}>
        {r.options[r.suggested ?? 0].form}
      </span>
    );
  });
}

function InputSection(props: {
  setProcessed: (processed: JSX.Element) => void;
}) {
  const [rawInput, setRawInput] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (rawInput === undefined || loading) {
      return;
    }
    setLoading(true);
    try {
      const result = await callApi(MacronizeApi, rawInput);
      props.setProcessed(<div className="text sm">{MWords(result)}</div>);
    } catch (e) {
      // TODO: Have better errors.
      props.setProcessed(<div>Error: please try again later.</div>);
      console.debug(e);
    } finally {
      setLoading(false);
    }
  }

  const tooLong = rawInput !== undefined && rawInput?.length >= 10000;

  return (
    <section>
      <h1 style={{ margin: "8px 0" }}>
        <label className="text md" htmlFor="inputBox">
          Enter text to macronize
        </label>
      </h1>
      <TextField
        id="inputBox"
        multiline
        fullWidth
        size="sm"
        minRows={8}
        onNewValue={setRawInput}
      />
      <div style={{ margin: "8px 0" }}>
        <div className="text xs light" id="lengthLimit">
          Due to server constraints, you can only process 10000 characters at a
          time.
        </div>
        <button
          onClick={handleClick}
          style={{ marginTop: "8px" }}
          className="button text md light"
          disabled={!rawInput || tooLong}
          aria-labelledby={tooLong ? "lengthLimit" : undefined}>
          Macronize
        </button>
      </div>
    </section>
  );
}

export function Macronizer() {
  const [processed, setProcessed] = useState<JSX.Element | undefined>();

  useEffect(() => {
    if (processed) {
      const results = document.getElementById("results");
      results?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [processed]);

  return (
    <div style={{ margin: "16px" }}>
      <InputSection setProcessed={setProcessed} />
      {processed && <ResultSection processed={processed} />}
      <Footer />
    </div>
  );
}

function ResultSection(props: { processed: JSX.Element }) {
  return (
    <>
      <Divider style={{ margin: "24px 0" }} />
      <section
        style={{ whiteSpace: "pre-wrap", margin: "18px 0" }}
        className="text md">
        <h1 className="text md" style={{ margin: "12px 0" }} id="results">
          Results
        </h1>
        <div style={{ margin: "12px 0" }}>
          <ul className="text xs light unselectable">
            <li>
              Words in <span style={UNKNOWN_STYLE}>red</span> are unknown to us,
              and no attempt was made to add macra to them.
            </li>
            <li>
              Words in <span style={AMBIGUOUS_STYLE}>blue</span> have multiple
              options. Click on them for more details.
            </li>
          </ul>
        </div>
        {props.processed}
      </section>
    </>
  );
}
