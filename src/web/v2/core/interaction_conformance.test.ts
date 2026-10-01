/**
 * Interaction-time SSR conformance (corpus/DESIGN.md §9 item 8).
 *
 * `ssr_conformance.test.ts` checks the DOM right after upgrade. This harness
 * checks it again after the user does something: focusing, typing, clicking,
 * and the mocked fetches that follow. Everything runs in jsdom; nothing here
 * ships to the client.
 *
 * Tier 1 will be an automated sweep: every interactive control in every
 * fixture, deduplicated so repeated rows count once, each exercised by a
 * fixed script on a freshly upgraded page. This file so far only discovers
 * the targets and enforces the sweep's size caps, which are checked before
 * any run starts, so a fixture that grows a long list of controls fails fast
 * instead of making the sweep slow.
 *
 * @jest-environment jsdom
 */

import "@/web/v2/v2_elements.client";
import {
  buildSsrFixtures,
  installMatchMediaStub,
  mountFixture,
  runPageSetups,
  type SsrFixture,
} from "@/web/v2/testing/ssr_fixtures";
import { nearestMorcus, parseInert } from "@/web/v2/testing/ssr_invariants";

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

describe("Interaction-time SSR conformance", () => {
  const fixtures: SsrFixture[] = [];

  beforeAll(async () => {
    installMatchMediaStub();
    fixtures.push(...(await buildSsrFixtures()));
  });

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["performance", "queueMicrotask"] });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(""),
      json: () => Promise.resolve([]),
    } as unknown as Response);
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
});
