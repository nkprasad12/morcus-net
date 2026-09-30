/**
 * @jest-environment jsdom
 */
import fs from "fs";
import path from "path";

/**
 * Selector-level checks of the JS gate in `v2-critical.css`. jsdom neither
 * paints nor evaluates `@media (scripting)`, so these only cover the rules
 * outside media queries (behaviour, failure and the no-(scripting) fallback);
 * paint is covered by the Playwright late-hydration suite.
 */

const CRITICAL_CSS = fs.readFileSync(
  path.resolve(__dirname, "../v2-critical.css"),
  "utf8"
);

/** Top-level (not media-scoped) selectors of rules setting `prop: value`. */
function topLevelSelectors(prop: string, value: string): string[] {
  const style = document.createElement("style");
  // The @import is irrelevant to the gate and jsdom would try to fetch it.
  style.textContent = CRITICAL_CSS.replace(/@import[^;]*;/g, "");
  document.head.appendChild(style);
  const selectors: string[] = [];
  for (const rule of Array.from(style.sheet!.cssRules)) {
    if (
      rule instanceof CSSStyleRule &&
      rule.style.getPropertyValue(prop) === value
    ) {
      selectors.push(rule.selectorText);
    }
  }
  style.remove();
  return selectors;
}

/** Splits `text` on commas that aren't inside parentheses. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

/**
 * jsdom's selector engine (nwsapi) rejects a selector list inside `:not()`
 * and mis-evaluates `:defined`. Every element in these tests is defined, so
 * `:defined` is resolved statically: `:not(:not(:defined) *)` is always true
 * (dropped) and a compound containing `:not(:defined)` never matches
 * (`null`). `:not(a, b)` is rewritten to the equivalent `:not(a):not(b)`.
 */
function forNwsapi(selector: string): string | null {
  let out = "";
  let i = 0;
  while (i < selector.length) {
    if (!selector.startsWith(":not(", i)) {
      out += selector[i++];
      continue;
    }
    let depth = 0;
    let j = i + 4;
    for (; j < selector.length; j++) {
      if (selector[j] === "(") depth++;
      else if (selector[j] === ")" && --depth === 0) break;
    }
    const args = splitTopLevel(selector.slice(i + 5, j));
    for (const arg of args) {
      if (arg.replace(/\s+/g, " ") !== ":not(:defined) *") {
        out += `:not(${arg})`;
      }
    }
    i = j + 1;
  }
  return out.includes(":not(:defined)") ? null : out;
}

const HIDE = topLevelSelectors("display", "none");
const INVISIBLE = topLevelSelectors("visibility", "hidden");

function matchesAny(el: Element, selectors: string[]): boolean {
  return selectors.flatMap(splitTopLevel).some((s) => {
    const rewritten = forNwsapi(s);
    return rewritten !== null && el.matches(rewritten);
  });
}

function isHidden(el: Element): boolean {
  return matchesAny(el, HIDE);
}

function isInvisible(el: Element): boolean {
  return matchesAny(el, INVISIBLE);
}

function build(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("JS gate selectors", () => {
  test("the rules were found", () => {
    expect(HIDE.length).toBeGreaterThan(0);
    expect(INVISIBLE.length).toBeGreaterThan(0);
  });

  test("JS-only UI is invisible until its owner is upgraded", () => {
    const host = build(
      `<section id="owner"><button id="js" data-js-only></button></section>`
    );
    const js = host.querySelector("#js")!;
    expect(isInvisible(js)).toBe(true);
    expect(isHidden(js)).toBe(false);

    host.querySelector("#owner")!.setAttribute("data-upgraded", "");
    expect(isInvisible(js)).toBe(false);
    expect(isHidden(js)).toBe(false);
  });

  test("a failed owner drops its JS-only UI and keeps its fallbacks", () => {
    const host = build(
      `<section id="owner" data-js-failed>
         <button id="js" data-js-only></button>
         <button id="nojs" data-nojs-only></button>
       </section>`
    );
    expect(isHidden(host.querySelector("#js")!)).toBe(true);
    expect(isHidden(host.querySelector("#nojs")!)).toBe(false);
  });

  test("a failed child keeps its fallbacks under an upgraded parent", () => {
    // dict-search upgraded, dict-settings failed.
    const host = build(
      `<section id="search" data-upgraded>
         <button id="parent-nojs" data-nojs-only></button>
         <section id="settings" data-js-failed>
           <button id="js" data-js-only></button>
           <button id="nojs" data-nojs-only></button>
         </section>
       </section>`
    );
    // The parent's own fallback still hands over (no-(scripting) fallback).
    expect(isHidden(host.querySelector("#parent-nojs")!)).toBe(true);
    // The failed child's fallback comes back, and its JS-only UI is dropped.
    expect(isHidden(host.querySelector("#nojs")!)).toBe(false);
    expect(isHidden(host.querySelector("#js")!)).toBe(true);
  });

  test("a bundle failure on <html> drops all JS-only UI", () => {
    const host = build(
      `<section data-upgraded><button id="js" data-js-only></button></section>
       <button id="nojs" data-nojs-only></button>`
    );
    document.documentElement.setAttribute("data-js-failed", "");
    try {
      expect(isHidden(host.querySelector("#js")!)).toBe(true);
      expect(isHidden(host.querySelector("#nojs")!)).toBe(false);
    } finally {
      document.documentElement.removeAttribute("data-js-failed");
    }
  });
});

describe("ownersUpgraded", () => {
  // Imported lazily so the CSS-only tests above stay independent of it.
  const { ownersUpgraded } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/web/v2/core/js_gate.client") as typeof import("@/web/v2/core/js_gate.client");

  function target(html: string): Element {
    document.body.innerHTML = html;
    return document.getElementById("t")!;
  }

  test("is true outside any component", () => {
    expect(ownersUpgraded(target(`<div><p id="t"></p></div>`))).toBe(true);
  });

  test("is false under a component that has not upgraded", () => {
    expect(ownersUpgraded(target(`<x-owner><p id="t"></p></x-owner>`))).toBe(
      false
    );
  });

  test("is false if any enclosing component has not upgraded", () => {
    expect(
      ownersUpgraded(
        target(
          `<x-outer><x-inner data-upgraded><p id="t"></p></x-inner></x-outer>`
        )
      )
    ).toBe(false);
  });

  test("is false under a failed component", () => {
    expect(
      ownersUpgraded(target(`<x-owner data-js-failed><p id="t"></p></x-owner>`))
    ).toBe(false);
  });

  test("checks the target itself", () => {
    expect(ownersUpgraded(target(`<x-owner id="t"></x-owner>`))).toBe(false);
  });

  test("is true once every enclosing component has upgraded", () => {
    expect(
      ownersUpgraded(
        target(
          `<x-outer data-upgraded><x-inner data-upgraded><p id="t"></p></x-inner></x-outer>`
        )
      )
    ).toBe(true);
  });
});
