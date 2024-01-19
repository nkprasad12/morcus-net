import { useRef, useState, useEffect } from "react";

import SettingsIcon from "@mui/icons-material/Settings";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import IconButton from "@mui/material/IconButton";
import Popper from "@mui/material/Popper";

function spacing(input: number): string {
  return `${input * 8}px`;
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

export function SearchBox<T>(props: {
  smallScreen?: boolean;
  autoFocused?: boolean;
  placeholderText?: string;
  onOpenSettings?: () => any;
  settingsPreview?: JSX.Element;
  onRawEnter: (input: string) => any;
  optionsForInput: (input: string) => T[] | Promise<T[]>;
  onOptionSelected: (t: T) => any;
  RenderOption: (props: { option: T }) => JSX.Element;
  toKey: (t: T) => string;
  toInputDisplay: (t: T) => string;
  ariaLabel?: string;
}) {
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

  const smallScreen = props.smallScreen === true;
  const interactingWithPopup = mouseOnPopup;
  const popperOpen =
    containerRef.current !== null &&
    (focused || interactingWithPopup) &&
    (options.length > 0 || loading);
  const containerClasses = ["customSearchContainer"];
  if (focused) {
    containerClasses.push("customSearchContainerFocused");
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
    setInput(value);
    if (props.optionsForInput === undefined) {
      return;
    }
    inputRef.current?.selectionStart;
    setLoading(true);
    setOptions(await props.optionsForInput(value));
    setCursor(-1);
    setLoading(false);
  }

  return (
    <div
      style={{
        padding: spacing(smallScreen ? 0 : 1),
        paddingTop: spacing(2),
        paddingBottom: spacing(2),
        marginLeft: spacing(smallScreen ? 0 : 3),
        marginRight: spacing(smallScreen ? 0 : 3),
        marginTop: spacing(2),
        marginBottom: spacing(1),
      }}>
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
          <SearchIcon
            fontSize="medium"
            className="menuIconFaded"
            sx={{ marginLeft: 1.4 }}
          />
          <input
            ref={inputRef}
            type="text"
            className="customSearchBox"
            spellCheck="false"
            autoCapitalize="none"
            autoComplete="off"
            aria-label={props.ariaLabel}
            value={input}
            onChange={async (e) => onInput(e.target.value)}
            onKeyUp={(event) => {
              if (event.key !== "Enter") {
                return;
              }
              if (cursor > -1) {
                onOptionChosen(options[cursor]);
              } else if (input.trim().length > 0) {
                props.onRawEnter(input);
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
            onBlur={() => {
              setTimeout(() => {
                setFocused(false);
                setCursor(-1);
              }, 16);
            }}
            placeholder={props.placeholderText}
            role="combobox"
          />
          <IconButton
            aria-label="clear query"
            sx={{ marginRight: 0.5 }}
            onClick={() => {
              inputRef.current?.focus();
              onInput("");
            }}>
            <ClearIcon fontSize="medium" className="menuIcon" />
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
              sx={{ marginRight: 0.65 }}
              onClick={props.onOpenSettings}>
              <SettingsIcon fontSize="small" className="menuIcon" />
            </IconButton>
          </div>
        )}
      </div>
    </div>
  );
}
