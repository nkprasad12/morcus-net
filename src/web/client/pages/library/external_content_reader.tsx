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

export function ExternalContentReader() {
  return (
    <BaseReader<MainColumnProps>
      MainColumn={MainColumn}
      dictActionMessage="Double click"
    />
  );
}

interface InternalReaderState {
  hasText: boolean;
  setHasText: (has: boolean) => any;
}
const DEFAULT_INTERNAL_STATE: InternalReaderState = {
  hasText: false,
  setHasText: () => {},
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
  const [hasText, setHasText] = useState(false);

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
    // <>
    //   <iframe
    //     width="100%"
    //     height="90%"
    //     src="https://www.thelatinlibrary.com/apuleius/apuleius1.shtml"
    //   />
    //   <span>Gallia est omnis divisa.</span>
    // </>
    <ContentBox isSmall textScale={props.scale}>
      <>
        <ReaderInternalNavbar
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          tabs={hasText ? LOADED_ICONS : BASE_ICONS}
        />
        <InternalReaderContext.Provider value={{ hasText, setHasText }}>
          <RenderTab current={currentTab} />
        </InternalReaderContext.Provider>
      </>
    </ContentBox>
  );
}

function RenderTab(props: { current: MainTab }) {
  const { hasText, setHasText } = React.useContext(InternalReaderContext);
  const tab = props.current;
  switch (tab) {
    case "Load text":
      return <span onClick={() => setHasText(!hasText)}>Toggle</span>;
    case "Text reader":
      return <span>Gallia est omnis</span>;
    default:
      exhaustiveGuard(tab);
  }
}
