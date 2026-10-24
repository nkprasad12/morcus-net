/**
 * @jest-environment jsdom
 */

import {
  checkAddresses,
  diffTree,
  parseInert,
  snapshotTree,
} from "@/web/ui/testing/ssr_invariants";

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

describe("checkAddresses", () => {
  afterEach(() => document.body.replaceChildren());

  test("passes a page whose links resolve and reveal", () => {
    document.body.replaceChildren(
      parseInert(`
        <a href="#x">x</a><a href="#">top</a>
        <details><summary>s</summary><p id="x">x</p></details>
      `)
    );
    expect(checkAddresses()).toEqual({
      duplicateIds: [],
      danglingHrefs: [],
      unrevealedTargets: [],
    });
    // Revealing opened the disclosure.
    expect(document.querySelector("details")?.open).toBe(true);
  });

  test("reports duplicate and empty ids, dangling links and unrevealable targets", () => {
    document.body.replaceChildren(
      parseInert(`
        <p id="d"></p><p id="d"></p><p id=""></p>
        <a href="#missing">m</a>
        <a href="#h">h</a><div hidden><p id="h"></p></div>
        <span hidden><a href="#missing-but-hidden">ignored</a></span>
      `)
    );
    const found = checkAddresses();
    expect(found.duplicateIds).toEqual([
      `duplicate id="#d"`,
      "empty id on <p>",
    ]);
    expect(found.danglingHrefs).toEqual([
      "<a> points to missing #missing",
      "<a> points to missing #missing-but-hidden",
    ]);
    expect(found.unrevealedTargets).toEqual([
      "#h remained inside [hidden] <div> after revealTarget()",
    ]);
  });
});
