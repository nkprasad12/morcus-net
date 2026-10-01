/**
 * @jest-environment jsdom
 */

import { isAllowlistedCreation } from "@/web/v2/testing/created_dom_allowlist";
import { parseInert } from "@/web/v2/testing/ssr_invariants";

describe("isAllowlistedCreation", () => {
  test("a subtree entry covers everything created inside the matched element", () => {
    const root = parseInert(
      `<morcus-corpus-suggestions><ul><li><span><b>x</b></span></li></ul></morcus-corpus-suggestions>`
    );
    for (const el of Array.from(root.querySelectorAll("li, span, b"))) {
      expect(isAllowlistedCreation(el, "upgrade")).toBe(true);
    }
  });

  test("an entry without `subtree` covers only the element itself", () => {
    const root = parseInert(`<a class="lat-word"><span>x</span></a>`);
    expect(isAllowlistedCreation(root.querySelector("a")!, "upgrade")).toBe(
      true
    );
    expect(isAllowlistedCreation(root.querySelector("span")!, "upgrade")).toBe(
      false
    );
  });

  test("an element outside every entry is not covered", () => {
    const root = parseInert(
      `<morcus-corpus-view><div></div></morcus-corpus-view>`
    );
    expect(
      isAllowlistedCreation(root.querySelector("div")!, "interaction")
    ).toBe(false);
  });
});
