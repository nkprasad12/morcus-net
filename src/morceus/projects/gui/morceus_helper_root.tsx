/* istanbul ignore file */

import { checkPresent } from "@/common/assert";
import { IsLsButNotMorceus } from "@/morceus/projects/gui/morceus_helper_apis";
import { useApiCall } from "@/web/client/utils/hooks/use_api_call";
import { useState } from "react";
import ReactDOM from "react-dom/client";

const root = ReactDOM.createRoot(
  checkPresent(document.querySelector("#placeholder"))
);

function LsButNotMorceus(props: { reversed: boolean }) {
  const [wordList, setWordList] = useState<"Error" | "Loading" | string[]>(
    "Loading"
  );
  const [i, setI] = useState<number>(0);

  useApiCall(IsLsButNotMorceus, 0, {
    onLoading: () => setWordList("Loading"),
    onError: () => setWordList("Error"),
    onResult: (result) =>
      setWordList(props.reversed ? result.reverse() : result),
  });

  if (wordList === "Error") {
    return <div>Error</div>;
  }
  if (wordList === "Loading") {
    return <div>Loading</div>;
  }
  if (wordList.length === 0 || i >= wordList.length) {
    return <div>All done!</div>;
  }

  const word = wordList[i];

  return (
    <div>
      <div>
        <span>
          Word: <b>{word}</b>
        </span>
        <button onClick={() => setI(i + 1)}>Skip</button>
      </div>
      <div>
        <textarea
          rows={4}
          cols={80}
          defaultValue={`:le:${word}\nAdd something here\n`}></textarea>
        <button onClick={() => setI(i + 1)}>
          Submit and move to next word
        </button>
      </div>
      <div>
        <div style={{ display: "grid", marginTop: "8px" }}>
          <iframe
            style={{
              gridColumn: "1",
              width: "100%",
              height: "500px",
            }}
            src={`https://logeion.uchicago.edu/${word}`}
          />
          <iframe
            style={{
              gridColumn: "2",
              width: "100%",
              height: "500px",
            }}
            src={`https://latin.packhum.org/search?q=${word}`}
          />
        </div>
      </div>
    </div>
  );
}

function LsButNotMorceusLanding() {
  const [reversed, setReversed] = useState<boolean | undefined>(undefined);

  if (reversed === undefined) {
    return (
      <div>
        <button onClick={() => setReversed(true)}>Start from Z</button>
        <button onClick={() => setReversed(false)}>Start from A</button>
      </div>
    );
  } else {
    return <LsButNotMorceus reversed={reversed} />;
  }
}

function Landing(props: { onPage: (page: Pages) => unknown }) {
  return (
    <div>
      <div>Choose an option:</div>
      <button onClick={() => props.onPage("LsButNotMorceus")}>
        In LS but not Morceus
      </button>
    </div>
  );
}

type Pages = "LsButNotMorceus";

function Container() {
  const [page, setPage] = useState<Pages | undefined>(undefined);

  if (page === "LsButNotMorceus") {
    return <LsButNotMorceusLanding />;
  }
  return <Landing onPage={setPage} />;
}

root.render(<Container />);
