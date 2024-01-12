import { processWords } from "@/common/text_cleaning";
import {
  BaseMainColumnProps,
  BaseReader,
} from "@/web/client/pages/library/base_reader";
import {
  ReaderInternalNavbar,
  ReaderInternalTabConfig,
} from "@/web/client/pages/library/reader_sidebar_components";
import EditIcon from "@mui/icons-material/Edit";
import AutoStoriesIcon from "@mui/icons-material/AutoStories";
import { useState } from "react";
import { exhaustiveGuard } from "@/common/misc_utils";
import React from "react";
import { ContentBox } from "@/web/client/pages/dictionary/sections";
import TextField from "@mui/material/TextField";

export function ExternalContentReader() {
  return (
    <BaseReader<MainColumnProps>
      MainColumn={MainColumn}
      dictActionMessage="Click on"
    />
  );
}

interface InternalReaderState {
  text: JSX.Element | null;
  setText: (data: JSX.Element) => any;
  setCurrentTab: (tab: MainTab) => any;
  onWordSelected: (word: string) => any;
}
const DEFAULT_INTERNAL_STATE: InternalReaderState = {
  text: null,
  setText: () => {},
  setCurrentTab: () => {},
  onWordSelected: () => {},
};
const InternalReaderContext: React.Context<InternalReaderState> =
  React.createContext(DEFAULT_INTERNAL_STATE);

type MainTab = "Load text" | "Text reader";
const LOAD_ICON: ReaderInternalTabConfig<MainTab> = {
  Icon: <EditIcon />,
  tab: "Load text",
};
const READER_ICON: ReaderInternalTabConfig<MainTab> = {
  Icon: <AutoStoriesIcon />,
  tab: "Text reader",
};
const BASE_ICONS = [LOAD_ICON];
const LOADED_ICONS = [LOAD_ICON, READER_ICON];

interface MainColumnProps {}
function MainColumn(props: MainColumnProps & BaseMainColumnProps) {
  const [currentTab, setCurrentTab] = useState<MainTab>("Load text");
  const [text, setText] = useState<JSX.Element | null>(null);

  const { onWordSelected } = props;

  return (
    <ContentBox
      isSmall
      mt={props.isMobile ? 0 : undefined}
      className={props.isMobile ? "extReaderMobile" : undefined}>
      <ReaderInternalNavbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        tabs={text !== null ? LOADED_ICONS : BASE_ICONS}
      />
      <div
        style={{
          paddingLeft: props.isMobile ? "12px" : undefined,
          paddingRight: props.isMobile ? "12px" : undefined,
        }}>
        <InternalReaderContext.Provider
          value={{ text, setText, setCurrentTab, onWordSelected }}>
          <RenderTab current={currentTab} />
        </InternalReaderContext.Provider>
      </div>
    </ContentBox>
  );
}

function RenderTab(props: { current: MainTab }) {
  const { text } = React.useContext(InternalReaderContext);
  const tab = props.current;
  switch (tab) {
    case "Load text":
      return (
        <div>
          <div className="text md">Enter raw text below.</div>
          <div className="text sm light">Other import types coming soon.</div>
          <InputContentBox />
        </div>
      );
    case "Text reader":
      return (
        <div>
          <div style={{ paddingTop: "8px", paddingBottom: "8px" }}>
            <span className="text sm light">Reading imported text</span>
          </div>
          <span className="text md">{text}</span>
        </div>
      );
    default:
      exhaustiveGuard(tab);
  }
}

function InputContentBox() {
  const { setText, setCurrentTab, onWordSelected } = React.useContext(
    InternalReaderContext
  );

  const [pendingText, setPendingText] = React.useState("");

  return (
    <div style={{ marginTop: "8px" }}>
      <TextField
        multiline
        fullWidth
        rows={10}
        variant="filled"
        inputProps={{ spellCheck: "false" }}
        InputLabelProps={{
          className: "macronLabel",
        }}
        onChange={(e) => {
          setPendingText(e.target.value);
        }}
      />
      <button
        aria-label="Import text"
        className="button text md"
        onClick={() => {
          setText(processedTextComponent(pendingText, onWordSelected));
          setCurrentTab("Text reader");
        }}
        style={{ marginTop: "16px" }}>
        Import
      </button>
    </div>
  );
}

function processedTextComponent(
  input: string,
  onWordSelected: (word: string) => any
) {
  let key = 0;
  const children = processWords(input, (word) => {
    key += 1;
    return (
      <span key={key} className="latLink" onClick={() => onWordSelected(word)}>
        {word}
      </span>
    );
  });
  return <span>{children}</span>;
}
