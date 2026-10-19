/**
 * The only elements client code may create (PE RFC §7), for the SSR
 * conformance harnesses. Kept in its own file so every change to it is
 * visible in review.
 */

/**
 * When client code may first create an element: during `onConnect()`
 * (`upgrade`, which also covers everything later), or only in response to
 * the user (`interaction`).
 */
type CreationPhase = "upgrade" | "interaction";

interface CreatedDomRule {
  /** Matches the created element itself. */
  readonly selector: string;
  /**
   * Also covers everything created inside an element matching `selector`,
   * whether that element is server-rendered or created.
   */
  readonly subtree?: true;
  readonly from: CreationPhase;
  /** Why this element can't be server-rendered. Required for review. */
  readonly reason: string;
}

/**
 * The only elements client code may create (PE RFC §7). Everything else must
 * already exist in the SSR HTML. Adding an entry needs human review: prefer
 * rendering the element on the server and adopting it on upgrade.
 */
export const CREATED_DOM_ALLOWLIST: readonly CreatedDomRule[] = [
  {
    selector: ".lat-word",
    from: "upgrade",
    reason:
      "Inline word spans wrapped by `tokenizeTargets` in passages and entries (the dictionary swaps a hovered one for a link).",
  },
  {
    selector: "morcus-corpus-suggestions > ul",
    subtree: true,
    from: "upgrade",
    reason:
      "Options of the server-rendered corpus listbox, built from the text at the caret. " +
      "On upgrade only if the input already has focus (`corpus-focused-before-upgrade`).",
  },
  {
    selector: "morcus-dict-suggestions > ul",
    subtree: true,
    from: "interaction",
    reason:
      "Options of the server-rendered dict listbox, built from the typed prefix " +
      "(`ComboboxController.renderItems`), as for the corpus listbox above.",
  },
  {
    selector: "#panel-view-translation > .reader-translation-loading",
    subtree: true,
    from: "interaction",
    reason:
      "Transient loading state while the JS-only Translation tab fetches its " +
      "text (`ReaderPanelController.setTab`); replaced by the served translation.",
  },
  {
    selector: "#w-plain [data-plain-vowels], #w-plain [data-plain-lemmas]",
    subtree: true,
    from: "interaction",
    reason:
      "Per-character vowel toggles and the lemma list (one entry per lemma in " +
      "the word's `data-l`) inside the single shared plain-word card " +
      "(`MorcusMacronizerView.populatePlainCard`), avoiding duplicate server-rendered cards for every unambiguous word.",
  },
];

export function isAllowlistedCreation(
  el: Element,
  phase: CreationPhase
): boolean {
  return CREATED_DOM_ALLOWLIST.some((rule) => {
    if (rule.from === "interaction" && phase === "upgrade") return false;
    if (el.matches(rule.selector)) return true;
    return rule.subtree === true && el.parentElement?.closest(rule.selector);
  });
}
