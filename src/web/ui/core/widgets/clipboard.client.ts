/**
 * Clipboard helper for Morcus UI V2.
 *
 * `navigator.clipboard` is only exposed in secure contexts. That excludes plain
 * `http://` origins, which covers local dev servers and LAN previews, so the
 * `execCommand` path is a required fallback rather than a legacy nicety.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or non-secure context: fall through to the legacy path.
    }
  }
  return copyViaExecCommand(text);
}

function copyViaExecCommand(text: string): boolean {
  const scratch = document.createElement("textarea");
  scratch.value = text;
  scratch.setAttribute("readonly", "");
  // Keep it in the viewport so iOS Safari will actually select it, but invisible.
  scratch.style.position = "fixed";
  scratch.style.top = "0";
  scratch.style.left = "0";
  scratch.style.width = "1px";
  scratch.style.height = "1px";
  scratch.style.padding = "0";
  scratch.style.border = "none";
  scratch.style.opacity = "0";
  document.body.appendChild(scratch);

  const previousSelection = document.getSelection();
  const previousRange =
    previousSelection && previousSelection.rangeCount > 0
      ? previousSelection.getRangeAt(0)
      : null;
  // Focusing the scratch textarea takes focus from wherever it was (e.g. the
  // permalink the user clicked); removing it would leave focus on `<body>`.
  const previousFocus =
    document.activeElement instanceof HTMLElement &&
    document.activeElement !== document.body
      ? document.activeElement
      : null;

  try {
    // Focus without scrolling first: `select()` alone focuses the textarea,
    // and some browsers scroll the viewport to a newly focused element.
    scratch.focus({ preventScroll: true });
    scratch.select();
    scratch.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    scratch.remove();
    if (previousFocus?.isConnected) {
      previousFocus.focus({ preventScroll: true });
    }
    // Restore whatever the user had selected before we hijacked the selection.
    if (previousRange && previousSelection) {
      previousSelection.removeAllRanges();
      previousSelection.addRange(previousRange);
    }
  }
}
