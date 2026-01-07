import { useCallback, useEffect, useState } from "react";

import { DictionaryViewV2 } from "@/web/client/pages/dictionary/dictionary_v2";
import type { EmbeddedDictOptions } from "@/web/client/pages/dictionary/dict_context";
import { Omnibar } from "@/web/client/editor/omnibar";
import {
  ALL_HELP_TYPE_INFOS,
  type HelpView,
  type HelpViewInformation,
} from "@/web/client/editor/help_types";
import { exhaustiveGuard } from "@/common/misc_utils";
import { CorpusQueryPage } from "@/web/client/pages/corpus/corpus_view";
import { RouteContext, RouteInfo } from "@/web/client/router/router_v2";

const BOX_STYLE: React.CSSProperties = {
  height: "100%",
  padding: "8px",
  boxSizing: "border-box",
};

const DICT_OPTIONS: EmbeddedDictOptions = {
  hideableOutline: true,
  skipJumpToResult: true,
};

function EmbeddedDictView() {
  const [dictWord, setDictWord] = useState<string | undefined>(undefined);

  return (
    <DictionaryViewV2
      textScale={80}
      embedded
      embeddedOptions={DICT_OPTIONS}
      initial={dictWord}
      setInitial={setDictWord}
    />
  );
}

function EmbeddedCorpusView() {
  const [route, setRoute] = useState<RouteInfo>({ path: "corpus" });

  return (
    <RouteContext.Provider value={{ route, navigateTo: setRoute }}>
      <CorpusQueryPage />
    </RouteContext.Provider>
  );
}

function LandingView(props: HelpContentProps) {
  const { setHelpState } = props;

  const requestHelp = useCallback(
    (helpView: HelpViewInformation) => setHelpState(helpView.name),
    [setHelpState]
  );

  return (
    <>
      <Omnibar
        onHelpRequested={requestHelp}
        helpOptions={ALL_HELP_TYPE_INFOS}
      />
      <div className="text sm light" style={{ margin: "8px 4px 0px" }}>
        Welcome to the editor! Type Latin in the text area. While editing, you
        can use the special key <code>/</code> (backslash) to trigger dictionary
        lookups, tables, corpus queries, and more.
      </div>
      <div className="text sm light" style={{ margin: "8px 4px 0px" }}>
        Any text you write will be automatically saved, but please note that{" "}
        <b>saved text will be removed if you clear your browser data</b>. It is
        recommended to periodically copy your text elsewhere to avoid accidental
        loss of data.
      </div>
    </>
  );
}

function chooseView(props: HelpContentProps): JSX.Element {
  const { helpState } = props;
  switch (helpState) {
    case null:
      return <LandingView {...props} />;
    case "dict":
      return <EmbeddedDictView />;
    case "corpus":
      return <EmbeddedCorpusView />;
  }
  exhaustiveGuard(helpState);
}

export interface HelpContentProps {
  helpState: HelpView | null;
  setHelpState: (view: HelpView | null) => void;
}

export function HelpContent(props: HelpContentProps) {
  useEffect(() => {}, []);

  return <div style={BOX_STYLE}>{chooseView(props)}</div>;
}
