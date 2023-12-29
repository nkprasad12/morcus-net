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
import { AppText } from "@/web/client/pages/library/reader_utils";
import { FontSizes } from "@/web/client/styles";
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
  scale: number;
  setCurrentTab: (tab: MainTab) => any;
  readerRef: React.RefObject<HTMLDivElement>;
}
const DEFAULT_INTERNAL_STATE: InternalReaderState = {
  text: "",
  setText: () => {},
  scale: 100,
  setCurrentTab: () => {},
  readerRef: React.createRef<HTMLDivElement>(),
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
  const readerRef = React.useRef<HTMLDivElement>(null);

  const { onWordSelected } = props;

  useEffect(() => {
    const selectListener = () => {
      const selection = document.getSelection();
      if (selection === null) {
        return;
      }
      const selectedText = selection.toString();
      if (selectedText.length === 0) {
        return;
      }
      const words: string[] = [];
      processWords(selectedText, (word) => words.push(word));
      if (words.length === 0 || words[0].length === 0) {
        return;
      }
      onWordSelected(words[0]);
      document.getSelection()?.empty();
    };
    const contextMenuBlocker = (e: Event) => {
      e.preventDefault();
      return false;
    };
    const target = document;
    target?.addEventListener("selectionchange", selectListener);
    target?.addEventListener("contextmenu", contextMenuBlocker);
    const cleanup = () => {
      target?.removeEventListener("selectionchange", selectListener);
      target?.removeEventListener("contextmenu", contextMenuBlocker);
    };
    return cleanup;
  }, [onWordSelected, text]);

  return (
    <ContentBox isSmall textScale={props.scale}>
      <>
        <ReaderInternalNavbar
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          tabs={text.length > 0 ? LOADED_ICONS : BASE_ICONS}
        />
        <InternalReaderContext.Provider
          value={{
            text,
            setText,
            scale: props.scale,
            setCurrentTab,
            readerRef,
          }}>
          <RenderTab current={currentTab} />
        </InternalReaderContext.Provider>
      </>
    </ContentBox>
  );
}

function RenderTab(props: { current: MainTab }) {
  const { text, scale, readerRef } = React.useContext(InternalReaderContext);
  const tab = props.current;
  switch (tab) {
    case "Load text":
      return (
        <div>
          <div>
            <AppText light size={FontSizes.SECONDARY} scale={scale}>
              In progress: other import types coming soon.
            </AppText>
          </div>
          <div>
            <AppText scale={scale}>
              Enter text below and click submit to import.
            </AppText>
          </div>
          <InputContentBox />
        </div>
      );
    case "Text reader":
      return (
        <div>
          <div style={{ paddingTop: "8px", paddingBottom: "8px" }}>
            <AppText scale={scale} light size={FontSizes.SECONDARY}>
              Reading imported text
            </AppText>
          </div>
          <div ref={readerRef}>
            <AppText scale={scale}>{text}</AppText>
          </div>
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
