import { useCallback, useEffect, useState } from "react";

import { DictionaryViewV2 } from "@/web/client/pages/dictionary/dictionary_v2";
import type { EmbeddedDictOptions } from "@/web/client/pages/dictionary/dict_context";
import { Omnibar } from "@/web/client/editor/omnibar";
import {
  ALL_HELP_TYPE_INFOS,
  type HelpView,
  type HelpViewInformation,
} from "@/web/client/editor/edit_help_types";
import { exhaustiveGuard } from "@/common/misc_utils";

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

function LandingView(props: HelpContentProps) {
  const { setHelpState } = props;

  const requestHelp = useCallback(
    (helpView: HelpViewInformation) => setHelpState(helpView.name),
    [setHelpState]
  );

  return (
    <Omnibar onHelpRequested={requestHelp} helpOptions={ALL_HELP_TYPE_INFOS} />
  );
}

function chooseView(props: HelpContentProps): JSX.Element {
  const { helpState } = props;
  switch (helpState) {
    case null:
      return <LandingView {...props} />;
    case "dict":
      return <EmbeddedDictView />;
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
