/**
 * @jest-environment jsdom
 */

import { inIsomorphicRerender } from "@/web/v2/testing/isomorphic_rerenders";
import { parseInert } from "@/web/v2/testing/ssr_invariants";

describe("inIsomorphicRerender", () => {
  test("covers the contents of a `contents` region, not the region itself", () => {
    const root = parseInert(
      `<morcus-dict-search><div class="lang-chips"><span></span></div></morcus-dict-search>`
    );
    expect(inIsomorphicRerender(root.querySelector("span")!)).toBe(true);
    expect(inIsomorphicRerender(root.querySelector(".lang-chips")!)).toBe(
      false
    );
  });

  test("covers a `self` region, including when detached via a saved ancestry", () => {
    const root = parseInert(
      `<morcus-dict-search><span class="inflect-chip"></span></morcus-dict-search>`
    );
    const chip = root.querySelector(".inflect-chip")!;
    const parents = new Map<Element, Node>([[chip, chip.parentNode!]]);
    chip.remove();
    expect(inIsomorphicRerender(chip)).toBe(false);
    expect(
      inIsomorphicRerender(chip, (el) => parents.get(el) ?? el.parentNode)
    ).toBe(true);
  });

  test("needs the owning component", () => {
    const root = parseInert(`<div><span class="inflect-chip"></span></div>`);
    expect(inIsomorphicRerender(root.querySelector("span")!)).toBe(false);
  });
});
