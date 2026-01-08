import {
  useState,
  KeyboardEvent,
  useRef,
  useCallback,
  useLayoutEffect,
} from "react";

import { ResizeablePanels } from "@/web/client/components/draggables";
import { OMNIBAR_ID } from "@/web/client/editor/omnibar";
import { HelpContent } from "@/web/client/editor/help_panel";
import type { HelpView } from "@/web/client/editor/help_types";
import { useAutosave } from "@/web/client/editor/autosave";

interface MainContentProps {
  onHelpTrigger: (text: string, cursor: number) => void;
}

function MainContent({ onHelpTrigger }: MainContentProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useAutosave(textareaRef);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "/") {
      return;
    }
    e.preventDefault();
    if (textareaRef.current === null) {
      return;
    }
    const text = textareaRef.current.value;
    const cursor = textareaRef.current.selectionStart;
    onHelpTrigger(text, cursor);
  };

  return (
    <div style={{ padding: "8px", height: "100%", boxSizing: "border-box" }}>
      <textarea
        ref={textareaRef}
        spellcheck={false}
        className="text md textField"
        style={{ width: "100%", height: "100%" }}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}

// This hook is a hack to get around the fact that Preact doesn't
// have an implementation for `flushSync`. The alternative to this
// would be to have a small delay after setting the help state.
function useOmnibarFocus() {
  const [focusTrigger, setFocusTrigger] = useState(0);

  // Use layout effect to ensure that focus happens before the browser paints.
  // This prevents a visual flicker where the omnibar appears, and then gains focus
  // which opens a menu.
  useLayoutEffect(() => {
    if (focusTrigger > 0) {
      document.getElementById(OMNIBAR_ID)?.focus();
    }
  }, [focusTrigger]);

  return useCallback(() => setFocusTrigger((prev) => prev + 1), []);
}

export function Editor() {
  const [helpState, setHelpState] = useState<HelpView | null>(null);

  const focusOmnibar = useOmnibarFocus();

  return (
    <ResizeablePanels sideClass="editorSide">
      <MainContent
        onHelpTrigger={() => {
          setHelpState(null);
          focusOmnibar();
        }}
      />
      <HelpContent helpState={helpState} setHelpState={setHelpState} />
    </ResizeablePanels>
  );
}
