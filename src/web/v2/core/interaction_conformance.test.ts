/**
 * Interaction-time SSR conformance (corpus/DESIGN.md §9 item 8).
 *
 * `ssr_conformance.test.ts` checks the DOM right after upgrade. This harness
 * checks it again after the user does something: focusing, typing, clicking,
 * and the mocked fetches that follow. Everything runs in jsdom; nothing here
 * ships to the client.
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
 * (`Tier1Mode`), to catch late writes to detached nodes.
 *
 * The sweep's size is capped, and the cap is checked before any run starts,
 * so a fixture that grows a long list of controls fails fast instead of
 * making the sweep slow.
 *
 * @jest-environment jsdom
 */

import "@/web/v2/v2_elements.client";
import {
  clearDetachedDomWrites,
  detachedDomWrites,
} from "@/web/v2/core/dom_invariants.client";
import { SLOT_ATTR } from "@/web/v2/core/slots.common";
import {
  buildSsrFixtures,
  installMatchMediaStub,
  mountFixture,
  runPageSetups,
  type SsrFixture,
} from "@/web/v2/testing/ssr_fixtures";
import {
  NO_JS_CONTROLS,
  describeElement,
  describeParent,
  diffTree,
  inIsomorphicRerender,
  isAllowlistedCreation,
  nearestMorcus,
  noJsControlViolation,
  parseInert,
  snapshotTree,
} from "@/web/v2/testing/ssr_invariants";
import {
  installFakeNetwork,
  type FakeNetworkLog,
} from "@/web/v2/testing/fake_v2_network";

jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/v2/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/v2/reader/reader_loader.server", () =>
  jest.requireActual("@/web/v2/testing/mock_reader_loader")
);

// ---------------------------------------------------------------------------
// Tier 1 budget. Counts, not wall time: a "run" is one fresh parse + upgrade,
// one control's script, and an invariant check after each step.
//
// Raising a cap, or adding an override, needs human review. The preferred
// fix for a fixture over its cap is a better dedup key (`targetKey`).
// ---------------------------------------------------------------------------

// Calibrated when this landed: 71 targets in total, at most 14 per fixture
// (`dict-results`).
const TIER1_MAX_RUNS_PER_FIXTURE = 25;
const TIER1_MAX_RUNS_TOTAL = 120;
/** Below this the sweep is probably vacuous (e.g. a dedup bug). */
const TIER1_MIN_RUNS_TOTAL = 50;
const TIER1_CAP_OVERRIDES: Readonly<
  Record<string, { readonly max: number; readonly reason: string }>
> = {};

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
 * Lets debounces, fake network latency and rAF callbacks run out. Jest 29.5+
 * has `advanceTimersByTimeAsync` (it flushes promises between timers), but
 * the installed `@types/jest` predates it.
 */
async function settle(): Promise<void> {
  const timers = jest as unknown as {
    advanceTimersByTimeAsync(ms: number): Promise<void>;
  };
  for (let i = 0; i < 4; i++) {
    await timers.advanceTimersByTimeAsync(250);
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
async function planTier1(fixtures: readonly SsrFixture[]): Promise<Tier1Plan> {
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
      TIER1_CAP_OVERRIDES[fixture.name]?.max ?? TIER1_MAX_RUNS_PER_FIXTURE;
    if (targets.length > cap) {
      const listing = [...raw].map(([key, n]) => `    ${n}× ${key}`).join("\n");
      overCap.push(
        `${fixture.name}: ${targets.length} Tier 1 targets, cap ${cap}:\n${listing}`
      );
    }
  }
  if (total > TIER1_MAX_RUNS_TOTAL) {
    overCap.push(
      `all fixtures: ${total} Tier 1 targets, cap ${TIER1_MAX_RUNS_TOTAL}`
    );
  }
  resetPage();
  return { perFixture, total, overCap };
}

// ---------------------------------------------------------------------------
// Tier 1 scripts. Each step is followed by `settle()` and an invariant check.
// ---------------------------------------------------------------------------

interface Step {
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
  for (const body of log.html) {
    for (const el of Array.from(parseInert(body).querySelectorAll("*"))) {
      counts.set(el.localName, (counts.get(el.localName) ?? 0) + 1);
    }
  }
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
 * How a Tier 1 run paces its script:
 * - `settled`: settle and check the invariants after every step.
 * - `abandoned`: run the steps back to back and tear the page down at once,
 *   with debounces and requests still pending.
 * - `mid-body`: as `abandoned`, but tear down at the first moment a response
 *   body is being read: `fetch()` has resolved, so an abort no longer
 *   rejects it. A no-op for scripts that fetch nothing.
 * The last two run late callbacks against disconnected components (the bug
 * class of 871f99b7).
 */
type Tier1Mode = "settled" | "abandoned" | "mid-body";
const TIER1_MODES: readonly Tier1Mode[] = ["settled", "abandoned", "mid-body"];

/** Advances the clock in small ticks until `done()`, for at most `maxMs`. */
async function advanceUntil(done: () => boolean, maxMs: number) {
  const timers = jest as unknown as {
    advanceTimersByTimeAsync(ms: number): Promise<void>;
  };
  for (let t = 0; t < maxMs && !done(); t += 5) {
    await timers.advanceTimersByTimeAsync(5);
  }
}

/**
 * Runs `tier1Script` on target `index` of a freshly mounted `fixture`, then
 * disconnects everything and lets pending work finish, so a late write to a
 * detached node is attributed to this run.
 */
async function runTier1(
  fixture: SsrFixture,
  index: number,
  key: string,
  mode: Tier1Mode
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
  let label = `${fixture.name}: target #${index} (${mode})`;
  try {
    const { wrapper, cleanup } = await mountFresh(fixture);
    try {
      const target = tier1Targets(wrapper)[index];
      if (target?.key !== key) {
        errors.push(`target differs between mounts: ${target?.key ?? "none"}`);
      } else {
        label = `${fixture.name}: ${describeElement(target.el)} (${mode})`;
        const baseline = snapshotTree(document.body);
        for (const step of tier1Script(target.el)) {
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
  out.push(...errors.map((e) => `${label}: uncaught ${e}`));
  out.push(...log.unrouted.map((u) => `${label}: unrouted fetch ${u}`));
  out.push(
    ...detachedDomWrites.map(
      (w) => `${label}: write to a detached node: ${w.split("\n")[0]}`
    )
  );
  clearDetachedDomWrites();
  return out;
}

describe("Interaction-time SSR conformance", () => {
  const fixtures: SsrFixture[] = [];

  beforeAll(async () => {
    installMatchMediaStub();
    fixtures.push(...(await buildSsrFixtures()));
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
    const plan = await planTier1(fixtures);
    expect(plan.overCap).toEqual([]);
    expect(plan.total).toBeGreaterThanOrEqual(TIER1_MIN_RUNS_TOTAL);
  });

  test("Tier 1: interacting with any control keeps the SSR invariants", async () => {
    const plan = await planTier1(fixtures);
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
        for (const mode of TIER1_MODES) {
          violations.push(
            ...(await runTier1(fixture, i, targets[i].key, mode))
          );
        }
      }
    }
    expect(runs).toBeGreaterThanOrEqual(TIER1_MIN_RUNS_TOTAL);
    expect(violations).toEqual([]);
  }, 120_000); // Last-resort backstop only; the caps above are what bound the sweep.
});
