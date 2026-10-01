/**
 * @jest-environment jsdom
 */

import {
  diffTree,
  isAllowlistedCreation,
  parseInert,
  snapshotTree,
} from "@/web/v2/testing/ssr_invariants";

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

describe("diffTree", () => {
  test("reports removed, reparented and created elements", () => {
    const root = parseInert(
      `<div id="a"><p id="b"></p></div><div id="c"></div>`
    );
    const baseline = snapshotTree(root);
    const b = root.querySelector("#b")!;
    root.querySelector("#c")!.append(b);
    root.querySelector("#a")!.remove();
    const created = document.createElement("span");
    root.append(created);

    const diff = diffTree(baseline, root);
    expect(diff.removed.map((el) => el.id)).toEqual(["a"]);
    expect(diff.reparented.map(({ el }) => el.id)).toEqual(["b"]);
    expect(diff.created).toEqual([created]);
  });
});
