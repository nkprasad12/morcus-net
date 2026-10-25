import { copyText } from "@/web/ui/core/widgets/clipboard.client";
import { showToast } from "@/web/ui/core/widgets/toast.client";

const COPIED_CLASS = "is-copied";
const COPIED_DURATION_MS = 1400;

/**
 * Copies `url` to the clipboard, shows a toast, and flashes `.is-copied` on
 * `control`. If the clipboard write fails, falls back to navigating to `url` so
 * the user still ends up with a shareable URL in the address bar rather than a
 * click that silently did nothing.
 */
export async function copyOrNavigate(
  url: string,
  message: string,
  control: HTMLElement
): Promise<void> {
  const copied = await copyText(url);
  if (!copied) {
    window.location.assign(url);
    return;
  }
  showToast(message);
  control.classList.add(COPIED_CLASS);
  window.setTimeout(
    () => control.classList.remove(COPIED_CLASS),
    COPIED_DURATION_MS
  );
}
