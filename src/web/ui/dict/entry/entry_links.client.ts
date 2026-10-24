import {
  canSwapWordOnHover,
  createWordSpan,
  isPlainLeftClick,
  swapWordSpanForLink,
  tokenizeTargets,
  type LifetimeScope,
} from "@/web/ui/core/index.client";
import { handleDictPermalinkClick } from "@/web/ui/dict/entry/dict_permalink.client";

/**
 * Classes of elements whose text is not split into lookup links: headwords,
 * emphasis, hover notes, sense bullets, anchors and links. Matched as
 * substrings of `className` (so `lsOrth` also covers `lsOrthSub` etc.).
 */
const NO_WORD_LINK_CLASSES =
  /lsOrth|lsEmph|lsHover|lsSenseBullet|section-anchor|toc|dLink|action-btn|mateo-embed-pane/;

/**
 * Tokenizes `.entry-content` (and `[data-tokenize-target='true']`) inside
 * `container` into `<span class="lat-word">` lookup targets, skipping
 * headwords, sense bullets, hover notes, and existing links.
 *
 * Words become plain spans, not links: a long entry has thousands of them
 * (about 5,900 for `sum`), and as anchors they would all sit in the tab
 * order and in a screen reader's links list. The click listener on the
 * results handles lookup, and `bindEntryResultInteractions` gives a word a
 * real `href` while the mouse is over it. Not building an `href` per word
 * also keeps this tokenize pass, which runs right after paint, shorter.
 */
export function enhanceEntryWords(container: HTMLElement | null): void {
  if (!container) return;

  tokenizeTargets(container, {
    targetSelector: "[data-tokenize-target='true'], .entry-content",
    enhancedDatasetKey: "wordsEnhanced",
    isExcludedElement: (node) => {
      const cls = node.className;
      return typeof cls === "string" && NO_WORD_LINK_CLASSES.test(cls);
    },
    renderWord: (token, cleanWord) =>
      createWordSpan(token, { word: cleanWord }),
  });
}

interface EntryResultsInteractionOptions {
  /** Builds the `/dicts?q=...` lookup href for a hovered Latin word. */
  getWordHref: (word: string) => string;
  /** Runs an in-place dictionary lookup when a `.lat-word` or `.dLink` is clicked. */
  onSelectWord: (word: string) => void;
}

/**
 * Attaches hover-to-link (`pointerover`) and click delegation (`.lat-word`,
 * `.dLink`, and subsection permalink copy) onto `#dict-results`.
 */
export function bindEntryResultInteractions(
  scope: LifetimeScope<string>,
  resultsElement: HTMLElement,
  options: EntryResultsInteractionOptions
): void {
  // Turns the word under the mouse into a real link, so middle-click,
  // Ctrl+click and the context menu's "Open in new tab" and "Copy link" work
  // on it. Those all require hovering first, so making only hovered words
  // links keeps the rest of the entry free of anchors. The swapped anchor
  // stays; hovering it again only refreshes its `href`, which matters when
  // the dictionary settings changed without the results being re-fetched
  // (the search box was empty, or the fetch failed).
  scope.listen(resultsElement, "pointerover", (e: PointerEvent) => {
    if (!(e.target instanceof Element)) return;
    const wordEl = e.target.closest<HTMLElement>(".lat-word");
    if (!wordEl || !canSwapWordOnHover(e, wordEl)) return;
    const word = wordEl.dataset.word || wordEl.textContent?.trim() || "";
    if (!word) return;
    swapWordSpanForLink(wordEl, options.getWordHref(word));
  });

  scope.listen(resultsElement, "click", (e: MouseEvent) => {
    if (e.defaultPrevented || !(e.target instanceof Element)) return;
    if (!isPlainLeftClick(e)) return;

    if (handleDictPermalinkClick(e, e.target)) {
      return;
    }

    const wordEl = e.target.closest<HTMLElement>(".lat-word");
    if (wordEl) {
      // Word in our results; runs the lookup in place
      e.preventDefault();
      const word = wordEl.dataset.word || wordEl.textContent?.trim() || "";
      if (word) {
        options.onSelectWord(word);
      }
      return;
    }

    const dLinkEl = e.target.closest<HTMLElement>(".dLink");
    if (dLinkEl) {
      // Link in our results; runs the lookup in place
      e.preventDefault();
      const toWord =
        dLinkEl.getAttribute("to") ||
        dLinkEl.dataset.to ||
        (dLinkEl instanceof HTMLAnchorElement &&
          new URL(dLinkEl.href, window.location.origin).searchParams.get(
            "q"
          )) ||
        dLinkEl.textContent?.trim() ||
        "";
      if (toWord) {
        options.onSelectWord(toWord);
      }
    }
  });
}
