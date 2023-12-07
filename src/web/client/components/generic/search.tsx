import React from "react";

import SettingsIcon from "@mui/icons-material/Settings";
import SearchIcon from "@mui/icons-material/Search";
import IconButton from "@mui/material/IconButton";
import Popper from "@mui/material/Popper";

function spacing(input: number): string {
  return `${input * 8}px`;
}

export function SearchBox<T>(props: {
  smallScreen?: boolean;
  autoFocused?: boolean;
  placeholderText?: string;
  onOpenSettings?: () => any;
  onRawEnter: (input: string) => any;
  optionsForInput?: (input: string) => T[] | Promise<T[]>;
  onOptionSelected?: (t: T) => any;
  RenderOption?: (props: { option: T }) => JSX.Element;
  toKey?: (t: T) => string;
  toInputDisplay?: (t: T) => string;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [focused, setFocused] = React.useState(props.autoFocused === true);
  const [interactingWithPopup, setInteractingWithPopup] = React.useState(false);
  const [input, setInput] = React.useState<string>("");
  const [loading, setLoading] = React.useState<boolean>(false);
  const [options, setOptions] = React.useState<T[]>([]);

  const smallScreen = props.smallScreen === true;
  const containerClasses = ["customSearchContainer"];
  if (focused) {
    containerClasses.push("customSearchContainerFocused");
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
          open={
            containerRef.current !== null &&
            (focused || interactingWithPopup) &&
            (options.length > 0 || loading)
          }
          anchorEl={containerRef.current}
          placement="bottom"
        >
          <div
            className="customSearchPopup"
            style={{
              width: containerRef.current?.offsetWidth,
              maxHeight: window.innerHeight * 0.4,
            }}
            onMouseOver={() => setInteractingWithPopup(true)}
            onMouseOut={() => setInteractingWithPopup(false)}
          >
            {loading && options.length === 0 && (
              <div className="customSearchPopupOption">Loading options</div>
            )}
            {options.length > 0 &&
              options.map((t) => (
                <div
                  className="customSearchPopupOption"
                  key={props.toKey!(t)}
                  onClick={() => {
                    props.onOptionSelected!(t);
                    setInput(props.toInputDisplay!(t));
                    setInteractingWithPopup(false);
                  }}
                >
                  {props.RenderOption ? (
                    <props.RenderOption option={t} />
                  ) : (
                    JSON.stringify(t)
                  )}
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
            setLoading(true);
            setOptions(await props.optionsForInput(newInput));
            setLoading(false);
          }}
          onKeyUp={(event) => {
            if (event.key === "Enter" && input.trim().length > 0) {
              props.onRawEnter(input);
              setFocused(false);
              inputRef.current?.blur();
            }
          }}
          autoFocus={props.autoFocused}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
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
