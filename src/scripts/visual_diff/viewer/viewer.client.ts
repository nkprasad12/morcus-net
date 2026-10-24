/* istanbul ignore file */

/**
 * Browser-side logic for the Visual Diff Inspector. Bundled by esbuild into
 * `viewer.js` at generation time (see `writeViewer` in `visual_diff.ts`).
 *
 * All DOM is built with `textContent` / element APIs; no untrusted strings are
 * ever assigned to `innerHTML`.
 */

import type {
  AcceptResponse,
  ApiError,
  CheckpointResponse,
  DropResponse,
  ImageDims,
  SnapshotMeta,
  StoreSummary,
  VisualDiffManifest,
} from "@/scripts/visual_diff/visual_diff_types";

type ViewMode = "flip" | "split" | "diff" | "side";
type Zoom = "fit" | number;
type Layer = "before" | "after" | "diff";

/** The snapshot dimensions that can be filtered on. */
type FacetKey = "category" | "theme" | "size" | "mode";

interface FacetDef {
  key: FacetKey;
  label: string;
  /** Known values in display order; values not listed here are appended. */
  options: { value: string; label: string }[];
}

const FACETS: FacetDef[] = [
  {
    key: "category",
    label: "Page",
    options: [
      { value: "Dictionary", label: "Dictionary" },
      { value: "Reader", label: "Reader" },
      { value: "Library", label: "Library" },
      { value: "About", label: "About" },
      { value: "Corpus", label: "Corpus" },
      { value: "Other", label: "Other" },
    ],
  },
  {
    key: "theme",
    label: "Color",
    options: [
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
      { value: "default", label: "Unknown" },
    ],
  },
  {
    key: "size",
    label: "Size",
    options: [
      { value: "small", label: "Small / Mobile" },
      { value: "large", label: "Large / Desktop" },
      { value: "unknown", label: "Unknown" },
    ],
  },
  {
    key: "mode",
    label: "Scripting",
    options: [
      { value: "nojs", label: "No JS" },
      { value: "js", label: "JS" },
      { value: "default", label: "Unknown" },
    ],
  },
];

const ALL_VALUE = "all";

/** What the snapshot list can be grouped by. */
type GroupKey =
  | "none"
  | "test"
  | "scenario"
  | "browser"
  | "category"
  | "size"
  | "theme"
  | "mode";

const GROUP_KEYS: GroupKey[] = [
  "none",
  "test",
  "scenario",
  "browser",
  "category",
  "size",
  "theme",
  "mode",
];

function isGroupKey(value: string | null): value is GroupKey {
  return GROUP_KEYS.some((k) => k === value);
}

/** Playwright projects in `playwright.config.ts` order: desktop, then mobile. */
const BROWSER_ORDER = [
  "chromium",
  "firefox",
  "webkit",
  "MobileChrome",
  "FirefoxSmallScreen",
  "MobileSafari",
];

type Verdict = "approved" | "rejected";

/** The last accept in `results` mode, which ends that flow. */
interface AcceptedState extends AcceptResponse {
  /** Rejected when accepting: still failing. */
  rejectedCount: number;
}

interface State {
  filtered: SnapshotMeta[];
  index: number;
  view: ViewMode;
  showAfter: boolean;
  blinkTimer?: number;
  zoom: Zoom;
  splitPct: number;
  maskOpacity: number;
  filters: Record<FacetKey, string>;
  group: GroupKey;
  /** `local` mode: only show baselines accepted before this day (YYYY-MM-DD). */
  acceptedBefore: string;
  /** Verdicts by item id. */
  verdicts: Map<string, Verdict>;
  /** Verdict batches, most recent last, for undo: each id's previous verdict. */
  verdictHistory: { id: string; previous?: Verdict }[][];
  showReviewed: boolean;
  /** `results` mode: set once accepted; the flow ends there. */
  accepted?: AcceptedState;
  /** `local` mode: the last checkpoint. */
  checkpointed?: CheckpointResponse;
  /** `local` mode: ids checkpointed or dropped this session. */
  removed: Set<string>;
  /** The local store, as of the last write. */
  store?: StoreSummary;
  /** A write request is in flight. */
  busy: boolean;
  actionError?: string;
  /** A one-off message, e.g. after an undo. */
  notice?: string;
}

const BLINK_INTERVAL_MS = 600;
const VIEWPORT_PADDING = 32;
/** Height of the label row above the image (`.stage-caption`). */
const CAPTION_HEIGHT = 28;

function byId<T extends HTMLElement>(
  id: string,
  ctor: { new (): T; prototype: T }
): T {
  const found = document.getElementById(id);
  if (!(found instanceof ctor)) {
    throw new Error(`Missing element #${id}`);
  }
  return found;
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const manifest: VisualDiffManifest = JSON.parse(
  byId("manifest-data", HTMLScriptElement).textContent ?? "{}"
);
/** The snapshots under review; `local` mode drops checkpointed ones. */
let ALL = manifest.items;
const labels = { before: manifest.beforeLabel, after: manifest.afterLabel };

const state: State = {
  // Populated by the first applyFilters(); starting empty means nothing is
  // "kept selected" and the top of the sorted list is shown first.
  filtered: [],
  index: 0,
  view: "flip",
  showAfter: false,
  zoom: "fit",
  splitPct: 50,
  maskOpacity: 100,
  filters: {
    category: ALL_VALUE,
    theme: ALL_VALUE,
    size: ALL_VALUE,
    mode: ALL_VALUE,
  },
  group: "none",
  verdicts: new Map(),
  verdictHistory: [],
  acceptedBefore: "",
  showReviewed: false,
  removed: new Set(),
  store: manifest.localStore,
  busy: false,
};

const els = {
  search: byId("search", HTMLInputElement),
  browser: byId("browser-filter", HTMLSelectElement),
  sort: byId("sort-order", HTMLSelectElement),
  group: byId("group-by", HTMLSelectElement),
  showReviewed: byId("show-reviewed", HTMLInputElement),
  approve: byId("approve", HTMLButtonElement),
  reject: byId("reject", HTMLButtonElement),
  undoVerdict: byId("undo-verdict", HTMLButtonElement),
  reviewProgress: byId("review-progress", HTMLSpanElement),
  reviewBar: byId("review-bar", HTMLSpanElement),
  reviewCount: byId("review-count", HTMLSpanElement),
  facets: byId("facets", HTMLDivElement),
  clearFilters: byId("clear-filters", HTMLButtonElement),
  list: byId("scenario-list", HTMLUListElement),
  filteredCount: byId("filtered-count", HTMLSpanElement),
  actionsPanel: byId("actions-panel", HTMLDivElement),
  viewport: byId("viewport", HTMLDivElement),
  flipControls: byId("flip-controls", HTMLDivElement),
  diffControls: byId("diff-controls", HTMLLabelElement),
  diffOpacity: byId("diff-opacity", HTMLInputElement),
  showBefore: byId("show-before", HTMLButtonElement),
  showAfter: byId("show-after", HTMLButtonElement),
  peek: byId("peek", HTMLButtonElement),
  blink: byId("blink", HTMLButtonElement),
  helpModal: byId("help-modal", HTMLDivElement),
  acceptedBefore: byId("accepted-before", HTMLInputElement),
  acceptedBeforeRow: byId("accepted-before-row", HTMLLabelElement),
  localLink: byId("local-link", HTMLButtonElement),
  localModal: byId("local-modal", HTMLDivElement),
  localModalText: byId("local-modal-text", HTMLParagraphElement),
  localModalClose: byId("local-modal-close", HTMLButtonElement),
  checkpointModal: byId("checkpoint-modal", HTMLDivElement),
  checkpointForm: byId("checkpoint-form", HTMLFormElement),
  checkpointSummary: byId("checkpoint-summary", HTMLParagraphElement),
  checkpointNames: byId("checkpoint-names", HTMLUListElement),
  checkpointInput: byId("checkpoint-input", HTMLInputElement),
  checkpointSubmit: byId("checkpoint-submit", HTMLButtonElement),
  checkpointCancel: byId("checkpoint-cancel", HTMLButtonElement),
  checkpointError: byId("checkpoint-error", HTMLParagraphElement),
};

function current(): SnapshotMeta | undefined {
  return state.filtered[state.index];
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function severity(item: SnapshotMeta): number {
  if (item.status !== "modified" || item.diffPct === undefined) return 101;
  return item.diffPct;
}

function scoreBadge(item: SnapshotMeta): HTMLSpanElement {
  if (item.status !== "modified") {
    return h("span", "score status", item.status);
  }
  if (item.diffPct === undefined) {
    return h("span", "score unknown", "?");
  }
  const level =
    item.diffPct >= 30 ? "high" : item.diffPct >= 10 ? "mid" : "low";
  return h("span", `score ${level}`, `${item.diffPct.toFixed(2)}%`);
}

function canvasOf(item: SnapshotMeta): ImageDims {
  const b = item.before ?? { width: 0, height: 0 };
  const a = item.after ?? { width: 0, height: 0 };
  return {
    width: Math.max(a.width, b.width) || 800,
    height: Math.max(a.height, b.height) || 600,
  };
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

/** Header labels and browser options (which change as items are removed). */
function renderSourceInfo() {
  byId("total-count", HTMLSpanElement).textContent = `${ALL.length} changed`;
  byId(
    "source-label",
    HTMLSpanElement
  ).textContent = `${labels.before} → ${labels.after}`;
  byId("before-button-label", HTMLSpanElement).textContent = labels.before;
  byId("after-button-label", HTMLSpanElement).textContent = labels.after;

  const selected = els.browser.value;
  els.browser.replaceChildren(els.browser.options[0]);
  for (const browser of [...new Set(ALL.map((i) => i.browser))].sort()) {
    const option = h("option", undefined, browser);
    option.value = browser;
    els.browser.append(option);
  }
  els.browser.value = selected;
  if (els.browser.value === "") els.browser.value = ALL_VALUE;
}

function initFilters() {
  renderSourceInfo();
  readHash();
  els.search.addEventListener("input", applyFilters);
  els.browser.addEventListener("change", applyFilters);
  els.sort.addEventListener("change", applyFilters);
  els.group.addEventListener("change", () => {
    state.group = isGroupKey(els.group.value) ? els.group.value : "none";
    applyFilters();
  });
  els.showReviewed.addEventListener("change", () => {
    state.showReviewed = els.showReviewed.checked;
    applyFilters();
  });
  els.clearFilters.addEventListener("click", clearFilters);
  // Only local baselines have an accepted date.
  els.acceptedBeforeRow.hidden = manifest.source !== "local";
  els.acceptedBefore.value = state.acceptedBefore;
  els.acceptedBefore.addEventListener("change", () => {
    state.acceptedBefore = els.acceptedBefore.value;
    applyFilters();
  });
}

/** Options for a facet: the known ones in order, then any unexpected values. */
function optionsFor(facet: FacetDef): { value: string; label: string }[] {
  const present = new Set(ALL.map((item) => String(item[facet.key])));
  const known = facet.options.filter((o) => present.has(o.value));
  const knownValues = new Set(facet.options.map((o) => o.value));
  const extra = [...present]
    .filter((v) => !knownValues.has(v))
    .sort()
    .map((v) => ({ value: v, label: v }));
  return [...known, ...extra];
}

/**
 * Whether `item` passes every filter except (optionally) one facet. Reviewed
 * items are hidden unless "Show reviewed" is on or `includeReviewed` is set.
 */
function matches(
  item: SnapshotMeta,
  ignore?: FacetKey,
  includeReviewed = false
): boolean {
  if (!includeReviewed && !state.showReviewed && state.verdicts.has(item.id)) {
    return false;
  }
  if (
    state.acceptedBefore !== "" &&
    (item.acceptedAt === undefined ||
      item.acceptedAt.slice(0, 10) >= state.acceptedBefore)
  ) {
    return false;
  }
  for (const facet of FACETS) {
    const wanted = state.filters[facet.key];
    if (
      facet.key !== ignore &&
      wanted !== ALL_VALUE &&
      item[facet.key] !== wanted
    ) {
      return false;
    }
  }
  const browser = els.browser.value;
  if (browser !== ALL_VALUE && item.browser !== browser) return false;
  const query = els.search.value.trim().toLowerCase();
  return (
    query === "" ||
    item.scenario.toLowerCase().includes(query) ||
    item.name.toLowerCase().includes(query)
  );
}

function setFilter(key: FacetKey, value: string) {
  state.filters[key] = value;
  applyFilters();
}

function hasActiveFilters(): boolean {
  return (
    FACETS.some((f) => state.filters[f.key] !== ALL_VALUE) ||
    els.browser.value !== ALL_VALUE ||
    els.search.value !== "" ||
    state.acceptedBefore !== ""
  );
}

function clearFilters() {
  for (const facet of FACETS) state.filters[facet.key] = ALL_VALUE;
  els.browser.value = ALL_VALUE;
  els.search.value = "";
  state.acceptedBefore = "";
  els.acceptedBefore.value = "";
  applyFilters();
}

/**
 * Renders one row per facet. Counts are faceted: each option shows how many
 * snapshots would match if it were selected, given all *other* filters.
 */
function renderFacets() {
  const rows: HTMLElement[] = [];
  for (const facet of FACETS) {
    const options = optionsFor(facet);
    // A dimension with a single value can't narrow anything down.
    if (options.length < 2 && state.filters[facet.key] === ALL_VALUE) continue;

    const pool = ALL.filter((item) => matches(item, facet.key));
    const group = h("div", "facet-options");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", facet.label);
    const choices = [{ value: ALL_VALUE, label: "All" }, ...options];
    for (const choice of choices) {
      const count =
        choice.value === ALL_VALUE
          ? pool.length
          : pool.filter((item) => String(item[facet.key]) === choice.value)
              .length;
      const active = state.filters[facet.key] === choice.value;
      const button = h("button", active ? "active" : undefined, choice.label);
      button.type = "button";
      button.append(h("span", "count", String(count)));
      button.disabled = count === 0 && !active;
      button.setAttribute("aria-pressed", String(active));
      button.addEventListener("click", () =>
        setFilter(facet.key, active ? ALL_VALUE : choice.value)
      );
      group.append(button);
    }
    rows.push(h("span", "facet-label", facet.label), group);
  }
  els.facets.replaceChildren(...rows);
}

function readHash() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  for (const facet of FACETS) {
    const value = params.get(facet.key);
    if (value !== null) state.filters[facet.key] = value;
  }
  const browser = params.get("browser");
  if (browser !== null) els.browser.value = browser;
  if (els.browser.value === "") els.browser.value = ALL_VALUE;
  els.search.value = params.get("q") ?? "";
  const group = params.get("group");
  if (isGroupKey(group)) state.group = group;
  els.group.value = state.group;
  const before = params.get("before");
  if (before !== null && /^\d{4}-\d{2}-\d{2}$/.test(before)) {
    state.acceptedBefore = before;
  }
}

function writeHash() {
  const params = new URLSearchParams();
  for (const facet of FACETS) {
    const value = state.filters[facet.key];
    if (value !== ALL_VALUE) params.set(facet.key, value);
  }
  if (els.browser.value !== ALL_VALUE) params.set("browser", els.browser.value);
  if (els.search.value !== "") params.set("q", els.search.value);
  if (state.group !== "none") params.set("group", state.group);
  if (state.acceptedBefore !== "") params.set("before", state.acceptedBefore);
  const hash = params.toString();
  window.history.replaceState(
    null,
    "",
    hash === "" ? window.location.pathname : `#${hash}`
  );
}

function applyFilters() {
  const previous = current();
  const sort = els.sort.value;

  const bySort = (a: SnapshotMeta, b: SnapshotMeta) => {
    if (sort === "diffAsc") return severity(a) - severity(b);
    if (sort === "name") return a.id.localeCompare(b.id);
    return severity(b) - severity(a);
  };
  state.filtered = ALL.filter((item) => matches(item)).sort(
    (a, b) => compareGroups(a, b) || bySort(a, b)
  );

  renderFacets();
  els.clearFilters.hidden = !hasActiveFilters();
  els.filteredCount.textContent = `Showing ${state.filtered.length} of ${ALL.length}`;
  renderProgress();
  writeHash();

  const kept = previous === undefined ? -1 : state.filtered.indexOf(previous);
  renderList();
  select(Math.max(kept, 0));
}

const SIZE_LABELS: Record<string, string> = {
  small: "mobile",
  large: "desktop",
};

/** The group an item belongs to, as a stable key and a display label. */
function groupOf(item: SnapshotMeta): { key: string; label: string } {
  switch (state.group) {
    case "none":
      return { key: "", label: "" };
    case "test": {
      const key = `${item.scenario} [${item.mode}] [${item.theme}]`;
      return { key, label: key };
    }
    case "scenario":
      return { key: item.scenario, label: item.scenario };
    case "browser":
      return { key: item.browser, label: item.browser };
    default: {
      const facet = FACETS.find((f) => f.key === state.group);
      const value = String(item[state.group]);
      const label =
        facet?.options.find((o) => o.value === value)?.label ?? value;
      return { key: value, label: `${facet?.label ?? ""}: ${label}` };
    }
  }
}

/** Position of an item's group, so groups come out in a sensible order. */
function groupRank(item: SnapshotMeta): number {
  if (state.group === "browser") {
    const i = BROWSER_ORDER.indexOf(item.browser);
    return i === -1 ? BROWSER_ORDER.length : i;
  }
  const facet = FACETS.find((f) => f.key === state.group);
  if (facet === undefined) return 0;
  const i = facet.options.findIndex((o) => o.value === String(item[facet.key]));
  return i === -1 ? facet.options.length : i;
}

function compareGroups(a: SnapshotMeta, b: SnapshotMeta): number {
  if (state.group === "none") return 0;
  return (
    groupRank(a) - groupRank(b) || groupOf(a).key.localeCompare(groupOf(b).key)
  );
}

function itemButtons(): NodeListOf<HTMLButtonElement> {
  return els.list.querySelectorAll<HTMLButtonElement>("button.item");
}

function groupHeader(key: string, label: string): HTMLLIElement {
  const members = state.filtered.filter((i) => groupOf(i).key === key);
  const pending = members.filter((i) => !state.verdicts.has(i.id));
  const li = h("li", "group-header");
  const title = h("span", undefined, label);
  title.append(h("span", "group-count", String(members.length)));
  li.append(title);
  if (pending.length > 0) {
    const button = h("button", undefined, `✓ Approve ${pending.length}`);
    button.type = "button";
    button.title = "Approve every unreviewed snapshot in this group (Shift+A)";
    button.addEventListener("click", () => setVerdict(pending, "approved"));
    li.append(button);
  }
  return li;
}

function renderList() {
  const rows: HTMLLIElement[] = [];
  let lastGroup: string | undefined = undefined;
  state.filtered.forEach((item, i) => {
    if (state.group !== "none") {
      const { key, label } = groupOf(item);
      if (key !== lastGroup) {
        rows.push(groupHeader(key, label));
        lastGroup = key;
      }
    }
    rows.push(listRow(item, i));
  });
  els.list.replaceChildren(...rows);
}

function listRow(item: SnapshotMeta, i: number): HTMLLIElement {
  const button = h("button", "item");
  const verdict = state.verdicts.get(item.id);
  button.classList.toggle("approved", verdict === "approved");
  button.classList.toggle("rejected", verdict === "rejected");
  button.type = "button";
  const text = h("div");
  text.append(
    h("div", "name", item.scenario),
    h(
      "div",
      "meta",
      [
        item.browser,
        SIZE_LABELS[item.size] ?? item.size,
        item.mode,
        item.theme,
      ].join(" · ")
    )
  );
  button.append(text, scoreBadge(item));
  if (verdict !== undefined) {
    const mark = h(
      "span",
      `verdict ${verdict}`,
      verdict === "approved" ? "✓" : "✗"
    );
    mark.title = verdict;
    button.append(mark);
  }
  button.addEventListener("click", () => select(i));
  const li = h("li");
  li.append(button);
  return li;
}

function select(index: number) {
  if (state.filtered.length === 0) {
    state.index = 0;
    renderEmpty();
    return;
  }
  state.index = Math.min(Math.max(index, 0), state.filtered.length - 1);
  itemButtons().forEach((button, i) => {
    const selected = i === state.index;
    button.classList.toggle("selected", selected);
    if (selected) button.scrollIntoView({ block: "nearest" });
  });
  renderInfo();
  const item = current();
  state.showAfter = item?.status === "added";
  renderVerdictButtons();
  renderStage();
}

// ---------------------------------------------------------------------------
// Review verdicts (kept in sessionStorage, keyed by what is being reviewed)
// ---------------------------------------------------------------------------

function verdictCounts(): {
  unreviewed: number;
  approved: number;
  rejected: number;
} {
  let approved = 0;
  let rejected = 0;
  for (const item of ALL) {
    const v = state.verdicts.get(item.id);
    if (v === "approved") approved++;
    else if (v === "rejected") rejected++;
  }
  return { unreviewed: ALL.length - approved - rejected, approved, rejected };
}

function renderProgress() {
  const { unreviewed, approved, rejected } = verdictCounts();
  const done = approved + rejected;
  els.reviewCount.textContent = `${unreviewed} unreviewed · ${approved} approved · ${rejected} rejected`;
  els.reviewBar.style.width =
    ALL.length === 0 ? "0" : `${(done / ALL.length) * 100}%`;
  els.reviewProgress.classList.toggle(
    "complete",
    ALL.length > 0 && unreviewed === 0
  );
  els.undoVerdict.disabled = state.verdictHistory.length === 0;
  renderActions();
}

function renderVerdictButtons() {
  const item = current();
  const verdict = item === undefined ? undefined : state.verdicts.get(item.id);
  els.approve.disabled = item === undefined;
  els.reject.disabled = item === undefined;
  els.approve.classList.toggle("done", verdict === "approved");
  els.reject.classList.toggle("done", verdict === "rejected");
  byId("approve-label", HTMLSpanElement).textContent =
    verdict === "approved" ? "↺ Unapprove" : "✓ Approve";
  byId("reject-label", HTMLSpanElement).textContent =
    verdict === "rejected" ? "↺ Unreject" : "✗ Reject";
}

/**
 * Gives `items` a verdict (or clears it, with `undefined`) and moves on.
 * Reviewed items drop out of the list unless "Show reviewed" is on, so the
 * selection stays at the same index, which is now the next pending item.
 */
function setVerdict(items: SnapshotMeta[], verdict: Verdict | undefined) {
  const changed = items.filter((i) => state.verdicts.get(i.id) !== verdict);
  if (changed.length === 0) return;
  state.verdictHistory.push(
    changed.map((i) => ({ id: i.id, previous: state.verdicts.get(i.id) }))
  );
  for (const item of changed) {
    if (verdict === undefined) state.verdicts.delete(item.id);
    else state.verdicts.set(item.id, verdict);
  }
  saveSession();
  const index = state.index;
  const cur = current();
  applyFilters();
  if (verdict === undefined) {
    select(index);
  } else if (state.showReviewed) {
    // Nothing disappeared; step past the item that was just reviewed.
    if (cur !== undefined && changed.includes(cur)) select(index + 1);
  } else {
    select(Math.min(index, state.filtered.length - 1));
  }
}

/** Sets the current item's verdict, or clears it if it already has it. */
function toggleVerdictCurrent(verdict: Verdict) {
  const item = current();
  if (item === undefined) return;
  setVerdict(
    [item],
    state.verdicts.get(item.id) === verdict ? undefined : verdict
  );
}

/** Gives every unreviewed item in the current group (or just the current item) a verdict. */
function verdictCurrentGroup(verdict: Verdict) {
  const item = current();
  if (item === undefined) return;
  if (state.group === "none") {
    setVerdict([item], verdict);
    return;
  }
  const key = groupOf(item).key;
  setVerdict(
    state.filtered.filter(
      (i) => groupOf(i).key === key && !state.verdicts.has(i.id)
    ),
    verdict
  );
}

function undoVerdict() {
  const batch = state.verdictHistory.pop();
  if (batch === undefined) return;
  for (const { id, previous } of batch) {
    if (previous === undefined) state.verdicts.delete(id);
    else state.verdicts.set(id, previous);
  }
  saveSession();
  applyFilters();
  const restored = state.filtered.findIndex((i) => i.id === batch[0].id);
  if (restored !== -1) select(restored);
}

const STORAGE_PREFIX = "visual-diff:review:";
const TOKEN_KEY = "visual-diff:token";
const storageKey = `${STORAGE_PREFIX}${
  manifest.reviewKey ?? `${manifest.source}:unkeyed`
}`;

interface SavedSession {
  verdicts: [string, Verdict][];
  accepted?: AcceptedState;
  checkpointed?: CheckpointResponse;
  removed: string[];
  store?: StoreSummary;
}

function saveSession() {
  const data: SavedSession = {
    verdicts: [...state.verdicts],
    accepted: state.accepted,
    checkpointed: state.checkpointed,
    removed: [...state.removed],
    store: state.store,
  };
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(data));
  } catch {
    // Storage full or disabled: verdicts just won't survive a reload.
  }
}

function isVerdictEntry(x: unknown): x is [string, Verdict] {
  return (
    Array.isArray(x) &&
    typeof x[0] === "string" &&
    (x[1] === "approved" || x[1] === "rejected")
  );
}

function restoreSession() {
  let data: Partial<SavedSession>;
  try {
    data = JSON.parse(sessionStorage.getItem(storageKey) ?? "{}");
  } catch {
    return;
  }
  if (Array.isArray(data.removed)) {
    state.removed = new Set(
      data.removed.filter((x): x is string => typeof x === "string")
    );
    ALL = ALL.filter((i) => !state.removed.has(i.id));
  }
  const ids = new Set(ALL.map((i) => i.id));
  const verdicts = Array.isArray(data.verdicts)
    ? data.verdicts.filter(isVerdictEntry)
    : [];
  state.verdicts = new Map(verdicts.filter(([id]) => ids.has(id)));
  state.accepted = data.accepted;
  state.checkpointed = data.checkpointed;
  if (data.store !== undefined) state.store = data.store;
}

// ---------------------------------------------------------------------------
// Accept, undo, drop and checkpoint (need the per-session token)
// ---------------------------------------------------------------------------

function readToken(): string | undefined {
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get(
    "token"
  );
  try {
    if (fromHash) {
      // writeHash() drops it from the address bar; keep it for reloads.
      sessionStorage.setItem(TOKEN_KEY, fromHash);
      return fromHash;
    }
    return sessionStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return fromHash ?? undefined;
  }
}

const token = manifest.actions === undefined ? undefined : readToken();

async function post<T>(endpoint: string, body: object): Promise<T> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Visual-Diff-Token": token ?? "",
    },
    body: JSON.stringify(body),
  });
  let data: T & Partial<ApiError>;
  try {
    data = await res.json();
  } catch {
    throw new Error(`${res.status} ${res.statusText}: not a JSON response`);
  }
  if (!res.ok) {
    throw new Error(data.error ?? `${res.status} ${res.statusText}`);
  }
  return data;
}

/** Runs a write request, with the busy state and error reporting. */
async function write(action: () => Promise<void>) {
  if (state.busy) return;
  state.busy = true;
  state.actionError = undefined;
  state.notice = undefined;
  renderActions();
  try {
    await action();
  } catch (err) {
    state.actionError = err instanceof Error ? err.message : String(err);
  } finally {
    state.busy = false;
    saveSession();
    applyFilters();
  }
}

function namesOf(items: SnapshotMeta[]): string[] {
  return items
    .flatMap((i) => (i.snapshotName === undefined ? [] : [i.snapshotName]))
    .sort();
}

function approvedItems(): SnapshotMeta[] {
  return ALL.filter((i) => state.verdicts.get(i.id) === "approved");
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} KiB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function storeLine(store: StoreSummary): string {
  const oldest =
    store.oldestAcceptedAt === undefined
      ? ""
      : ` · oldest ${store.oldestAcceptedAt.slice(0, 10)}`;
  return `Local baselines: ${store.active} not checkpointed (${formatBytes(
    store.bytes
  )})${oldest}`;
}

function staleLine(store: StoreSummary): string | undefined {
  return store.stale.length === 0
    ? undefined
    : `${store.stale.length} stale: they no longer apply; ./morcus.sh visual-baselines drop --stale`;
}

/** Removes checkpointed or dropped local baselines from the list. */
function removeNames(names: readonly string[]) {
  const gone = new Set(names);
  for (const item of ALL) {
    if (item.snapshotName !== undefined && gone.has(item.snapshotName)) {
      state.removed.add(item.id);
      state.verdicts.delete(item.id);
    }
  }
  ALL = ALL.filter((i) => !state.removed.has(i.id));
  state.verdictHistory = [];
  renderSourceInfo();
}

function acceptApproved() {
  const names = namesOf(approvedItems());
  if (names.length === 0) return;
  const rejectedCount = ALL.filter(
    (i) => state.verdicts.get(i.id) === "rejected"
  ).length;
  void write(async () => {
    const res = await post<AcceptResponse>("/api/accept", { names });
    state.accepted = { ...res, rejectedCount };
    state.store = res.store;
  });
}

function undoAccept() {
  const a = state.accepted;
  if (a === undefined) return;
  // Only what the accept changed; "unchanged" names were left alone.
  const names = [...a.added, ...a.updated, ...a.reverted].sort();
  void write(async () => {
    if (names.length > 0) {
      const res = await post<DropResponse>("/api/drop", { names });
      state.store = res.store;
      state.notice =
        `Undid accept: ${res.dropped.length} dropped, ` +
        `${res.restored.length} earlier local baseline(s) restored.`;
    } else {
      state.notice = "Undid accept: nothing had changed.";
    }
    state.accepted = undefined;
  });
}

function dropNames(names: string[], what: string) {
  if (names.length === 0) return;
  const ok = window.confirm(
    `Drop ${what}?\n\n${names.join("\n")}\n\n` +
      "The checkpoint applies again for these. This can't be undone from the viewer."
  );
  if (!ok) return;
  void write(async () => {
    const res = await post<DropResponse>("/api/drop", { names });
    state.store = res.store;
    removeNames(res.dropped);
    state.notice = `Dropped ${res.dropped.length} local baseline(s).`;
  });
}

/** `local` mode: the items a checkpoint applies to (the current filters). */
function selection(): SnapshotMeta[] {
  return ALL.filter((i) => matches(i, undefined, true));
}

function openCheckpoint() {
  const names = namesOf(selection());
  if (names.length === 0) return;
  els.checkpointSummary.textContent =
    `Copy these ${names.length} local baseline(s) into the checkpoint (the ` +
    "committed snapshot directory), and remove them from the local store. " +
    "Files are written to the working tree; nothing is staged or committed.";
  els.checkpointNames.replaceChildren(
    ...names.map((n) => {
      const li = h("li");
      li.append(h("code", undefined, n));
      return li;
    })
  );
  els.checkpointInput.value = "";
  els.checkpointSubmit.disabled = true;
  els.checkpointError.hidden = true;
  els.checkpointModal.hidden = false;
  els.checkpointInput.focus();
}

function closeCheckpoint() {
  els.checkpointModal.hidden = true;
}

async function submitCheckpoint() {
  const names = namesOf(selection());
  const confirm = els.checkpointInput.value.trim();
  if (names.length === 0 || confirm !== "checkpoint" || state.busy) return;
  state.busy = true;
  els.checkpointSubmit.disabled = true;
  els.checkpointError.hidden = true;
  try {
    const res = await post<CheckpointResponse>("/api/checkpoint", {
      names,
      confirm,
    });
    state.checkpointed = res;
    state.store = res.store;
    removeNames(res.promoted);
    closeCheckpoint();
  } catch (err) {
    els.checkpointError.textContent =
      err instanceof Error ? err.message : String(err);
    els.checkpointError.hidden = false;
  } finally {
    state.busy = false;
    els.checkpointSubmit.disabled =
      els.checkpointInput.value.trim() !== "checkpoint";
    saveSession();
    applyFilters();
  }
}

function openLocalHint() {
  els.localModalText.textContent =
    "To review local baselines against the checkpoint, checkpoint a subset, " +
    "or drop some, open local mode in another terminal:";
  els.localModal.hidden = false;
}

function renderLocalLink() {
  const store = state.store;
  if (manifest.source !== "results" || store === undefined) {
    els.localLink.hidden = true;
    return;
  }
  els.localLink.hidden = false;
  els.localLink.textContent = `Local baselines (${store.active}) →`;
  els.localLink.title = storeLine(store);
}

function renderActions() {
  renderLocalLink();
  const actions = manifest.actions;
  if (actions === undefined) {
    els.actionsPanel.hidden = true;
    return;
  }
  const parts: HTMLElement[] = [];
  const note = (cls: string, text: string) =>
    parts.push(h("p", `note ${cls}`.trim(), text));
  const button = (label: string, cls: string, onClick: () => void) => {
    const b = h("button", cls, label);
    b.type = "button";
    b.disabled = state.busy;
    b.addEventListener("click", onClick);
    parts.push(b);
    return b;
  };
  const blocked =
    actions.disabledReason !== undefined
      ? `Actions disabled: ${actions.disabledReason}`
      : token === undefined
      ? "Read-only: open the URL printed in the terminal (ending in #token=…) to make changes."
      : undefined;
  const storeHints = () => {
    if (state.store === undefined) return;
    note("muted", storeLine(state.store));
    const stale = staleLine(state.store);
    if (stale !== undefined) note("warn", `⚠ ${stale}`);
  };

  if (actions.mode === "accept") {
    const a = state.accepted;
    if (a !== undefined) {
      const count = a.added.length + a.updated.length + a.unchanged.length;
      parts.push(
        h(
          "h3",
          "done",
          `✓ Accepted ${count} locally · ${a.rejectedCount} rejected (still failing)`
        )
      );
      note(
        "muted",
        `${a.added.length} added, ${a.updated.length} updated, ` +
          `${a.reverted.length} back to the checkpoint, ${a.unchanged.length} unchanged.`
      );
      storeHints();
      if (blocked === undefined) button("Undo accept", "ghost", undoAccept);
    } else {
      const { unreviewed, approved } = verdictCounts();
      parts.push(h("h3", undefined, "Accept locally"));
      note(
        "muted",
        "Approve or reject every snapshot. Approved ones become local " +
          "baselines (gitignored, nothing to commit). Rejected ones stay failing."
      );
      if (blocked !== undefined) {
        note("warn", blocked);
      } else {
        const b = button(
          `Accept ${approved} locally`,
          "primary",
          acceptApproved
        );
        b.disabled = state.busy || unreviewed > 0 || approved === 0;
        if (unreviewed > 0) {
          note("muted", `Review the remaining ${unreviewed} first.`);
        } else if (approved === 0) {
          note("muted", "Nothing approved.");
        }
      }
    }
  } else {
    parts.push(h("h3", undefined, "Local baselines"));
    storeHints();
    const c = state.checkpointed;
    if (c !== undefined) {
      note("", `Last checkpoint: ${c.promoted.length} file(s) written:`);
      const list = h("ul", "file-list");
      for (const f of c.files) {
        const li = h("li");
        li.append(h("code", undefined, f));
        list.append(li);
      }
      parts.push(list);
      if (c.skippedStale.length > 0) {
        note("warn", `Skipped ${c.skippedStale.length} stale.`);
      }
      note(
        "warn",
        "Nothing was staged or committed. Review with ./morcus.sh visual-diff " +
          "--source git, and commit only with explicit human approval."
      );
    }
    if (blocked !== undefined) {
      note("warn", blocked);
    } else {
      const sel = selection();
      const approvedInSel = sel.filter(
        (i) => state.verdicts.get(i.id) === "approved"
      ).length;
      const rejectedInSel = sel.filter(
        (i) => state.verdicts.get(i.id) === "rejected"
      ).length;
      const scope = hasActiveFilters()
        ? `the ${sel.length} matching the current filters`
        : `all ${sel.length}`;
      if (sel.length === 0) {
        note("muted", "No local baselines match the filters.");
      } else if (approvedInSel === sel.length) {
        note("muted", `Checkpoint applies to ${scope}.`);
        button(`Checkpoint ${sel.length}…`, "primary", openCheckpoint);
      } else {
        note(
          "muted",
          `Checkpoint applies to ${scope}; approve all of them first ` +
            `(${sel.length - approvedInSel - rejectedInSel} unreviewed, ` +
            `${rejectedInSel} rejected). Narrow the filters to checkpoint a subset.`
        );
      }
      const item = current();
      if (item?.snapshotName !== undefined) {
        const name = item.snapshotName;
        button("Drop this local baseline…", "ghost danger", () =>
          dropNames([name], "this local baseline")
        );
      }
      const stale = state.store?.stale ?? [];
      if (stale.length > 0) {
        const details = h("details", "stale-list");
        details.append(
          h("summary", undefined, `${stale.length} stale (no longer apply)`)
        );
        const list = h("ul", "file-list");
        for (const n of stale) {
          const li = h("li");
          li.append(h("code", undefined, n));
          list.append(li);
        }
        details.append(list);
        parts.push(details);
        button(`Drop ${stale.length} stale…`, "ghost danger", () =>
          dropNames(stale, `${stale.length} stale local baseline(s)`)
        );
      }
    }
  }
  if (state.notice !== undefined) note("", state.notice);
  if (state.actionError !== undefined) note("error", state.actionError);
  els.actionsPanel.replaceChildren(...parts);
  els.actionsPanel.hidden = false;
}

function cycleGroup() {
  const i = GROUP_KEYS.indexOf(state.group);
  state.group = GROUP_KEYS[(i + 1) % GROUP_KEYS.length];
  els.group.value = state.group;
  applyFilters();
}

function navigate(delta: number) {
  select(state.index + delta);
}

// ---------------------------------------------------------------------------
// Toolbar / status
// ---------------------------------------------------------------------------

function renderInfo() {
  const item = current();
  if (item === undefined) return;
  byId("active-category", HTMLSpanElement).textContent = item.category;
  byId("active-scenario", HTMLElement).textContent = item.scenario;
  byId("active-badges", HTMLSpanElement).replaceChildren(
    ...[
      item.browser,
      SIZE_LABELS[item.size] ?? item.size,
      item.mode,
      item.theme,
      item.status,
    ].map((t) => h("span", "chip muted", t))
  );
  const canvas = canvasOf(item);
  byId("stat-pixels", HTMLSpanElement).textContent =
    item.diffPixels === undefined
      ? "Pixels: -"
      : `Pixels: ${item.diffPixels.toLocaleString()} / ${(
          canvas.width * canvas.height
        ).toLocaleString()}`;
  byId("stat-pct", HTMLSpanElement).textContent =
    item.diffPct === undefined
      ? `Delta: ${item.status === "modified" ? "-" : item.status}`
      : `Delta: ${item.diffPct.toFixed(2)}%`;
  const dims = (d?: ImageDims) => (d ? `${d.width}×${d.height}` : "none");
  byId("stat-dims", HTMLSpanElement).textContent = `Size: ${dims(
    item.before
  )} → ${dims(item.after)}`;
}

function renderControls() {
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-view]"
  )) {
    button.classList.toggle("active", button.dataset.view === state.view);
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-zoom]"
  )) {
    button.classList.toggle(
      "active",
      button.dataset.zoom === String(state.zoom)
    );
  }
  els.flipControls.style.display = state.view === "flip" ? "" : "none";
  els.diffControls.style.display = state.view === "diff" ? "" : "none";
  els.showBefore.classList.toggle("active", !state.showAfter);
  els.showAfter.classList.toggle("active", state.showAfter);
  els.blink.classList.toggle("active", state.blinkTimer !== undefined);
}

// ---------------------------------------------------------------------------
// Stage rendering
// ---------------------------------------------------------------------------

function urlFor(item: SnapshotMeta, layer: Layer): string | undefined {
  if (layer === "before") return item.beforeUrl;
  if (layer === "after") return item.afterUrl;
  return item.diffUrl;
}

function missingText(item: SnapshotMeta, layer: Layer): string {
  if (layer === "before") return "No baseline (new snapshot)";
  if (layer === "after") return "Snapshot deleted";
  return item.status === "modified"
    ? "No diff mask (ImageMagick unavailable)"
    : `No diff (${item.status} snapshot)`;
}

/** An image (or placeholder) sized to `dims * scale`. */
function picture(
  item: SnapshotMeta,
  layer: Layer,
  dims: ImageDims | undefined,
  scale: number
): HTMLElement {
  const url = urlFor(item, layer);
  const size = dims ?? canvasOf(item);
  if (url === undefined) {
    const box = h("div", "placeholder", missingText(item, layer));
    box.style.width = `${size.width * scale}px`;
    box.style.height = `${size.height * scale}px`;
    return box;
  }
  const img = h("img");
  img.src = url;
  img.alt = layer;
  img.draggable = false;
  img.width = Math.round(size.width * scale);
  img.height = Math.round(size.height * scale);
  return img;
}

function dimsFor(item: SnapshotMeta, layer: Layer): ImageDims | undefined {
  if (layer === "before") return item.before;
  if (layer === "after") return item.after;
  return canvasOf(item);
}

function layerEl(
  item: SnapshotMeta,
  layer: Layer,
  scale: number,
  className = "layer"
): HTMLDivElement {
  const wrapper = h("div", className);
  wrapper.append(picture(item, layer, dimsFor(item, layer), scale));
  return wrapper;
}

function computeScale(canvas: ImageDims): number {
  if (state.zoom !== "fit") return state.zoom;
  const width = els.viewport.clientWidth - VIEWPORT_PADDING;
  const height = els.viewport.clientHeight - VIEWPORT_PADDING - CAPTION_HEIGHT;
  return Math.max(
    0.05,
    Math.min(1, width / canvas.width, height / canvas.height)
  );
}

function makeStage(canvas: ImageDims, scale: number, extraClass = "") {
  const stage = h("div", `stage ${extraClass}`.trim());
  stage.style.width = `${canvas.width * scale}px`;
  stage.style.height = `${canvas.height * scale}px`;
  return stage;
}

/**
 * Puts the before/after labels in a row *above* the stage, so they never
 * cover the pixels being compared.
 */
function framed(stage: HTMLElement, ...labels: HTMLElement[]): HTMLElement {
  const frame = h("div", "stage-frame");
  frame.style.width = stage.style.width;
  const caption = h("div", "stage-caption");
  caption.append(...labels);
  frame.append(caption, stage);
  return frame;
}

function renderEmpty() {
  const allReviewed =
    ALL.length > 0 && ALL.every((i) => state.verdicts.has(i.id));
  const next =
    manifest.actions === undefined ? "" : " Next step: the panel on the left.";
  els.viewport.replaceChildren(
    h(
      "div",
      "empty",
      ALL.length === 0
        ? "No changed snapshots."
        : allReviewed
        ? `All ${ALL.length} snapshots reviewed. Press U to undo, H to show them.${next}`
        : state.filtered.length === 0 && !hasActiveFilters()
        ? "Everything left is reviewed."
        : "No snapshots match filters."
    )
  );
  renderVerdictButtons();
}

function renderStage() {
  stopBlinkIfNotFlip();
  renderControls();
  const item = current();
  if (item === undefined) {
    renderEmpty();
    return;
  }
  const canvas = canvasOf(item);
  const scale = computeScale(canvas);

  if (state.view === "flip") {
    const stage = makeStage(canvas, scale);
    const after = layerEl(item, "after", scale);
    after.id = "flip-after";
    const label = h("div", "stage-label");
    label.id = "flip-label";
    stage.append(layerEl(item, "before", scale), after);
    els.viewport.replaceChildren(framed(stage, label));
    updateFlip();
  } else if (state.view === "split") {
    const stage = makeStage(canvas, scale, "split");
    const after = layerEl(item, "after", scale);
    const handle = h("div", "split-handle");
    const apply = () => {
      after.style.clipPath = `inset(0 0 0 ${state.splitPct}%)`;
      handle.style.left = `${state.splitPct}%`;
    };
    const move = (e: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      state.splitPct = Math.min(
        100,
        Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)
      );
      apply();
    };
    stage.addEventListener("pointerdown", (e) => {
      stage.setPointerCapture(e.pointerId);
      move(e);
    });
    stage.addEventListener("pointermove", (e) => {
      if (stage.hasPointerCapture(e.pointerId)) move(e);
    });
    stage.append(layerEl(item, "before", scale), after, handle);
    apply();
    els.viewport.replaceChildren(
      framed(
        stage,
        h("div", "stage-label", `← ${labels.before}`),
        h("div", "stage-label after", `${labels.after} →`)
      )
    );
  } else if (state.view === "diff") {
    const stage = makeStage(canvas, scale);
    const mask = layerEl(item, "diff", scale);
    mask.id = "diff-mask";
    mask.style.opacity = String(state.maskOpacity / 100);
    stage.append(layerEl(item, "before", scale), mask);
    els.viewport.replaceChildren(
      framed(stage, h("div", "stage-label", "Diff mask"))
    );
  } else {
    const grid = h("div", "side-by-side");
    const column = (layer: Layer, caption: string) => {
      const figure = h("figure");
      figure.append(
        h("figcaption", undefined, caption),
        picture(item, layer, dimsFor(item, layer), 1)
      );
      return figure;
    };
    grid.append(
      column("before", labels.before),
      column("after", labels.after),
      column("diff", "Diff mask")
    );
    els.viewport.replaceChildren(grid);
  }
}

function updateFlip() {
  const after = document.getElementById("flip-after");
  const label = document.getElementById("flip-label");
  if (after !== null) after.classList.toggle("hidden", !state.showAfter);
  if (label !== null) {
    label.textContent = state.showAfter ? labels.after : labels.before;
    label.classList.toggle("after", state.showAfter);
  }
  renderControls();
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function setView(view: ViewMode) {
  if (state.view === view) return;
  state.view = view;
  renderStage();
}

function showAfter(value: boolean) {
  if (state.view !== "flip") {
    state.view = "flip";
    state.showAfter = value;
    renderStage();
    return;
  }
  state.showAfter = value;
  updateFlip();
}

function stopBlink() {
  if (state.blinkTimer !== undefined) {
    window.clearInterval(state.blinkTimer);
    state.blinkTimer = undefined;
  }
}

function stopBlinkIfNotFlip() {
  if (state.view !== "flip") stopBlink();
}

function toggleBlink() {
  if (state.blinkTimer !== undefined) {
    stopBlink();
    renderControls();
    return;
  }
  if (state.view !== "flip") setView("flip");
  state.blinkTimer = window.setInterval(
    () => showAfter(!state.showAfter),
    BLINK_INTERVAL_MS
  );
  renderControls();
}

function setZoom(zoom: Zoom) {
  state.zoom = zoom;
  renderStage();
}

function toggleHelp(show: boolean) {
  els.helpModal.hidden = !show;
}

function bindControls() {
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-view]"
  )) {
    const view = button.dataset.view;
    button.addEventListener("click", () => {
      if (view === "flip" || view === "split" || view === "diff") setView(view);
      else setView("side");
    });
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-zoom]"
  )) {
    const zoom = button.dataset.zoom;
    button.addEventListener("click", () =>
      setZoom(zoom === "fit" || zoom === undefined ? "fit" : Number(zoom))
    );
  }
  els.showBefore.addEventListener("click", () => showAfter(false));
  els.showAfter.addEventListener("click", () => showAfter(true));
  els.peek.addEventListener("pointerdown", () => showAfter(false));
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) {
    els.peek.addEventListener(ev, () => {
      if (!state.showAfter) showAfter(true);
    });
  }
  els.blink.addEventListener("click", toggleBlink);
  els.diffOpacity.value = String(state.maskOpacity);
  els.diffOpacity.addEventListener("input", () => {
    state.maskOpacity = Number(els.diffOpacity.value);
    const mask = document.getElementById("diff-mask");
    if (mask !== null) mask.style.opacity = String(state.maskOpacity / 100);
  });
  els.approve.addEventListener("click", () => toggleVerdictCurrent("approved"));
  els.reject.addEventListener("click", () => toggleVerdictCurrent("rejected"));
  els.undoVerdict.addEventListener("click", undoVerdict);
  els.checkpointInput.addEventListener("input", () => {
    els.checkpointSubmit.disabled =
      state.busy || els.checkpointInput.value.trim() !== "checkpoint";
  });
  els.checkpointForm.addEventListener("submit", (e) => {
    e.preventDefault();
    void submitCheckpoint();
  });
  els.checkpointCancel.addEventListener("click", closeCheckpoint);
  els.localLink.addEventListener("click", openLocalHint);
  els.localModalClose.addEventListener("click", () => {
    els.localModal.hidden = true;
  });
  els.localModal.addEventListener("click", (e) => {
    if (e.target === els.localModal) els.localModal.hidden = true;
  });
  byId("prev", HTMLButtonElement).addEventListener("click", () => navigate(-1));
  byId("next", HTMLButtonElement).addEventListener("click", () => navigate(1));
  byId("help-button", HTMLButtonElement).addEventListener("click", () =>
    toggleHelp(true)
  );
  byId("help-close", HTMLButtonElement).addEventListener("click", () =>
    toggleHelp(false)
  );
  els.helpModal.addEventListener("click", (e) => {
    if (e.target === els.helpModal) toggleHelp(false);
  });

  let resizeFrame = 0;
  window.addEventListener("resize", () => {
    if (state.zoom !== "fit") return;
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(renderStage);
  });
}

function bindKeyboard() {
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!els.checkpointModal.hidden) {
      // No review shortcuts behind the confirmation dialog.
      if (e.key === "Escape") {
        e.preventDefault();
        closeCheckpoint();
      }
      return;
    }
    const target = e.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement
    ) {
      if (e.key === "Escape") target.blur();
      return;
    }
    if (e.key === "A" || e.key === "Y") {
      e.preventDefault();
      verdictCurrentGroup("approved");
      return;
    }
    if (e.key === "R") {
      e.preventDefault();
      verdictCurrentGroup("rejected");
      return;
    }
    const actions: Record<string, () => void> = {
      a: () => toggleVerdictCurrent("approved"),
      y: () => toggleVerdictCurrent("approved"),
      Enter: () => toggleVerdictCurrent("approved"),
      r: () => toggleVerdictCurrent("rejected"),
      u: undoVerdict,
      h: () => {
        state.showReviewed = !state.showReviewed;
        els.showReviewed.checked = state.showReviewed;
        applyFilters();
      },
      g: cycleGroup,
      " ": () => showAfter(!state.showAfter),
      x: () => showAfter(!state.showAfter),
      "1": () => showAfter(false),
      ArrowLeft: () => showAfter(false),
      "2": () => showAfter(true),
      ArrowRight: () => showAfter(true),
      "3": () => setView("diff"),
      d: () => setView("diff"),
      "4": () => setView("side"),
      s: () => setView("split"),
      b: toggleBlink,
      j: () => navigate(1),
      ArrowDown: () => navigate(1),
      k: () => navigate(-1),
      ArrowUp: () => navigate(-1),
      "/": () => els.search.focus(),
      "?": () => toggleHelp(true),
      c: clearFilters,
      Escape: () => {
        toggleHelp(false);
        els.localModal.hidden = true;
      },
    };
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const action = actions[key];
    if (action !== undefined) {
      e.preventDefault();
      action();
    }
  });
}

restoreSession();
initFilters();
bindControls();
bindKeyboard();
applyFilters();
