import { useRef, useState, useEffect, JSX } from "react";

import Popper from "@mui/base/PopperUnstyled";
import { IconButton, SvgIcon } from "@/web/client/components/generic/icons";

const CLEAR_QUERY = "Clear query";

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

interface AutoCompleteSearchProps<T> {
  optionsForInput: (input: string) => T[] | Promise<T[]>;
  onOptionSelected: (t: T) => unknown;
  RenderOption: (props: { option: T }) => JSX.Element;
  toKey: (t: T) => string;
  toInputDisplay: (t: T) => string;
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
      toInputDisplay={unimplemented}
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
  const [mouseOnPopup, setMouseOnPopup] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [options, setOptions] = useState<T[]>([]);

  const { toKey } = props;

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

  const interactingWithPopup = mouseOnPopup;
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
    setMouseOnPopup(false);
    setCursor(-1);
    setFocused(false);
    props.onOptionSelected(t);
    inputRef.current?.blur();
  }

  async function onInput(value: string) {
    props.onInput?.(value);
    setInput(value);
    if (props.optionsForInput === undefined) {
      return;
    }
    setLoading(true);
    const fetchedOptions = await props.optionsForInput(value);
    if (inputRef.current?.value !== value) {
      // We don't want to set the options if the input has changed
      // since we started fetching.
      return;
    }
    setOptions(fetchedOptions);
    setCursor(-1);
    setLoading(false);
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
              onMouseOver={() => setMouseOnPopup(true)}
              onMouseOut={() => setMouseOnPopup(false)}>
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
                    onTouchStart={() => setCursor(i)}
                    onMouseOver={() => setCursor(i)}>
                    <props.RenderOption option={t} />
                  </div>
                ))}
            </div>
          </Popper>
          <SvgIcon
            pathD={SvgIcon.Search}
            className="menuIconFaded"
            style={{ marginLeft: "11.2px" }}
          />
          <input
            ref={inputRef}
            type="text"
            className="customSearchBox text md"
            spellcheck={false}
            autoCapitalize="none"
            autoComplete="off"
            aria-label={props.ariaLabel}
            value={input}
            onChange={async (e) => onInput(e.currentTarget.value)}
            onKeyUp={(event) => {
              if (event.key !== "Enter") {
                return;
              }
              if (cursor > -1) {
                onOptionChosen(options[cursor]);
              } else if (input.trim().length > 0) {
                props.onRawEnter?.(input);
                setFocused(false);
                setCursor(-1);
                setMouseOnPopup(false);
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
              setTimeout(() => {
                setFocused(false);
                setCursor(-1);
              }, 16);
            }}
            placeholder={props.placeholderText}
            role="combobox"
          />
          <IconButton
            aria-label={CLEAR_QUERY}
            style={{ marginRight: "4px" }}
            onClick={() => {
              inputRef.current?.focus();
              onInput("");
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
              style={{ marginRight: "5.2px" }}
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
