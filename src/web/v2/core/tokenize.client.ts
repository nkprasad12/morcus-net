import { processTokens, removeDiacritics } from "@/common/text_cleaning";

/**
 * Where a word is split across elements (see `joinAcrossInline`), describes
 * which part of the word an element renders.
 */
export interface WordPart {
  /** 0-based position of this part within the word. */
  index: number;
  /** How many parts the word is split into (at least 2). */
  count: number;
  /** The whole word token, across all its parts. */
  word: string;
}

export interface TokenizeWordOptions {
  /**
   * Factory function that constructs the replacement DOM element for a Latin word token.
   * - Reader: creates `<span class="lat-word" role="button" tabindex="0" data-word="...">`
   * - Dictionary: creates `<a class="lat-word" href="..." data-word="...">`
   *
   * `wordIndex` is the 0-based word token index within `root` (incremented on every
   * `isWord === true` token produced by `processTokens`, matching corpus and V1 indexing).
   *
   * `part` is set only when `joinAcrossInline` splits a word across elements.
   * The factory is then called once per part: `token` is that part's text, while
   * `cleanWord`, `wordIndex` and `part.word` describe the whole word. Every part
   * also gets a shared `data-word-group` (see `wordGroupParts`).
   */
  renderWord: (
    token: string,
    cleanWord: string,
    wordIndex: number,
    root: HTMLElement,
    part?: WordPart
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

  /**
   * Tokenize runs of text across inline styling elements (`INLINE_STYLE_CLASSES`,
   * `<strong>`), so `<span class="italic">im</span>petu` is one word, following
   * rule 1 of the corpus word-boundary rule (`extractRowText` in
   * `corpus_library_utils.ts`). Any other element, and any rejected one (a note
   * link, a `[gap]` marker), still ends the word.
   *
   * Off by default: text nodes are tokenized one at a time. The reader enables it,
   * because corpus word offsets become its `matchText` highlight ranges.
   */
  joinAcrossInline?: boolean;
}

export interface TokenizeTargetsOptions extends TokenizeWordOptions {
  targetSelector?: string;
}

const LATIN_LETTER_REGEX = /[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF]/;

/**
 * Classes of the purely presentational `<span>`s the V2 preprocessor emits for
 * inline renditions (`v2_preprocessor.ts`). Text continues across them.
 */
const INLINE_STYLE_CLASSES = new Set([
  "italic",
  "bold",
  "overline",
  "smallcaps",
  "uppercase",
  "superscript",
]);

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
 * Builds the `<a class="lat-word" href="..." data-word="...">` element a
 * linkified Latin word is replaced with, for use as a `renderWord` factory.
 */
export function createWordLink(
  token: string,
  cleanWord: string,
  href: string
): HTMLAnchorElement {
  const a = document.createElement("a");
  a.className = "lat-word";
  a.href = href;
  a.dataset.word = cleanWord;
  a.textContent = token;
  return a;
}

/** Group ids for split words; unique for the lifetime of the page. */
let nextWordGroup = 0;

/**
 * Returns every part of the word `el` belongs to, in document order: the
 * elements sharing its `data-word-group`, or just `el` for a whole word.
 */
export function wordGroupParts(el: HTMLElement): HTMLElement[] {
  const group = el.dataset.wordGroup;
  if (group === undefined) {
    return [el];
  }
  const root = el.getRootNode();
  const scope =
    root instanceof Document ||
    root instanceof DocumentFragment ||
    root instanceof Element
      ? root
      : el.ownerDocument;
  return Array.from(
    scope.querySelectorAll<HTMLElement>(`[data-word-group="${group}"]`)
  );
}

/** The class `syncWordGroupHover` puts on every part of a hovered split word. */
export const WORD_GROUP_HOVER_CLASS = "word-hover";

/**
 * `pointerover` / `pointerout` listener that styles every part of a split word
 * while any of its parts is hovered, since `:hover` matches only the one part.
 */
export function syncWordGroupHover(e: Event): void {
  if (!(e.target instanceof Element)) return;
  const part = e.target.closest<HTMLElement>("[data-word-group]");
  if (!part) return;
  const entering = e.type === "pointerover" || e.type === "mouseover";
  if (!entering && e instanceof MouseEvent) {
    const next =
      e.relatedTarget instanceof Element
        ? e.relatedTarget.closest<HTMLElement>("[data-word-group]")
        : null;
    // Moving between two parts of the same word: it stays hovered.
    if (next?.dataset.wordGroup === part.dataset.wordGroup) return;
  }
  for (const p of wordGroupParts(part)) {
    p.classList.toggle(WORD_GROUP_HOVER_CLASS, entering);
  }
}

function isRejectedElement(
  node: HTMLElement,
  options: TokenizeWordOptions
): boolean {
  const tag = node.tagName.toLowerCase();
  return (
    tag === "a" ||
    tag === "button" ||
    tag === "script" ||
    tag === "style" ||
    node.getAttribute("lang") === "el" ||
    node.hasAttribute("data-no-tokenize") ||
    node.hasAttribute("data-no-linkify") ||
    node.classList.contains("reader-gap") ||
    (options.isExcludedElement !== undefined && options.isExcludedElement(node))
  );
}

/** Whether text continues across `el` under `joinAcrossInline`. */
function isInlineStyling(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === "strong") {
    return true;
  }
  // Every class must be presentational: a `reader-line italic` is still a line.
  return (
    tag === "span" &&
    el.classList.length > 0 &&
    Array.from(el.classList).every((c) => INLINE_STYLE_CLASSES.has(c))
  );
}

/**
 * Collects the non-empty text nodes under `root` in document order, grouped
 * into runs that are tokenized as one continuous string. Without
 * `joinAcrossInline`, every text node is its own run.
 */
function collectTextRuns(
  root: HTMLElement,
  options: TokenizeWordOptions
): Text[][] {
  const join = options.joinAcrossInline === true;
  const runs: Text[][] = [];
  let run: Text[] = [];
  const endRun = () => {
    if (run.length > 0) {
      runs.push(run);
      run = [];
    }
  };
  const visit = (parent: Node) => {
    for (let child = parent.firstChild; child; child = child.nextSibling) {
      if (child instanceof Text) {
        if (!child.nodeValue) continue;
        run.push(child);
        if (!join) endRun();
      } else if (child instanceof SVGElement) {
        endRun();
      } else if (child instanceof HTMLElement) {
        if (isRejectedElement(child, options)) {
          endRun();
          continue;
        }
        const continues = join && isInlineStyling(child);
        if (!continues) endRun();
        visit(child);
        if (!continues) endRun();
      } else if (child instanceof Element) {
        endRun();
        visit(child);
        endRun();
      }
    }
  };
  visit(root);
  endRun();
  return runs;
}

/** A slice of a run's text that falls within one of its text nodes. */
interface Segment {
  /** Index of the text node within the run. */
  node: number;
  text: string;
}

/**
 * Recursively walks `root`, pruning non-tokenizable subtrees (links, buttons,
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

  const runs = collectTextRuns(root, options);
  if (runs.length === 0) return;

  const replacements: Array<[Text, DocumentFragment]> = [];
  let wordIndex = 0;
  for (const run of runs) {
    const values = run.map((node) => node.nodeValue ?? "");
    const text = values.join("");
    const hasLatin = LATIN_LETTER_REGEX.test(text);

    // Output nodes for each text node of the run, and whether it gained a word.
    const outputs: Node[][] = run.map(() => []);
    const hasWords: boolean[] = run.map(() => false);

    // Splits `[start, end)` of `text` at text node boundaries.
    let nodeIndex = 0;
    let nodeStart = 0;
    const segmentsOf = (start: number, end: number): Segment[] => {
      const segments: Segment[] = [];
      let pos = start;
      while (pos < end) {
        const nodeEnd = nodeStart + values[nodeIndex].length;
        const take = Math.min(end, nodeEnd);
        segments.push({ node: nodeIndex, text: text.slice(pos, take) });
        pos = take;
        if (pos === nodeEnd && nodeIndex < values.length - 1) {
          nodeIndex++;
          nodeStart = nodeEnd;
        }
      }
      return segments;
    };

    let offset = 0;
    for (const [token, isWord] of processTokens(text)) {
      const currentWordIndex = wordIndex;
      if (isWord) {
        wordIndex++;
      }
      const start = offset;
      offset += token.length;
      if (!hasLatin) {
        continue;
      }
      const segments = segmentsOf(start, offset);
      const { isLatin, cleanWord } = isLatinWord(token, isWord);
      if (!isLatin) {
        for (const segment of segments) {
          outputs[segment.node].push(document.createTextNode(segment.text));
        }
        continue;
      }
      const group =
        segments.length > 1 ? `w${(nextWordGroup++).toString(36)}` : undefined;
      segments.forEach((segment, i) => {
        const part: WordPart | undefined =
          group === undefined
            ? undefined
            : { index: i, count: segments.length, word: token };
        const el = options.renderWord(
          segment.text,
          cleanWord,
          currentWordIndex,
          root,
          part
        );
        if (group !== undefined) {
          el.dataset.wordGroup = group;
        }
        outputs[segment.node].push(el);
        hasWords[segment.node] = true;
      });
    }

    run.forEach((node, i) => {
      if (!hasWords[i]) return;
      const fragment = document.createDocumentFragment();
      fragment.append(...outputs[i]);
      replacements.push([node, fragment]);
    });
  }

  if (replacements.length === 0) return;

  // Detach `root` while replacing text nodes in bulk so browsers (notably
  // Firefox/Servo with document-level `:has(...)` rules) do not re-run live-DOM
  // style invalidation on every individual `replaceChild` call.
  const parent = root.parentNode;
  const nextSibling = root.nextSibling;
  if (parent) {
    parent.removeChild(root);
  }

  try {
    for (const [textNode, fragment] of replacements) {
      textNode.parentNode?.replaceChild(fragment, textNode);
    }
  } finally {
    if (parent) {
      parent.insertBefore(root, nextSibling);
    }
  }
}

/**
 * Queries target elements within `container` and applies `tokenizeSubtree` to each target.
 * Targets match `targetSelector` (default `[data-tokenize-target='true']`); if none
 * do, `container` itself is the target when it matches.
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

  if (targets.length === 0 && container.matches(primarySelector)) {
    targets = [container];
  }

  for (const target of targets) {
    tokenizeSubtree(target, options);
  }
}
