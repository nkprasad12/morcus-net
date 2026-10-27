import {
  copyOrNavigate,
  flashElement,
  openSectionActionMenu,
} from "@/web/ui/core/index.client";

const HIGHLIGHT_CLASS = "target-active";

/**
 * Click-to-copy and in-flow correction menu behaviour for dictionary permalinks.
 *
 * Both controls are real anchors in the SSR markup, so the permalink exists and
 * is shareable with JS disabled. When JS is present we intercept the click:
 * - Search-level or article-level `a.copy-pill` copies the permalink in one click.
 * - Sense-level `a.section-anchor` opens an anchored menu with "Copy permalink"
 *   and "Suggest correction".
 *
 * Returns true if the click was consumed.
 */
export function handleDictPermalinkClick(
  event: MouseEvent,
  target: Element
): boolean {
  const pill = target.closest<HTMLAnchorElement>("a.copy-pill");
  if (pill) {
    // Pill in dict-search's results; copies the link
    event.preventDefault();
    const message = pill.classList.contains("dict-search-copy")
      ? "Copied link to this search"
      : "Copied link to this article";
    void copyOrNavigate(pill.href, message, pill);
    return true;
  }

  const sectionAnchor = target.closest<HTMLAnchorElement>("a.section-anchor");
  if (sectionAnchor) {
    const url = sectionPermalink(sectionAnchor);
    if (url === undefined) {
      // No resolvable article id: leave the plain in-page jump alone.
      return false;
    }
    // Suppressing the default also suppresses the global smooth-scroll handler
    // (core/nav/anchor_scroll.client.ts), which is deliberate. Copying a link or opening the action
    // menu should not move the viewport out from under the user.
    // Anchor in dict-search's results; opens the menu
    event.preventDefault();
    const senseId = (sectionAnchor.getAttribute("href") ?? "").slice(1);
    const bulletText = (sectionAnchor.textContent ?? "").trim();
    const label = bulletText ? `sense ${bulletText}` : `#${senseId}`;

    openSectionActionMenu({
      anchor: sectionAnchor,
      sectionId: senseId,
      label,
      reportUrl: url,
      onCopy: () => {
        flashSection(sectionAnchor);
        void copyOrNavigate(url, "Copied link to this section", sectionAnchor);
      },
      getContentNodes: () => getDictSenseContentNodes(sectionAnchor),
    });
    return true;
  }

  return false;
}

/**
 * Collects the child nodes of `anchor.parentElement` following `anchor` that
 * belong to this sense, stopping before any child `<ol>` list or nested
 * sub-sense container (such as Georges `<div id="grg123.I.1">`).
 */
function getDictSenseContentNodes(anchor: HTMLElement): ChildNode[] {
  const nodes: ChildNode[] = [];
  let curr = anchor.nextSibling;
  while (curr) {
    if (
      curr instanceof HTMLElement &&
      (curr.tagName === "OL" ||
        curr.matches("a.section-anchor") ||
        curr.querySelector("a.section-anchor") !== null)
    ) {
      break;
    }
    nodes.push(curr);
    curr = curr.nextSibling;
  }
  return nodes;
}

function sectionPermalink(anchor: HTMLAnchorElement): string | undefined {
  const href = anchor.getAttribute("href") ?? "";
  if (!href.startsWith("#") || href.length < 2) {
    return undefined;
  }
  // Recovered from the DOM rather than by splitting the sense id, because sense
  // id conventions differ per lexicon and the article already carries its id.
  const articleId = anchor.closest<HTMLElement>(".entry")?.id;
  if (!articleId) {
    return undefined;
  }
  return `${window.location.origin}/dicts/id/${encodeURIComponent(
    articleId
  )}${href}`;
}

/** Briefly highlights the copied section in place, without scrolling to it. */
function flashSection(anchor: HTMLAnchorElement): void {
  const targetId = (anchor.getAttribute("href") ?? "").slice(1);
  const targetEl = targetId ? document.getElementById(targetId) : null;
  const element = targetEl ?? anchor;
  flashElement(element, HIGHLIGHT_CLASS);
}
