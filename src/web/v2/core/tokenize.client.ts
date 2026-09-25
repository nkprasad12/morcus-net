import { processTokens, removeDiacritics } from "@/common/text_cleaning";

export interface TokenizeWordOptions {
  /**
   * Factory function that constructs the replacement DOM element for a Latin word token.
   * - Reader: creates `<span class="lat-word" role="button" tabindex="0" data-word="...">`
   * - Dictionary: creates `<a class="lat-word" href="..." data-word="...">`
   *
   * `wordIndex` is the 0-based word token index within `root` (incremented on every
   * `isWord === true` token produced by `processTokens`, matching corpus and V1 indexing).
   */
  renderWord: (
    token: string,
    cleanWord: string,
    wordIndex: number,
    root: HTMLElement
  ) => HTMLElement;

  /**
   * Optional custom exclusion predicate for domain-specific elements.
   * Returning true rejects this element and its entire subtree from tokenization.
   */
  isExcludedElement?: (element: HTMLElement) => boolean;

  /**
   * Dataset property key to mark elements that have been processed for idempotency.
   * Defaults to "wordsEnhanced".
   */
  enhancedDatasetKey?: string;
}

export interface TokenizeTargetsOptions extends TokenizeWordOptions {
  targetSelector?: string;
  fallbackSelector?: string;
}

const LATIN_LETTER_REGEX = /[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/;

/**
 * Checks whether a processed token constitutes a Latin word eligible for lookup.
 */
export function isLatinWord(
  token: string,
  isWord: boolean
): { isLatin: boolean; cleanWord: string } {
  const cleanWord = removeDiacritics(token).replaceAll("-", "").trim();
  const isLatin =
    isWord && !/\d/.test(token) && LATIN_LETTER_REGEX.test(cleanWord);
  return { isLatin, cleanWord };
}

/**
 * Traverses `root` with a TreeWalker, pruning non-tokenizable subtrees (links, buttons,
 * script, style, Greek text, and opted-out elements) and replacing Latin words
 * in text nodes with elements created by `options.renderWord`.
 */
export function tokenizeSubtree(
  root: HTMLElement,
  options: TokenizeWordOptions
): void {
  const key = options.enhancedDatasetKey ?? "wordsEnhanced";
  if (root.dataset[key] === "true") return;
  root.dataset[key] = "true";

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode(node: Node) {
        if (node instanceof HTMLElement) {
          const tag = node.tagName.toLowerCase();
          if (
            tag === "a" ||
            tag === "button" ||
            tag === "script" ||
            tag === "style" ||
            node.getAttribute("lang") === "el" ||
            node.hasAttribute("data-no-tokenize") ||
            node.hasAttribute("data-no-linkify") ||
            node.classList.contains("reader-gap") ||
            (options.isExcludedElement !== undefined &&
              options.isExcludedElement(node))
          ) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_SKIP;
        }
        if (node instanceof SVGElement) {
          return NodeFilter.FILTER_REJECT;
        }
        if (node instanceof Text) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      },
    }
  );

  const textNodes: Text[] = [];
  let curr: Node | null = walker.nextNode();
  while (curr) {
    if (curr instanceof Text && curr.nodeValue) {
      textNodes.push(curr);
    }
    curr = walker.nextNode();
  }

  let wordIndex = 0;
  for (const textNode of textNodes) {
    const text = textNode.nodeValue ?? "";
    const hasLatin = LATIN_LETTER_REGEX.test(text);

    const fragment = hasLatin ? document.createDocumentFragment() : null;
    let hasWords = false;

    for (const [token, isWord] of processTokens(text)) {
      const currentWordIndex = wordIndex;
      if (isWord) {
        wordIndex++;
      }
      if (!fragment) {
        continue;
      }
      const { isLatin, cleanWord } = isLatinWord(token, isWord);
      if (isLatin) {
        hasWords = true;
        fragment.appendChild(
          options.renderWord(token, cleanWord, currentWordIndex, root)
        );
      } else {
        fragment.appendChild(document.createTextNode(token));
      }
    }

    if (fragment && hasWords) {
      textNode.parentNode?.replaceChild(fragment, textNode);
    }
  }
}

/**
 * Queries target elements within `container` and applies `tokenizeSubtree` to each target.
 * Supports a primary selector (defaulting to `[data-tokenize-target='true']`) with an
 * optional fallback selector for backwards compatibility with legacy markup shapes.
 */
export function tokenizeTargets(
  container: HTMLElement,
  options: TokenizeTargetsOptions
): void {
  const primarySelector =
    options.targetSelector ?? "[data-tokenize-target='true']";
  let targets = Array.from(
    container.querySelectorAll<HTMLElement>(primarySelector)
  );

  if (targets.length === 0) {
    if (container.matches(primarySelector)) {
      targets = [container];
    } else if (options.fallbackSelector) {
      targets = Array.from(
        container.querySelectorAll<HTMLElement>(options.fallbackSelector)
      );
    }
  }

  for (const target of targets) {
    tokenizeSubtree(target, options);
  }
}
