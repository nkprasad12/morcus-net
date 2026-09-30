/**
 * @jest-environment jsdom
 */
import { LifetimeScope } from "@/web/v2/core/base_element.client";

/**
 * The activation gate applied by `LifetimeScope.listen()` (see
 * `canHandleActivation` in `core/js_gate.client.ts`).
 */

let warn: jest.SpyInstance;
let scope: LifetimeScope;

beforeEach(() => {
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  scope?.dispose();
  warn.mockRestore();
  document.body.innerHTML = "";
});

function el(selector: string): HTMLElement {
  return document.querySelector<HTMLElement>(selector)!;
}

/** Listens on `document` with a standalone scope (or one owned by `owner`). */
function track(type: string, owner: Element | null = null): string[] {
  scope = new LifetimeScope(document, undefined, owner);
  const seen: string[] = [];
  scope.listen(document, type, (e: Event) => {
    seen.push(e.type);
    e.preventDefault();
  });
  return seen;
}

function keydown(target: Element, key: string): KeyboardEvent {
  const e = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(e);
  return e;
}

describe("activation gate in LifetimeScope.listen", () => {
  test("runs handlers for clicks outside any component", () => {
    document.body.innerHTML = `<button id="b"></button>`;
    const seen = track("click");
    el("#b").click();
    expect(seen).toEqual(["click"]);
  });

  test("skips a click inside an un-upgraded component, keeping the default", () => {
    document.body.innerHTML = `<morcus-x><button id="b"></button></morcus-x>`;
    const seen = track("click");
    const e = new MouseEvent("click", { bubbles: true, cancelable: true });
    el("#b").dispatchEvent(e);
    expect(seen).toEqual([]);
    expect(e.defaultPrevented).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test("skips a click inside a failed component", () => {
    document.body.innerHTML = `<morcus-x data-upgraded data-js-failed><button id="b"></button></morcus-x>`;
    const seen = track("click");
    el("#b").click();
    expect(seen).toEqual([]);
  });

  test("runs once the component has upgraded", () => {
    document.body.innerHTML = `<morcus-x data-upgraded><button id="b"></button></morcus-x>`;
    const seen = track("click");
    el("#b").click();
    expect(seen).toEqual(["click"]);
  });

  test("skips a hash link whose target is in an un-upgraded component", () => {
    document.body.innerHTML = `<a id="a" href="#notes">n</a><morcus-panel><section id="notes"></section></morcus-panel>`;
    const seen = track("click");
    el("#a").click();
    expect(seen).toEqual([]);
  });

  test("decodes URL-encoded hash ids", () => {
    document.body.innerHTML = `<a id="a" href="#caf%C3%A9">n</a><morcus-panel><p id="café"></p></morcus-panel>`;
    const seen = track("click");
    el("#a").click();
    expect(seen).toEqual([]);
  });

  test.each(["aria-controls", "popovertarget", "commandfor", "form"])(
    "skips when %s points into an un-upgraded component",
    (attr) => {
      document.body.innerHTML = `<button id="b" ${attr}="other t"></button><morcus-x><div id="t"></div></morcus-x>`;
      const seen = track("click");
      el("#b").click();
      expect(seen).toEqual([]);
    }
  );

  test("gates Enter and Space keydown but not other keys", () => {
    document.body.innerHTML = `<morcus-x><a id="a" href="#">l</a></morcus-x>`;
    const seen = track("keydown");
    expect(keydown(el("#a"), "Enter").defaultPrevented).toBe(false);
    expect(keydown(el("#a"), " ").defaultPrevented).toBe(false);
    expect(keydown(el("#a"), "Escape").defaultPrevented).toBe(true);
    expect(keydown(el("#a"), "ArrowDown").defaultPrevented).toBe(true);
    expect(seen).toEqual(["keydown", "keydown"]);
  });

  test("gates submit", () => {
    document.body.innerHTML = `<morcus-x><form id="f"></form></morcus-x>`;
    const seen = track("submit");
    el("#f").dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );
    expect(seen).toEqual([]);
  });

  test("never gates non-activation events", () => {
    document.body.innerHTML = `<morcus-x data-js-failed><div id="d"></div></morcus-x>`;
    const seen = track("mousedown");
    el("#d").dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(seen).toEqual(["mousedown"]);
  });

  test("an owned scope skips its own (upgraded) owner in the walk", () => {
    document.body.innerHTML = `<morcus-outer><morcus-mine data-upgraded><button id="b"></button></morcus-mine></morcus-outer>`;
    const seen = track("click", el("morcus-mine"));
    el("#b").click();
    expect(seen).toEqual(["click"]);
  });

  test("an owned scope skips everything once its owner has failed", () => {
    document.body.innerHTML = `<morcus-mine data-js-failed><button id="b"></button></morcus-mine>`;
    const seen = track("click", el("morcus-mine"));
    el("#b").click();
    expect(seen).toEqual([]);
  });

  test("uses the pre-dispatch path when a listener detaches the target", () => {
    document.body.innerHTML = `<morcus-x><div id="wrap"><button id="b"></button></div></morcus-x>`;
    const seen = track("click");
    // Moves the target out of the un-upgraded component before the gated
    // document listener runs.
    el("#wrap").addEventListener("click", () => {
      document.body.appendChild(el("#b"));
    });
    el("#b").click();
    expect(seen).toEqual([]);
  });

  test("child scopes inherit the owner", () => {
    document.body.innerHTML = `<morcus-mine data-js-failed><button id="b"></button></morcus-mine>`;
    scope = new LifetimeScope(document, undefined, el("morcus-mine"));
    const child = scope.createScope();
    expect(child.owner).toBe(el("morcus-mine"));
  });

  test("supports EventListenerObject listeners", () => {
    document.body.innerHTML = `<button id="b"></button>`;
    scope = new LifetimeScope(document);
    const handleEvent = jest.fn();
    scope.listen(document, "click", { handleEvent });
    el("#b").click();
    expect(handleEvent).toHaveBeenCalledTimes(1);
  });
});
