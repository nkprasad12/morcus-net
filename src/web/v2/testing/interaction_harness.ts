/**
 * The interaction conformance harness (corpus/DESIGN.md §9 item 8), shared
 * by the `*_interaction_conformance.test.ts` file next to each feature.
 *
 * `testing/ssr_conformance_harness.ts` checks the DOM right after upgrade. This
 * harness checks it again after the user does something: focusing, typing,
 * clicking, and the mocked fetches that follow. Everything runs in jsdom;
 * nothing here ships to the client.
 *
 * Tier 1 is an automated sweep: every interactive control in every fixture,
 * deduplicated so repeated rows count once, each exercised by a fixed script
 * (`tier1Script`) on a freshly upgraded page, against a fake network backed
 * by the real server renderers (`testing/fake_v2_network.ts`). After every
 * step it checks:
 * - no SSR node was removed or moved, except inside a region a partial swap
 *   or an isomorphic re-render (`ISOMORPHIC_RERENDERS`) replaced;
 * - every created element is allowlisted (`CREATED_DOM_ALLOWLIST`, phase
 *   `interaction`) or was served by a partial swap;
 * - created controls keep the No-JS control rule, and ids stay unique;
 * - no listener threw and no request went unrouted.
 * Each target also runs twice more, torn down with work still pending
 * (`RunMode`), to catch late writes to detached nodes.
 *
 * Tier 2 declares multi-step flows a single control's script can't reach:
 * picking a suggestion, submitting, paging. They run in the same modes
 * against the same checks, and each must end in a partial swap.
 *
 * Each suite caps its sweep (`Tier1Caps`), and the caps are checked before
 * any run starts, so a fixture that grows a long list of controls fails fast
 * instead of making the sweep slow.
 *
 * Suites must mock the modules `testing/ssr_fixtures.ts` asks for.
 */

import "@/web/v2/v2_elements.client";
import {
  clearDetachedDomWrites,
  detachedDomWrites,
} from "@/web/v2/core/dom_invariants.client";
import { SLOT_ATTR } from "@/web/v2/core/slots.common";
import { isAllowlistedCreation } from "@/web/v2/testing/created_dom_allowlist";
import { inIsomorphicRerender } from "@/web/v2/testing/isomorphic_rerenders";
import {
  installMatchMediaStub,
  mountFixture,
  runPageSetups,
  type SsrFixture,
} from "@/web/v2/testing/ssr_fixtures";
import {
  NO_JS_CONTROLS,
  checkAddresses,
  describeElement,
  describeParent,
  diffTree,
  nearestMorcus,
  noJsControlViolation,
  parseInert,
  snapshotTree,
} from "@/web/v2/testing/ssr_invariants";
import {
  installFakeNetwork,
  type FakeNetworkLog,
} from "@/web/v2/testing/fake_v2_network";

// ---------------------------------------------------------------------------
// Tier 1 budget. Counts, not wall time: a "run" is one fresh parse + upgrade,
// one control's script, and an invariant check after each step.
//
// Raising a cap, or adding an override, needs human review. The preferred
// fix for a fixture over its cap is a better dedup key (`targetKey`).
// ---------------------------------------------------------------------------

/**
 * Calibrated when the harness landed: at most 14 targets in one fixture
 * (`dict-results`).
 */
export const TIER1_MAX_RUNS_PER_FIXTURE = 25;

export interface Tier1Caps {
  /** Below this the suite's sweep is probably vacuous (e.g. a dedup bug). */
  readonly minRuns: number;
  /** Per-fixture exceptions to `TIER1_MAX_RUNS_PER_FIXTURE`. */
  readonly overrides?: Readonly<
    Record<string, { readonly max: number; readonly reason: string }>
  >;
}

/** Candidates for Tier 1. Links and submit buttons navigate: Tier 2. */
const TIER1_CANDIDATES = "input, textarea, select, button, summary";
const NON_TIER1_INPUT_TYPES: ReadonlySet<string> = new Set([
  "hidden",
  "submit",
  "image",
  "reset",
  "file",
]);

function isTier1Target(el: Element): boolean {
  if (el.closest("[hidden], [inert], dialog:not([open])")) return false;
  if (el.matches(":disabled")) return false;
  if (el instanceof HTMLInputElement) {
    return !NON_TIER1_INPUT_TYPES.has(el.type);
  }
  if (el instanceof HTMLButtonElement) return el.type === "button";
  return true;
}

/**
 * Two controls share a key if a user couldn't tell their behaviour apart:
 * same owner, same path of tags and classes from the owner, same type, name
 * and role. Repeated rows (word links, result rows, TOC entries) collapse to
 * one; ids are left out since they differ per row.
 */
function targetKey(el: Element, root: Element): string {
  const owner = nearestMorcus(el);
  const path: string[] = [];
  for (let cur: Element | null = el; cur && cur !== owner && cur !== root; ) {
    const classes = Array.from(cur.classList).sort().join(".");
    path.unshift(cur.localName + (classes ? `.${classes}` : ""));
    cur = cur.parentElement;
  }
  const attrs = ["type", "name", "role"]
    .map((a) => (el.hasAttribute(a) ? `[${a}=${el.getAttribute(a)}]` : ""))
    .join("");
  return `${owner?.localName ?? "(page)"} :: ${path.join(" > ")}${attrs}`;
}

interface Tier1Target {
  readonly key: string;
  readonly el: Element;
}

/** Deduplicated Tier 1 targets under `root`, in document order. */
function tier1Targets(root: Element): Tier1Target[] {
  const seen = new Set<string>();
  const out: Tier1Target[] = [];
  for (const el of Array.from(root.querySelectorAll(TIER1_CANDIDATES))) {
    if (!isTier1Target(el)) continue;
    const key = targetKey(el, root);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, el });
  }
  return out;
}

function tier1Fixtures(fixtures: readonly SsrFixture[]): SsrFixture[] {
  // Same markup as `corpus-landing`; its point is the upgrade, not the sweep.
  return fixtures.filter((f) => !f.focusBeforeUpgrade);
}

/**
 * `jest.advanceTimersByTimeAsync` (Jest 29.5+), which flushes promises
 * between timers. The installed `@types/jest` predates it.
 */
async function advanceTimersAsync(ms: number): Promise<void> {
  const advance: unknown = Reflect.get(jest, "advanceTimersByTimeAsync");
  if (typeof advance !== "function") {
    throw new Error("jest.advanceTimersByTimeAsync needs Jest 29.5+");
  }
  await advance.call(jest, ms);
}

/** Lets debounces, fake network latency and rAF callbacks run out. */
async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await advanceTimersAsync(250);
  }
}

function resetPage(): void {
  document.body.innerHTML = "";
  localStorage.clear();
  window.history.replaceState(null, "", "/");
}

/** Mounts `fixture` on a fresh page and returns it with its page setups. */
async function mountFresh(
  fixture: SsrFixture
): Promise<{ wrapper: HTMLDivElement; cleanup: () => void }> {
  resetPage();
  const wrapper = parseInert(fixture.html);
  mountFixture(fixture, wrapper);
  const cleanups = runPageSetups();
  await settle();
  return {
    wrapper,
    cleanup: () => {
      for (const cleanup of cleanups) cleanup();
    },
  };
}

interface Tier1Plan {
  readonly perFixture: ReadonlyMap<string, readonly Tier1Target[]>;
  readonly total: number;
  /** Cap violations, each listing the fixture's targets grouped by key. */
  readonly overCap: readonly string[];
}

/** Discovers every fixture's targets and checks them against the caps. */
async function planTier1(
  fixtures: readonly SsrFixture[],
  caps: Tier1Caps
): Promise<Tier1Plan> {
  const perFixture = new Map<string, readonly Tier1Target[]>();
  const overCap: string[] = [];
  let total = 0;
  for (const fixture of tier1Fixtures(fixtures)) {
    const { wrapper, cleanup } = await mountFresh(fixture);
    const targets = tier1Targets(wrapper);
    // Counts before dedup, so the report shows which key let rows through.
    const raw = new Map<string, number>();
    for (const el of Array.from(wrapper.querySelectorAll(TIER1_CANDIDATES))) {
      if (!isTier1Target(el)) continue;
      const key = targetKey(el, wrapper);
      raw.set(key, (raw.get(key) ?? 0) + 1);
    }
    cleanup();
    perFixture.set(fixture.name, targets);
    total += targets.length;
    const cap =
      caps.overrides?.[fixture.name]?.max ?? TIER1_MAX_RUNS_PER_FIXTURE;
    if (targets.length > cap) {
      const listing = [...raw].map(([key, n]) => `    ${n}× ${key}`).join("\n");
      overCap.push(
        `${fixture.name}: ${targets.length} Tier 1 targets, cap ${cap}:\n${listing}`
      );
    }
  }
  resetPage();
  return { perFixture, total, overCap };
}

// ---------------------------------------------------------------------------
// Tier 1 scripts. Each step is followed by `settle()` and an invariant check.
// ---------------------------------------------------------------------------

export interface Step {
  readonly name: string;
  readonly act: () => void;
}

/** Typed into every text input in turn: dict prefix, corpus lemma, suffix. */
const TYPED_VALUES = ["amo", "@l:am", "-arum"];
const TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  "text",
  "search",
  "email",
  "url",
  "tel",
  "password",
]);

function fire(el: Element, type: string): void {
  el.dispatchEvent(new Event(type, { bubbles: true }));
}

function press(key: string): void {
  const target = document.activeElement ?? document.body;
  for (const type of ["keydown", "keyup"]) {
    target.dispatchEvent(
      new KeyboardEvent(type, { key, bubbles: true, cancelable: true })
    );
  }
}

function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  el.value = value;
  try {
    el.setSelectionRange(value.length, value.length);
  } catch {
    // Not every input type has a selection (e.g. email).
  }
  fire(el, "input");
}

function tier1Script(el: Element): Step[] {
  if (
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(el.type))
  ) {
    return [
      { name: "focus", act: () => el.focus() },
      ...TYPED_VALUES.map((v) => ({
        name: `type "${v}"`,
        act: () => typeInto(el, v),
      })),
      { name: "ArrowDown", act: () => press("ArrowDown") },
      { name: "Escape", act: () => press("Escape") },
      { name: "blur", act: () => el.blur() },
    ];
  }
  if (el instanceof HTMLInputElement && /^(number|range)$/.test(el.type)) {
    const step = (up: boolean) => () => {
      if (up) el.stepUp();
      else el.stepDown();
      fire(el, "input");
      fire(el, "change");
    };
    return [
      { name: "step up", act: step(true) },
      { name: "step down", act: step(false) },
    ];
  }
  if (el instanceof HTMLSelectElement) {
    const n = el.options.length;
    const move = (by: number) => () => {
      el.selectedIndex = (el.selectedIndex + by + n) % n;
      fire(el, "input");
      fire(el, "change");
    };
    return [
      { name: "select the next option", act: move(1) },
      { name: "select the original option", act: move(-1) },
    ];
  }
  const click = () => {
    if (el instanceof HTMLElement) el.click();
  };
  if (el instanceof HTMLInputElement && el.type === "radio") {
    return [{ name: "click", act: click }];
  }
  if (el instanceof HTMLInputElement && el.type === "checkbox") {
    return [
      { name: "click", act: click },
      { name: "click again", act: click },
    ];
  }
  // Buttons and summaries: open, dismiss, toggle back.
  return [
    { name: "click", act: click },
    { name: "Escape", act: () => press("Escape") },
    { name: "click again", act: click },
  ];
}

// ---------------------------------------------------------------------------
// Invariants after each step.
// ---------------------------------------------------------------------------

/**
 * Regions whose server-rendered contents a partial swap may replace: slots
 * (`swapSlots` replaces the slot element itself) and the dict results output
 * (`fetchAndSwapPartial` replaces its children).
 */
const SWAP_REGIONS = `[${SLOT_ATTR}], #dict-results`;

function inSwapRegion(
  el: Element,
  baseline: ReadonlyMap<Element, Node>
): boolean {
  // The element's ancestry before the step, since removed nodes have none.
  for (let cur: Node | undefined = el; cur instanceof Element; ) {
    if (cur.matches(SWAP_REGIONS)) return true;
    cur = baseline.get(cur) ?? cur.parentNode ?? undefined;
  }
  return false;
}

/**
 * Element tags in every partial served so far. Content swapped into a region
 * is server-rendered, so it's accounted for by tag count rather than
 * allowlisted. Tags rather than classes, since components may toggle
 * classes on swapped-in content.
 */
function servedTagCounts(log: FakeNetworkLog): Map<string, number> {
  const counts = new Map<string, number>();
  // Slot partials wrap each slot in `<template data-slot>`, whose content
  // `querySelectorAll` doesn't reach, so descend into templates explicitly.
  const count = (root: ParentNode) => {
    for (const el of Array.from(root.querySelectorAll("*"))) {
      counts.set(el.localName, (counts.get(el.localName) ?? 0) + 1);
      if (el instanceof HTMLTemplateElement) count(el.content);
    }
  };
  for (const body of log.html) count(parseInert(body));
  return counts;
}

function checkInvariants(
  baseline: ReadonlyMap<Element, Node>,
  log: FakeNetworkLog
): string[] {
  const root = document.body;
  const out: string[] = [];
  const swapped = log.html.length > 0;
  const { removed, reparented, created } = diffTree(baseline, root);

  const ssrParent = (el: Element) => baseline.get(el) ?? el.parentNode;
  for (const el of removed) {
    if (swapped && inSwapRegion(el, baseline)) continue;
    if (inIsomorphicRerender(el, ssrParent)) continue;
    out.push(`removed ${describeElement(el)}`);
  }
  for (const { el, from } of reparented) {
    out.push(
      `moved ${describeElement(el)} from ${describeParent(
        from,
        root
      )} to ${describeParent(el.parentNode, root)}`
    );
  }

  const served = servedTagCounts(log);
  for (const el of created) {
    // Created controls keep the No-JS rule: swapped-in and re-rendered markup
    // is what a No-JS page gets, and JS-built controls belong under
    // `[data-js-only]`.
    if (el.matches(NO_JS_CONTROLS)) {
      const violation = noJsControlViolation(el, document);
      if (violation) out.push(`created ${describeElement(el)} ${violation}`);
    }
    if (isAllowlistedCreation(el, "interaction")) continue;
    if (inIsomorphicRerender(el)) continue;
    const left = served.get(el.localName) ?? 0;
    if (swapped && left > 0 && el.closest(SWAP_REGIONS)) {
      served.set(el.localName, left - 1);
      continue;
    }
    out.push(
      `created ${describeElement(el)} inside ${describeParent(
        el.parentElement,
        root
      )}`
    );
  }

  const ids = new Set<string>();
  for (const el of Array.from(root.querySelectorAll("[id]"))) {
    if (ids.has(el.id)) out.push(`duplicate id="${el.id}"`);
    ids.add(el.id);
  }
  return out;
}

/**
 * How a run paces its script:
 * - `settled`: settle and check the invariants after every step.
 * - `abandoned`: run the steps back to back and tear the page down at once,
 *   with debounces and requests still pending.
 * - `mid-body`: as `abandoned`, but tear down at the first moment a response
 *   body is being read: `fetch()` has resolved, so an abort no longer
 *   rejects it. A no-op for scripts that fetch nothing.
 * The last two run late callbacks against disconnected components (the bug
 * class of 871f99b7).
 */
type RunMode = "settled" | "abandoned" | "mid-body";
const RUN_MODES: readonly RunMode[] = ["settled", "abandoned", "mid-body"];

/** Advances the clock in small ticks until `done()`, for at most `maxMs`. */
async function advanceUntil(done: () => boolean, maxMs: number) {
  for (let t = 0; t < maxMs && !done(); t += 5) {
    await advanceTimersAsync(5);
  }
}

/** What a run executes, or why it couldn't be set up. */
type Prepared =
  | { readonly label: string; readonly steps: readonly Step[] }
  | { readonly error: string };

/**
 * Mounts `fixture` fresh, runs the steps `prepare` returns, paced by
 * `mode`, then disconnects everything and lets pending work finish, so a
 * late write to a detached node is attributed to this run. `onSettled` adds
 * checks at the end of a `settled` run.
 */
async function runScript(
  fixture: SsrFixture,
  mode: RunMode,
  prepare: (wrapper: HTMLDivElement) => Prepared,
  onSettled: (log: FakeNetworkLog) => string[] = () => []
): Promise<string[]> {
  const log = installFakeNetwork();
  const errors: string[] = [];
  const onError = (e: ErrorEvent) => {
    errors.push(String(e.error ?? e.message));
    e.preventDefault();
  };
  window.addEventListener("error", onError);
  clearDetachedDomWrites();
  // First step that hit each problem, so a lasting one is reported once.
  const found = new Map<string, string>();
  let label = `${fixture.name} (${mode})`;
  try {
    const { wrapper, cleanup } = await mountFresh(fixture);
    try {
      const prepared = prepare(wrapper);
      if ("error" in prepared) {
        errors.push(prepared.error);
      } else {
        label = `${fixture.name}: ${prepared.label} (${mode})`;
        const baseline = snapshotTree(document.body);
        for (const step of prepared.steps) {
          try {
            step.act();
          } catch (err) {
            errors.push(`${step.name} threw ${String(err)}`);
            break;
          }
          if (mode !== "settled") {
            await Promise.resolve();
            continue;
          }
          await settle();
          for (const problem of checkInvariants(baseline, log)) {
            if (!found.has(problem)) found.set(problem, step.name);
          }
        }
        if (mode === "settled") {
          errors.push(...onSettled(log));
          // Section 3 of the SSR harness, on the swapped-in DOM. Last,
          // since revealing targets changes the page. Duplicate ids are
          // already checked after every step.
          if (log.html.length > 0) {
            const { danglingHrefs, unrevealedTargets } = checkAddresses();
            errors.push(...danglingHrefs, ...unrevealedTargets);
          }
        }
        if (mode === "mid-body") {
          // Stops early once nothing is scheduled: the script fetched nothing.
          await advanceUntil(
            () => log.pendingBodies > 0 || jest.getTimerCount() === 0,
            1000
          );
        }
      }
    } finally {
      cleanup();
      resetPage();
    }
    await settle();
  } finally {
    window.removeEventListener("error", onError);
  }
  const out = [...found].map(
    ([problem, step]) => `${label}: after ${step}: ${problem}`
  );
  out.push(...errors.map((e) => `${label}: ${e}`));
  out.push(...log.unrouted.map((u) => `${label}: unrouted fetch ${u}`));
  out.push(
    ...detachedDomWrites.map(
      (w) => `${label}: write to a detached node: ${w.split("\n")[0]}`
    )
  );
  clearDetachedDomWrites();
  return out;
}

/** Runs `tier1Script` on target `index` of `fixture`. */
function runTier1(
  fixture: SsrFixture,
  index: number,
  key: string,
  mode: RunMode
): Promise<string[]> {
  return runScript(fixture, mode, (wrapper) => {
    const target = tier1Targets(wrapper)[index];
    if (target?.key !== key) {
      return {
        error: `target #${index} differs between mounts: ${
          target?.key ?? "none"
        }`,
      };
    }
    return {
      label: describeElement(target.el),
      steps: tier1Script(target.el),
    };
  });
}

// ---------------------------------------------------------------------------
// Tier 2: declared multi-step scenarios, for flows a single control's script
// can't reach (picking an option, submitting, paging). Steps look elements
// up when they run, and a missing one fails the scenario.
// ---------------------------------------------------------------------------

export interface Scenario {
  readonly fixture: string;
  readonly name: string;
  readonly steps: readonly Step[];
  /** The flow must end in a partial swap, so the scenario isn't vacuous. */
  readonly expectSwap?: true;
}

function find(selector: string): HTMLElement {
  const el = document.querySelector(selector);
  if (!(el instanceof HTMLElement)) throw new Error(`no ${selector}`);
  return el;
}

function textField(selector: string): HTMLInputElement {
  const el = find(selector);
  if (!(el instanceof HTMLInputElement)) {
    throw new Error(`${selector} is not an <input>`);
  }
  return el;
}

export const focusOn = (selector: string): Step => ({
  name: `focus ${selector}`,
  act: () => find(selector).focus(),
});
export const typeIn = (selector: string, value: string): Step => ({
  name: `type "${value}" into ${selector}`,
  act: () => typeInto(textField(selector), value),
});
export const pressKey = (key: string): Step => ({
  name: key,
  act: () => press(key),
});
export const submitFormOf = (selector: string): Step => ({
  name: `submit the form of ${selector}`,
  act: () => {
    const form = textField(selector).form;
    if (!form) throw new Error(`${selector} has no form`);
    form.requestSubmit();
  },
});
export const clickOn = (selector: string): Step => ({
  name: `click ${selector}`,
  act: () => find(selector).click(),
});

function runTier2(
  fixture: SsrFixture,
  scenario: Scenario,
  mode: RunMode
): Promise<string[]> {
  return runScript(
    fixture,
    mode,
    () => ({ label: scenario.name, steps: scenario.steps }),
    (log) =>
      scenario.expectSwap && log.html.length === 0
        ? ["ended without a partial swap"]
        : []
  );
}

// ---------------------------------------------------------------------------
// The suite.
// ---------------------------------------------------------------------------

export interface InteractionSuite {
  /** Builds the feature's fixtures (`testing/ssr_fixtures.ts`). */
  readonly fixtures: () => SsrFixture[] | Promise<SsrFixture[]>;
  readonly caps: Tier1Caps;
  /** Tier 2 flows on this suite's fixtures. */
  readonly scenarios?: readonly Scenario[];
}

/** Registers a feature's Tier 1 and Tier 2 tests in the calling test file. */
export function describeInteractionConformance(
  name: string,
  suite: InteractionSuite
): void {
  describe(`Interaction-time SSR conformance: ${name}`, () => {
    const fixtures: SsrFixture[] = [];

    beforeAll(async () => {
      installMatchMediaStub();
      fixtures.push(...(await suite.fixtures()));
    });

    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ["performance", "queueMicrotask"] });
      installFakeNetwork();
    });

    afterEach(() => {
      resetPage();
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    test("Tier 1: every fixture's targets fit the caps", async () => {
      const plan = await planTier1(fixtures, suite.caps);
      expect(plan.overCap).toEqual([]);
      expect(plan.total).toBeGreaterThanOrEqual(suite.caps.minRuns);
    });

    test("Tier 1: interacting with any control keeps the SSR invariants", async () => {
      const plan = await planTier1(fixtures, suite.caps);
      // Fail before any run, not after a slow sweep.
      expect(plan.overCap).toEqual([]);
      jest.spyOn(console, "warn").mockImplementation(() => {});
      // jsdom logs uncaught listener errors here; they're collected below.
      jest.spyOn(console, "error").mockImplementation(() => {});

      const violations: string[] = [];
      let runs = 0;
      for (const fixture of tier1Fixtures(fixtures)) {
        const targets = plan.perFixture.get(fixture.name) ?? [];
        for (let i = 0; i < targets.length; i++) {
          runs++;
          for (const mode of RUN_MODES) {
            violations.push(
              ...(await runTier1(fixture, i, targets[i].key, mode))
            );
          }
        }
      }
      expect(runs).toBeGreaterThanOrEqual(suite.caps.minRuns);
      expect(violations).toEqual([]);
    }, 60_000); // Last-resort backstop only; the caps above are what bound the sweep.

    const scenarios = suite.scenarios ?? [];
    if (scenarios.length === 0) return;
    test("Tier 2: declared scenarios keep the SSR invariants", async () => {
      jest.spyOn(console, "warn").mockImplementation(() => {});
      jest.spyOn(console, "error").mockImplementation(() => {});
      const byName = new Map(fixtures.map((f) => [f.name, f]));
      const violations: string[] = [];
      for (const scenario of scenarios) {
        const fixture = byName.get(scenario.fixture);
        if (!fixture) {
          violations.push(`${scenario.name}: no fixture ${scenario.fixture}`);
          continue;
        }
        for (const mode of RUN_MODES) {
          violations.push(...(await runTier2(fixture, scenario, mode)));
        }
      }
      expect(violations).toEqual([]);
    });
  });
}
