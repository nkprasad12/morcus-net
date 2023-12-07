import React from "react";

import SettingsIcon from "@mui/icons-material/Settings";
import SearchIcon from "@mui/icons-material/Search";
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
  onRawEnter: (input: string) => any;
  optionsForInput: (input: string) => T[] | Promise<T[]>;
  onOptionSelected: (t: T) => any;
  RenderOption: (props: { option: T }) => JSX.Element;
  toKey: (t: T) => string;
  toInputDisplay: (t: T) => string;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [focused, setFocused] = React.useState(props.autoFocused === true);
  const [mouseOnPopup, setMouseOnPopup] = React.useState(false);
  const [cursor, setCursor] = React.useState(-1);
  const [input, setInput] = React.useState<string>("");
  const [loading, setLoading] = React.useState<boolean>(false);
  const [options, setOptions] = React.useState<T[]>([]);

  React.useEffect(() => {
    if (cursor < 0 || options.length === 0) {
      return;
    }
    const id = props.toKey(options[cursor]);
    const element = document.getElementById(id);
    if (element === null) {
      return;
    }
    // @ts-ignore
    element.scrollIntoView({ behavior: "instant", block: "nearest" });
  }, [cursor]);

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
    const newInput = props.toInputDisplay(t);
    setInput(newInput);
    setMouseOnPopup(false);
    setCursor(-1);
    setFocused(false);
    props.onOptionSelected(t);
    inputRef.current?.blur();
    setOptions(await props.optionsForInput(newInput));
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
      }}
    >
      <div
        className={containerClasses.join(" ")}
        style={{ display: "flex", alignItems: "center" }}
        ref={containerRef}
      >
        <Popper
          open={popperOpen}
          anchorEl={containerRef.current}
          placement="bottom"
        >
          <div
            className="customSearchPopup"
            style={{
              width: containerRef.current?.offsetWidth,
              maxHeight: window.innerHeight * 0.4,
            }}
            onMouseOver={() => setMouseOnPopup(true)}
            onMouseOut={() => setMouseOnPopup(false)}
          >
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
                  onMouseOver={() => setCursor(i)}
                >
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
          value={input}
          onChange={async (e) => {
            const newInput = e.target.value;
            setInput(newInput);
            if (props.optionsForInput === undefined) {
              return;
            }
            inputRef.current?.selectionStart;
            setLoading(true);
            setOptions(await props.optionsForInput(newInput));
            setCursor(-1);
            setLoading(false);
          }}
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
            setFocused(false);
            setCursor(-1);
          }}
          placeholder={props.placeholderText}
          role="combobox"
        />
        {props.onOpenSettings && (
          <IconButton
            aria-label="search settings"
            aria-haspopup="true"
            sx={{ marginRight: 0.5 }}
            onClick={props.onOpenSettings}
            id="DictSearchSettingsButton"
          >
            <SettingsIcon fontSize="medium" className="menuIcon" />
          </IconButton>
        )}
      </div>
    </div>
  );
}
