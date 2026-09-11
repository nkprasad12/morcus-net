import { copyText, showToast } from "@/web/v2/core/index.client";

const COPIED_CLASS = "is-copied";
const COPIED_DURATION_MS = 1400;
const HIGHLIGHT_CLASS = "v2-target-active";

/**
 * Click-to-copy behaviour for dictionary permalinks.
 *
 * Both controls are real anchors in the SSR markup, so the permalink exists and
 * is shareable with JS disabled. When JS is present we intercept the click and
 * copy instead of navigating: the article is already rendered on the page, so
 * navigating to `/v2/dicts/id/:id` would spend a server render to show the user
 * what they are already looking at.
 *
 * Returns true if the click was consumed.
 */
export function handleDictPermalinkClick(
  event: MouseEvent,
  target: Element
): boolean {
  const pill = target.closest<HTMLAnchorElement>("a.v2-copy-pill");
  if (pill) {
    event.preventDefault();
    void copyOrNavigate(pill.href, "Copied link to this article", pill);
    return true;
  }

  const sectionAnchor = target.closest<HTMLAnchorElement>(
    "a.v2-section-anchor"
  );
  if (sectionAnchor) {
    const url = sectionPermalink(sectionAnchor);
    if (url === undefined) {
      // No resolvable article id: leave the plain in-page jump alone.
      return false;
    }
    // Suppressing the default also suppresses the global smooth-scroll handler
    // in v2_bundle, which is deliberate. Copying a link should not move the
    // viewport out from under the user.
    event.preventDefault();
    flashSection(sectionAnchor);
    void copyOrNavigate(url, "Copied link to this section", sectionAnchor);
    return true;
  }

  return false;
}

function sectionPermalink(anchor: HTMLAnchorElement): string | undefined {
  const href = anchor.getAttribute("href") ?? "";
  if (!href.startsWith("#") || href.length < 2) {
    return undefined;
  }
  // Recovered from the DOM rather than by splitting the sense id, because sense
  // id conventions differ per lexicon and the article already carries its id.
  const articleId = anchor.closest<HTMLElement>(".v2-entry")?.id;
  if (!articleId) {
    return undefined;
  }
  return `${window.location.origin}/v2/dicts/id/${encodeURIComponent(
    articleId
  )}${href}`;
}

/** Briefly highlights the copied section in place, without scrolling to it. */
function flashSection(anchor: HTMLAnchorElement): void {
  const targetId = (anchor.getAttribute("href") ?? "").slice(1);
  const targetEl = targetId ? document.getElementById(targetId) : null;
  const element = targetEl ?? anchor;
  element.classList.remove(HIGHLIGHT_CLASS);
  // Force a reflow so the keyframe restarts on repeated clicks.
  void element.offsetWidth;
  element.classList.add(HIGHLIGHT_CLASS);
  element.addEventListener(
    "animationend",
    () => element.classList.remove(HIGHLIGHT_CLASS),
    { once: true }
  );
}

async function copyOrNavigate(
  url: string,
  message: string,
  control: HTMLElement
): Promise<void> {
  const copied = await copyText(url);
  if (!copied) {
    // Fall back to navigating so the user still ends up with a shareable URL in
    // the address bar, rather than a click that silently did nothing.
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
