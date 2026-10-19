/**
 * Server-rendered UI the client may replace after an interaction, for the
 * interaction conformance harness. Kept in its own file so every change to
 * it is visible in review.
 */

interface IsomorphicRerender {
  /** The component that re-renders it. */
  readonly owner: string;
  /** Matched against the element alone, without ancestors (it may be detached). */
  readonly selector: string;
  /**
   * `self`: the matched element is replaced (`replaceWithHtml`).
   * `contents`: its children are replaced (`setHtml`).
   */
  readonly replaces: "self" | "contents";
  /** The `.common.ts` renderer both the server and the client use. */
  readonly renderer: string;
}

/**
 * Server-rendered UI that the client re-renders after an interaction with
 * the same `.common.ts` renderer the server used (README, "The `.common.ts`
 * contract"), so the replacement markup can't drift from the SSR markup.
 * Inside these, the interaction harness allows SSR nodes to be replaced.
 * Adding an entry needs human review.
 */
export const ISOMORPHIC_RERENDERS: readonly IsomorphicRerender[] = [
  {
    owner: "morcus-dict-search",
    selector: ".lang-chips",
    replaces: "contents",
    renderer: "renderLangChipsHtml (dict/search/search_bar.common.ts)",
  },
  {
    owner: "morcus-dict-search",
    selector: ".inflect-chip",
    replaces: "self",
    renderer: "renderInflectChipHtml (dict/search/search_bar.common.ts)",
  },
];

/**
 * Whether `el` lies in an isomorphic re-render region. `parentOf` gives the
 * ancestry to use: the pre-interaction one for a removed element.
 */
export function inIsomorphicRerender(
  el: Element,
  parentOf: (el: Element) => Node | null | undefined = (e) => e.parentNode
): boolean {
  const ancestry: Element[] = [];
  for (let cur: Node | null | undefined = el; cur instanceof Element; ) {
    ancestry.push(cur);
    cur = parentOf(cur);
  }
  return ISOMORPHIC_RERENDERS.some((region) => {
    const at = ancestry.findIndex(
      (a, i) =>
        a.matches(region.selector) && (region.replaces === "self" || i > 0)
    );
    return (
      at >= 0 &&
      ancestry.slice(at + 1).some((a) => a.localName === region.owner)
    );
  });
}
