/**
 * Shared transient confirmation toast for Morcus UI V2.
 *
 * A single `#v2-toast` node is created lazily on first use and then reused, so
 * pages that never trigger a toast pay nothing and repeated toasts do not leak
 * elements.
 */
const TOAST_ID = "v2-toast";
const DEFAULT_DURATION_MS = 2200;

let hideTimer: number | undefined;

function ensureToastElement(): HTMLElement {
  const existing = document.getElementById(TOAST_ID);
  if (existing) {
    return existing;
  }
  const toast = document.createElement("div");
  toast.id = TOAST_ID;
  toast.className = "v2-toast";
  // `status` + `polite` announces the confirmation without stealing focus.
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  document.body.appendChild(toast);
  return toast;
}

export function showToast(
  message: string,
  durationMs: number = DEFAULT_DURATION_MS
): void {
  const toast = ensureToastElement();
  toast.textContent = message;
  toast.classList.add("visible");
  if (hideTimer !== undefined) {
    window.clearTimeout(hideTimer);
  }
  hideTimer = window.setTimeout(() => {
    toast.classList.remove("visible");
    hideTimer = undefined;
  }, durationMs);
}
