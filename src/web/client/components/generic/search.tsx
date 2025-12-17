import { useRef, useState, useEffect, JSX, useCallback } from "react";

import Popper from "@mui/base/PopperUnstyled";
import { IconButton, SvgIcon } from "@/web/client/components/generic/icons";
import {
  isNumber,
  isPair,
  isString,
  maybeUndefined,
  type Validator,
} from "@/web/utils/rpc/parsing";

const CLEAR_QUERY = "Clear query";

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

type ChainedPair = [newInput: string, cursorPosition?: number];
const isChainedPair: Validator<ChainedPair> = isPair(
  isString,
  maybeUndefined(isNumber)
);

interface AutoCompleteSearchProps<T> {
  /** A provider for the autocomplete options for a particular input state. */
  optionsForInput: (input: string, position?: number) => T[] | Promise<T[]>;
  /**
   * Called when an option is selected.
   *
   * If a string is returned, then the input state will be set to that string.
   */
  onOptionSelected: (t: T, current: string) => unknown | string;
  /** Renderer for an option. The `current` parameter is the current input text. */
  RenderOption: (props: { option: T; current: string }) => JSX.Element;
  /** A converter function to a key. It must be unique for each option. */
  toKey: (t: T) => string;
  /** Whether to check for autocomplete options on empty input. */
  hasOptionsForEmptyInput?: true;
}

interface BaseSearchBoxProps {
  autoFocused?: boolean;
  placeholderText?: string;
  onOpenSettings?: () => unknown;
  settingsPreview?: JSX.Element;
  onRawEnter?: (input: string) => unknown;
  ariaLabel?: string;
  onInput?: (input: string) => unknown;
  style?: React.CSSProperties;
  saveSpace?: boolean;
}

type SearchBoxProps<T> = BaseSearchBoxProps & AutoCompleteSearchProps<T>;

function unimplemented<T>(): T {
  throw new Error("Unimplemented");
}

export function SearchBoxNoAutocomplete(props: BaseSearchBoxProps) {
  return (
    <SearchBox
      onOptionSelected={unimplemented}
      RenderOption={unimplemented}
      optionsForInput={() => []}
      toKey={unimplemented}
      {...props}
    />
  );
}

export function SearchBox<T>(props: SearchBoxProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [focused, setFocused] = useState(props.autoFocused === true);
  const [interactingWithPopup, setInteractingWithPopup] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [options, setOptions] = useState<T[]>([]);

  const { toKey, optionsForInput, onInput } = props;

  const textSize = props.saveSpace ? "sm" : "md";

  useEffect(() => {
    if (cursor < 0 || options.length === 0) {
      return;
    }
    const id = toKey(options[cursor]);
    const element = document.getElementById(id);
    if (element === null) {
      return;
    }
    // @ts-ignore
    element.scrollIntoView({ behavior: "instant", block: "nearest" });
  }, [cursor, toKey, options]);

  const refreshOptions = useCallback(
    async (value: string | undefined) => {
      if (optionsForInput === undefined || value === undefined) {
        return;
      }
      setLoading(true);
      const position = inputRef.current?.selectionStart ?? undefined;
      const fetchedOptions = await optionsForInput(value, position);
      if (inputRef.current?.value !== value) {
        // We don't want to set the options if the input has changed
        // since we started fetching.
        return;
      }
      setOptions(fetchedOptions);
      setCursor(-1);
      setLoading(false);
    },
    [optionsForInput]
  );

  const onInputInternal = useCallback(
    async (value: string) => {
      onInput?.(value);
      setInput(value);
      await refreshOptions(value);
    },
    [onInput, refreshOptions]
  );

  useEffect(() => {
    if (
      props.hasOptionsForEmptyInput !== true ||
      optionsForInput === undefined ||
      input.trim() !== ""
    ) {
      return;
    }
    onInputInternal("");
  }, [props.hasOptionsForEmptyInput, optionsForInput, onInputInternal, input]);

  const popperOpen =
    containerRef.current !== null &&
    (focused || interactingWithPopup) &&
    (options.length > 0 || loading);
  const containerClasses = ["customSearchContainer"];
  if (focused) {
    containerClasses.push("focused");
  }

  function handleArrow(key: "ArrowDown" | "ArrowUp") {
    if (loading || options.length === 0) {
      return;
    }
    if (cursor === -1) {
      if (key === "ArrowUp") {
        setCursor(options.length - 1);
      } else {
        setCursor(0);
      }
    }
    setCursor(mod(cursor + (key === "ArrowDown" ? 1 : -1), options.length));
  }

  async function onOptionChosen(t: T) {
    setInteractingWithPopup(false);
    setCursor(-1);
    const result = props.onOptionSelected(t, input);
    if (!isChainedPair(result)) {
      setFocused(false);
      inputRef.current?.blur();
      return;
    }
    // If the result is a chainedPair, we interpret this as a request for the result to be able
    // to chain, and return focus to the input.
    onInputInternal(result[0]);
    setFocused(true);
    const currentRef = inputRef.current;
    if (currentRef !== null) {
      currentRef.focus();
      setTimeout(() => {
        // This sets the cursor position in the input box all
        // the way to the end.
        // We wait just a moment so that the browser can apply rendering
        // for the focus first.
        const i = result[1] ?? currentRef.value.length;
        currentRef.setSelectionRange(i, i);
        if (i === currentRef.value.length) {
          // If we're at the end, also scroll to the end.
          // TODO: We should see if we can also figure out the correct place to
          // scroll to when we're not at the end.
          currentRef.scrollLeft = currentRef.scrollWidth;
        }
      }, 6);
    }
  }

  return (
    <div style={props.style}>
      <div
        className={containerClasses.join(" ")}
        style={{
          display: "flex",
          flexDirection: "column",
        }}
        ref={containerRef}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <Popper
            open={popperOpen}
            anchorEl={containerRef.current}
            placement="bottom">
            <div
              className="customSearchPopup"
              style={{
                width: containerRef.current?.offsetWidth,
                maxHeight: window.innerHeight * 0.4,
              }}
              onMouseOver={() => setInteractingWithPopup(true)}
              onMouseOut={() => setInteractingWithPopup(false)}>
              {loading && options.length === 0 && (
                <div className="customSearchPopupOption">Loading options</div>
              )}
              {options.length > 0 &&
                options.map((t, i) => (
                  <div
                    className={
                      "customSearchPopupOption" +
                      (cursor === i ? " customSearchPopupOptionSelected" : "")
                    }
                    key={props.toKey(t)}
                    id={props.toKey(t)}
                    onClick={() => onOptionChosen(t)}
                    onTouchStart={(e) => {
                      try {
                        // @ts-expect-error
                        e.passive = true;
                      } catch {}
                      setCursor(i);
                    }}
                    onMouseOver={() => setCursor(i)}>
                    <props.RenderOption option={t} current={input} />
                  </div>
                ))}
            </div>
          </Popper>
          {!props.saveSpace && (
            <SvgIcon
              pathD={SvgIcon.Search}
              className="menuIconFaded"
              style={{ marginLeft: "11.2px" }}
            />
          )}
          <input
            ref={inputRef}
            type="text"
            className={`customSearchBox text ${textSize}`}
            spellcheck={false}
            autoCapitalize="none"
            autoComplete="off"
            aria-label={props.ariaLabel}
            aria-expanded={popperOpen}
            aria-autocomplete={
              props.onOptionSelected === unimplemented ? "none" : "list"
            }
            value={input}
            onChange={async (e) => onInputInternal(e.currentTarget.value)}
            onClick={() => refreshOptions(inputRef.current?.value)}
            onKeyUp={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                refreshOptions(inputRef.current?.value);
                return;
              }
              if (event.key !== "Enter") {
                return;
              }
              if (cursor > -1) {
                onOptionChosen(options[cursor]);
              } else if (input.trim().length > 0) {
                props.onRawEnter?.(input);
                setFocused(false);
                setCursor(-1);
                setInteractingWithPopup(false);
                inputRef.current?.blur();
                return;
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                handleArrow(event.key);
                event.preventDefault();
              }
            }}
            autoFocus={props.autoFocused}
            onFocus={() => setFocused(true)}
            onBlur={(e) => {
              // If this is due to a click of the clear button, just reset the cursor and return.
              // @ts-expect-error - `relatedTarget` can technically be any `EventTarget`, not just
              //   an `Element`. But the null coalescing will handle this just fine.
              if (e.relatedTarget?.ariaLabel === CLEAR_QUERY) {
                setCursor(-1);
                return;
              }
              setFocused(false);
              setCursor(-1);
            }}
            placeholder={props.placeholderText}
            role="combobox"
          />
          <IconButton
            aria-label={CLEAR_QUERY}
            style={{ marginRight: props.saveSpace ? "0px" : "4px" }}
            onClick={() => {
              inputRef.current?.focus();
              onInputInternal("");
            }}>
            <SvgIcon pathD={SvgIcon.Clear} className="menuIcon" />
          </IconButton>
        </div>
        {props.onOpenSettings && (
          <div className="searchSettingsBar">
            <div style={{ width: "100%", maxWidth: "100%" }}>
              {props.settingsPreview}
            </div>
            <IconButton
              aria-label="search settings"
              aria-haspopup="true"
              style={{ marginRight: props.saveSpace ? "1px" : "5.2px" }}
              onClick={props.onOpenSettings}>
              <SvgIcon
                pathD={SvgIcon.Settings}
                fontSize="small"
                className="menuIcon"
              />
            </IconButton>
          </div>
        )}
      </div>
    </div>
  );
}
