import { useEffect, useState } from "react";

import { callApi } from "@/web/utils/rpc/client_rpc";
import {
  MacronizeApi,
  type MacronizedResult,
  type MacronizedWord,
} from "@/web/api_routes";
import { Divider, TextField } from "@/web/client/components/generic/basics";
import type { ComponentChildren } from "preact";
import { Footer } from "@/web/client/components/footer";
import { DictionaryViewV2 } from "@/web/client/pages/dictionary/dictionary_v2";
import type { EmbeddedDictOptions } from "@/web/client/pages/dictionary/dict_context";
import { SvgIcon } from "@/web/client/components/generic/icons";
import { ResizeablePanels } from "@/web/client/components/draggables";

const UNKNOWN_STYLE: React.CSSProperties = {
  borderBottom: "1px dashed",
  cursor: "pointer",
};
const AMBIGUOUS_STYLE = {
  borderBottom: "1px dotted",
  cursor: "pointer",
};

function Unknown(props: { word: string }) {
  return (
    <span style={UNKNOWN_STYLE} className="lsOrth">
      {props.word}
    </span>
  );
}

function Ambiguous(props: { word: string; onClick?: () => unknown }) {
  return (
    <span style={AMBIGUOUS_STYLE} className="gafAuth" onClick={props.onClick}>
      {props.word}
    </span>
  );
}

function MacronizedOutput(
  results: MacronizedResult,
  showOptions: (options: MacronizedWord) => unknown
): ComponentChildren[] {
  return results.map((word, i) => {
    if (typeof word === "string") {
      return word;
    }
    const options = word.options;
    if (options.length === 0) {
      return <Unknown key={i} word={word.word} />;
    }
    if (options.length === 1) {
      return <span key={i}>{word.options[0].form}</span>;
    }
    return (
      <Ambiguous
        key={i}
        word={word.options[word.suggested ?? 0].form}
        onClick={() => showOptions(word)}
      />
    );
  });
}

function InputSection(props: {
  setProcessed: (processed: JSX.Element) => void;
  setCurrentWord: (word: MacronizedWord) => void;
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
      props.setProcessed(
        <div className="text sm">
          {MacronizedOutput(result, props.setCurrentWord)}
        </div>
      );
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
  const [currentWord, setCurrentWord] = useState<MacronizedWord | undefined>();
  const [dictWord, setDictWord] = useState<string | undefined>();

  useEffect(() => {
    if (processed) {
      const results = document.getElementById("results");
      results?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [processed]);

  return (
    <ResizeablePanels>
      <div style={{ padding: "0px 8px" }}>
        <InputSection
          setProcessed={setProcessed}
          setCurrentWord={(word) => {
            setCurrentWord(word);
            setDictWord(undefined);
          }}
        />
        {processed && <ResultSection processed={processed} />}
        <Footer />
      </div>
      <AnalysisSection
        hasContent={processed !== undefined}
        currentWord={currentWord}
        dictWord={dictWord}
        setDictWord={setDictWord}
      />
    </ResizeablePanels>
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
        {props.processed}
      </section>
    </>
  );
}

const DICT_OPTIONS: EmbeddedDictOptions = {
  hideableOutline: true,
  hideSearch: true,
  skipJumpToResult: true,
};

function AnalysisSection(props: {
  hasContent: boolean;
  currentWord: MacronizedWord | undefined;
  dictWord: string | undefined;
  setDictWord: (word: string) => void;
}) {
  const infoBlurb = props.hasContent ? (
    <ul className="text xs light unselectable">
      <li>
        Words in <Unknown word="red" /> are unknown to us, and no attempt was
        made to add macra to them.
      </li>
      <li>
        Words in <Ambiguous word="blue" /> have multiple options. Click on them
        for more details.
      </li>
    </ul>
  ) : (
    <div className="text xs light">Enter text in the box to get started.</div>
  );
  return (
    <section style={{ whiteSpace: "pre-wrap" }} className="text md">
      <h1 className="text md" style={{ margin: "8px 0" }}>
        Analysis
      </h1>
      <div style={{ margin: "12px 0" }}>{infoBlurb}</div>
      {props.currentWord && (
        <WordAnalysis
          word={props.currentWord}
          setDictWord={props.setDictWord}
        />
      )}
      {props.dictWord && (
        <DictionaryViewV2
          embedded
          embeddedOptions={DICT_OPTIONS}
          initial={props.dictWord}
          setInitial={props.setDictWord}
        />
      )}
    </section>
  );
}

function WordAnalysis(props: {
  word: MacronizedWord;
  setDictWord: (word: string) => void;
}) {
  return (
    <div className="text sm light">
      <div>
        Original: <Ambiguous word={props.word.word} />
      </div>
      <div>Known options:</div>
      <ul style={{ marginTop: 0 }}>
        {props.word.options.map((option) => {
          return (
            <div key={option.form}>
              <div>Form: {option.form}</div>
              <ul>
                {option.options.map((o, i) => (
                  <li key={i}>
                    <span
                      style={{
                        padding: "0px 4px",
                        verticalAlign: "middle",
                        display: "inline-grid",

                        placeItems: "center",
                      }}
                      className="lsSenseBullet"
                      onClick={() => props.setDictWord(o.lemma)}>
                      <SvgIcon
                        pathD={SvgIcon.MenuBook}
                        fontSize="small"
                        style={{ gridColumn: "1" }}
                      />
                      <span style={{ gridColumn: "2" }}> {o.lemma}</span>
                    </span>{" "}
                    <i>{o.morph}</i>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </ul>
    </div>
  );
}
