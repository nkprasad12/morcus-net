/**
 * @jest-environment jsdom
 */

import {
  diffTree,
  parseInert,
  snapshotTree,
} from "@/web/v2/testing/ssr_invariants";

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
