import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { callApi } from "@/web/utils/rpc/client_rpc";
import {
  MacronizeApi,
  type MacronizedResult,
  type MacronizedWord,
} from "@/web/api_routes";
import { Divider, TextField } from "@/web/client/components/generic/basics";
import { Footer } from "@/web/client/components/footer";
import { DictionaryViewV2 } from "@/web/client/pages/dictionary/dictionary_v2";
import type { EmbeddedDictOptions } from "@/web/client/pages/dictionary/dict_context";
import { SvgIcon } from "@/web/client/components/generic/icons";
import { ResizeablePanels } from "@/web/client/components/draggables";

const AMBIG_UNRESOLVED = "macAmbig unresolved";
const AMBIG_SPAN = <span className={AMBIG_UNRESOLVED}>ambiguous</span>;

const UNKNOWN_STYLE: React.CSSProperties = {
  borderBottom: "1px dashed",
  cursor: "pointer",
};

function Unknown(props: { word: string }) {
  return (
    <span style={UNKNOWN_STYLE} className="lsOrth">
      {props.word}
    </span>
  );
}

function getIdx(word: MacronizedWord) {
  const suggested = word.options[word.suggested ?? 0].form;
  const idx = word.options.findIndex((w) => w.form === suggested);
  return idx === -1 ? 0 : idx;
}

function Ambiguous(props: {
  word: MacronizedWord;
  showOptions: (options: MacronizedWord) => unknown;
}) {
  const options = useRef(
    Array.from(new Set(props.word.options.map((o) => o.form)))
  );
  const spanRef = useRef<HTMLSpanElement>(null);
  const savedSelection = useRef<{ range: Range; offset: number } | null>(null);
  const shouldRestoreCursor = useRef<boolean>(false);
  const [resolved, setResolved] = useState<boolean>(false);
  const [idx, setIdx] = useState<number>(getIdx(props.word));
  const classes = ["macAmbig"];
  if (!resolved) {
    classes.push("unresolved");
  }

  useLayoutEffect(() => {
    if (
      !shouldRestoreCursor.current ||
      !savedSelection.current ||
      !spanRef.current
    ) {
      return;
    }
    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    shouldRestoreCursor.current = false;
    selection.removeAllRanges();
    const range = document.createRange();
    const textNode = spanRef.current.firstChild;
    if (!textNode) {
      return;
    }

    // Set the range to the appropriate position in the text node
    const offset = Math.min(
      savedSelection.current.offset,
      textNode.textContent?.length ?? 0
    );
    range.setStart(textNode, offset);
    range.setEnd(textNode, offset);
    selection.addRange(range);
  }, [idx]);

  function saveCaretPosition() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !spanRef.current) {
      return;
    }
    const range = selection.getRangeAt(0);
    if (range.startContainer.parentNode !== spanRef.current) {
      return;
    }
    savedSelection.current = {
      range: range.cloneRange(),
      offset: range.startOffset,
    };
    shouldRestoreCursor.current = true;
  }

  return (
    <span
      ref={spanRef}
      contentEditable
      className={classes.join(" ")}
      spellcheck={false}
      onClick={(e) => {
        e.preventDefault();
        saveCaretPosition();
        if (e.altKey) {
          setResolved((r) => !r);
          return;
        }
        if (e.ctrlKey) {
          setIdx((prevIdx) => (prevIdx + 1) % options.current.length);
        }
        props.showOptions(props.word);
      }}>
      {options.current[idx]}
    </span>
  );
}

function MacronizedOutput(props: {
  results: MacronizedResult;
  showOptions: (options: MacronizedWord) => unknown;
}) {
  return (
    <div
      className="text sm"
      style={{ padding: "8px" }}
      contentEditable
      spellcheck={false}>
      {props.results.map((word, i) => {
        if (typeof word === "string") {
          return word;
        }
        const forms = new Set(word.options.map((option) => option.form));
        if (forms.size === 0) {
          return <Unknown key={i} word={word.word} />;
        }
        if (forms.size === 1) {
          return <span key={i}>{word.options[0].form}</span>;
        }
        return (
          <Ambiguous key={i} word={word} showOptions={props.showOptions} />
        );
      })}
    </div>
  );
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
        <MacronizedOutput results={result} showOptions={props.setCurrentWord} />
      );
    } catch (e) {
      // TODO: Have better errors.
      props.setProcessed(<div>An error occurred.</div>);
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
          time ({rawInput?.length ?? 0} / 10000)
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
    <ResizeablePanels sideClass="macronSide">
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
        <details open style={{ margin: "12px 0" }}>
          <summary>
            <span className="text xs light">Instructions ⓘ</span>
          </summary>
          <ul className="text xs light unselectable" style={{ marginTop: 0 }}>
            <li>
              Words in <Unknown word="red" /> are unknown to the system, and no
              attempt was made to add macra to them.
            </li>
            <li>
              Words in {AMBIG_SPAN} are ambiguous and have multiple known
              options.
            </li>
            <li>Click on an {AMBIG_SPAN} word to see the known options.</li>
            <li>
              Ctrl + Click on an {AMBIG_SPAN} word to cycle through known
              options.
            </li>
            <li>Alt + Click on an {AMBIG_SPAN} word to mark it as resolved.</li>
          </ul>
        </details>
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
  return (
    <section
      style={{ whiteSpace: "pre-wrap", padding: "0 8px" }}
      className="text md">
      <h1 className="text md" style={{ margin: "8px 0" }}>
        Analysis
      </h1>
      {!props.hasContent && (
        <div className="text xs light" style={{ margin: "12px 0" }}>
          Enter text in the box to get started.
        </div>
      )}
      {props.currentWord && (
        <WordAnalysis
          word={props.currentWord}
          setDictWord={props.setDictWord}
        />
      )}
      {props.dictWord && (
        <DictionaryViewV2
          textScale={80}
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
      <div>Original: {props.word.word}</div>
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
                    {o.morph.length === 1 ? (
                      <i>{o.morph}</i>
                    ) : (
                      <ul>
                        {o.morph.map((m, k) => (
                          <li key={k}>
                            <i>{m}</i>
                          </li>
                        ))}
                      </ul>
                    )}
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
