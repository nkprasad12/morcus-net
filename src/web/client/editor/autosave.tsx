import { useState, useEffect, useCallback } from "react";

const SAVE_INTERVAL_MS = 5000;
const SAVED_DRAFT_KEY = "editor_content";

export function useAutosave(ref: React.RefObject<HTMLTextAreaElement>) {
  const [lastSaved, setLastSaved] = useState("");

  const saveDraft = useCallback(() => {
    const currentText = ref.current?.value;
    if (currentText === undefined || currentText === lastSaved) {
      return;
    }
    // TODO: Consider OPFS or the File System Access API later.
    // Local Storage has a limit and we don't want to waste it
    // all here.
    localStorage.setItem(SAVED_DRAFT_KEY, currentText);
    setLastSaved(currentText);
  }, [lastSaved, ref]);

  // Load saved draft on mount.
  useEffect(() => {
    const savedValue = localStorage.getItem(SAVED_DRAFT_KEY);
    if (savedValue === null) {
      return;
    }
    setLastSaved(savedValue);
    if (ref.current !== null) {
      ref.current.value = savedValue;
    }
  }, [ref]);

  // Save every so often.
  useEffect(() => {
    const intervalKey = setInterval(saveDraft, SAVE_INTERVAL_MS);
    return () => clearInterval(intervalKey);
  }, [saveDraft]);

  // Save when leaving the page.
  useEffect(() => {
    const saveOnHidden = () => {
      if (document.visibilityState === "hidden") {
        saveDraft();
      }
    };
    document.addEventListener("visibilitychange", saveOnHidden);
    return () => document.removeEventListener("visibilitychange", saveOnHidden);
  }, [saveDraft]);
}
