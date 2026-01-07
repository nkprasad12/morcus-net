import { useState, KeyboardEvent, flushSync } from "react";

import { ResizeablePanels } from "@/web/client/components/draggables";
import { OMNIBAR_ID } from "@/web/client/editor/omnibar";
import { HelpContent } from "@/web/client/editor/help_panel";
import type { HelpView } from "@/web/client/editor/help_types";

interface MainContentProps {
  onSearchTrigger: () => void;
}

function MainContent({ onSearchTrigger }: MainContentProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "/") {
      return;
    }
    e.preventDefault();
    onSearchTrigger();
  };

  return (
    <div style={{ padding: "8px", height: "100%", boxSizing: "border-box" }}>
      <textarea
        spellcheck={false}
        className="text md textField"
        style={{ width: "100%", height: "100%" }}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}

export function Editor() {
  const [helpState, setHelpState] = useState<HelpView | null>(null);

  return (
    <ResizeablePanels sideClass="editorSide">
      <MainContent
        onSearchTrigger={() => {
          flushSync(() => {
            setHelpState(null);
          });
          document.getElementById(OMNIBAR_ID)?.focus();
        }}
      />
      <HelpContent helpState={helpState} setHelpState={setHelpState} />
    </ResizeablePanels>
  );
}
