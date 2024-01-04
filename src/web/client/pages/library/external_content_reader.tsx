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
import { useEffect, useState } from "react";
import { exhaustiveGuard } from "@/common/misc_utils";
import React from "react";
import { ContentBox } from "@/web/client/pages/dictionary/sections";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";

export function ExternalContentReader() {
  return (
    <BaseReader<MainColumnProps>
      MainColumn={MainColumn}
      dictActionMessage="Double click"
    />
  );
}

interface InternalReaderState {
  text: string;
  setText: (has: string) => any;
  setCurrentTab: (tab: MainTab) => any;
}
const DEFAULT_INTERNAL_STATE: InternalReaderState = {
  text: "",
  setText: () => {},
  setCurrentTab: () => {},
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
  const [text, setText] = useState("");

  const { onWordSelected } = props;

  useEffect(() => {
    const doubleClickListener = () => {
      const selection = document.getSelection();
      if (selection === null) {
        return;
      }
      const selectedText = selection.toString();
      const words: string[] = [];
      processWords(selectedText, (word) => words.push(word));
      document.getSelection()?.empty();
      onWordSelected(words[0]);
    };
    document.addEventListener("dblclick", doubleClickListener);
    return () => document.removeEventListener("dblclick", doubleClickListener);
  }, [onWordSelected]);

  return (
    <ContentBox isSmall>
      <>
        <ReaderInternalNavbar
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          tabs={text.length > 0 ? LOADED_ICONS : BASE_ICONS}
        />
        <InternalReaderContext.Provider
          value={{ text, setText, setCurrentTab }}>
          <RenderTab current={currentTab} />
        </InternalReaderContext.Provider>
      </>
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
          <div>
            <span className="text sm light">
              In progress: other import types coming soon.
            </span>
          </div>
          <div>
            <span className="text md">
              Enter text below and click submit to import.
            </span>
          </div>
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
  const { setText, setCurrentTab } = React.useContext(InternalReaderContext);

  const [pendingText, setPendingText] = React.useState("");

  return (
    <>
      <TextField
        label="Enter text to import"
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
      <Button
        onClick={() => {
          setText(pendingText);
          setCurrentTab("Text reader");
        }}
        variant="contained"
        className="nonDictText"
        aria-label="Import text"
        sx={{ mt: 2, display: "block" }}>
        {"Import"}
      </Button>
    </>
  );
}
