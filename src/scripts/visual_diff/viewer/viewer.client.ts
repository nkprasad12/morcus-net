/* istanbul ignore file */

/**
 * Browser-side logic for the Visual Diff Inspector. Bundled by esbuild into
 * `viewer.js` at generation time (see `writeViewer` in `visual_diff.ts`).
 *
 * All DOM is built with `textContent` / element APIs; no untrusted strings are
 * ever assigned to `innerHTML`.
 */

import type {
  ImageDims,
  SnapshotMeta,
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
  /** Ids confirmed this session. In memory only: a reload starts over. */
  confirmed: Set<string>;
  /** Confirm batches, most recent last, for undo. */
  confirmHistory: string[][];
  showConfirmed: boolean;
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
const ALL = manifest.items;

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
  confirmed: new Set(),
  confirmHistory: [],
  showConfirmed: false,
};

const els = {
  search: byId("search", HTMLInputElement),
  browser: byId("browser-filter", HTMLSelectElement),
  sort: byId("sort-order", HTMLSelectElement),
  group: byId("group-by", HTMLSelectElement),
  showConfirmed: byId("show-confirmed", HTMLInputElement),
  confirm: byId("confirm", HTMLButtonElement),
  undoConfirm: byId("undo-confirm", HTMLButtonElement),
  confirmProgress: byId("confirm-progress", HTMLSpanElement),
  confirmBar: byId("confirm-bar", HTMLSpanElement),
  confirmCount: byId("confirm-count", HTMLSpanElement),
  facets: byId("facets", HTMLDivElement),
  clearFilters: byId("clear-filters", HTMLButtonElement),
  list: byId("scenario-list", HTMLUListElement),
  filteredCount: byId("filtered-count", HTMLSpanElement),
  viewport: byId("viewport", HTMLDivElement),
  flipControls: byId("flip-controls", HTMLDivElement),
  diffControls: byId("diff-controls", HTMLLabelElement),
  diffOpacity: byId("diff-opacity", HTMLInputElement),
  showBefore: byId("show-before", HTMLButtonElement),
  showAfter: byId("show-after", HTMLButtonElement),
  peek: byId("peek", HTMLButtonElement),
  blink: byId("blink", HTMLButtonElement),
  helpModal: byId("help-modal", HTMLDivElement),
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

function initFilters() {
  byId("total-count", HTMLSpanElement).textContent = `${ALL.length} changed`;
  byId(
    "source-label",
    HTMLSpanElement
  ).textContent = `${manifest.beforeLabel} → ${manifest.afterLabel}`;
  byId("before-button-label", HTMLSpanElement).textContent =
    manifest.beforeLabel;
  byId("after-button-label", HTMLSpanElement).textContent = manifest.afterLabel;

  for (const browser of [...new Set(ALL.map((i) => i.browser))].sort()) {
    const option = h("option", undefined, browser);
    option.value = browser;
    els.browser.append(option);
  }

  readHash();
  els.search.addEventListener("input", applyFilters);
  els.browser.addEventListener("change", applyFilters);
  els.sort.addEventListener("change", applyFilters);
  els.group.addEventListener("change", () => {
    state.group = isGroupKey(els.group.value) ? els.group.value : "none";
    applyFilters();
  });
  els.showConfirmed.addEventListener("change", () => {
    state.showConfirmed = els.showConfirmed.checked;
    applyFilters();
  });
  els.clearFilters.addEventListener("click", clearFilters);
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

/** Whether `item` passes every filter except (optionally) one facet. */
function matches(item: SnapshotMeta, ignore?: FacetKey): boolean {
  if (!state.showConfirmed && state.confirmed.has(item.id)) return false;
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
    els.search.value !== ""
  );
}

function clearFilters() {
  for (const facet of FACETS) state.filters[facet.key] = ALL_VALUE;
  els.browser.value = ALL_VALUE;
  els.search.value = "";
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
  const pending = members.filter((i) => !state.confirmed.has(i.id));
  const li = h("li", "group-header");
  const title = h("span", undefined, label);
  title.append(h("span", "group-count", String(members.length)));
  li.append(title);
  if (pending.length > 0) {
    const button = h("button", undefined, `✓ Confirm ${pending.length}`);
    button.type = "button";
    button.title = "Confirm every snapshot in this group (Shift+Y)";
    button.addEventListener("click", () => confirmItems(pending));
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
  button.classList.toggle("confirmed", state.confirmed.has(item.id));
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
  renderConfirmButton();
  renderStage();
}

// ---------------------------------------------------------------------------
// Confirming (in memory only)
// ---------------------------------------------------------------------------

function renderProgress() {
  const done = ALL.filter((i) => state.confirmed.has(i.id)).length;
  els.confirmCount.textContent = `${done} / ${ALL.length} confirmed`;
  els.confirmBar.style.width =
    ALL.length === 0 ? "0" : `${(done / ALL.length) * 100}%`;
  els.confirmProgress.classList.toggle(
    "complete",
    ALL.length > 0 && done === ALL.length
  );
  els.undoConfirm.disabled = state.confirmHistory.length === 0;
}

function renderConfirmButton() {
  const item = current();
  const done = item !== undefined && state.confirmed.has(item.id);
  els.confirm.disabled = item === undefined;
  els.confirm.classList.toggle("done", done);
  els.confirm.firstChild!.textContent = done ? "↺ Unconfirm " : "✓ Confirm ";
}

/**
 * Confirms `items` and moves on. Hidden items drop out of the list, so the
 * selection stays at the same index, which is now the next pending item.
 */
function confirmItems(items: SnapshotMeta[]) {
  const fresh = items.filter((i) => !state.confirmed.has(i.id));
  if (fresh.length === 0) return;
  for (const item of fresh) state.confirmed.add(item.id);
  state.confirmHistory.push(fresh.map((i) => i.id));
  const index = state.index;
  const cur = current();
  applyFilters();
  if (state.showConfirmed) {
    // Nothing disappeared; step past the item that was just confirmed.
    if (cur !== undefined && fresh.includes(cur)) select(index + 1);
  } else {
    select(Math.min(index, state.filtered.length - 1));
  }
}

function toggleConfirmCurrent() {
  const item = current();
  if (item === undefined) return;
  if (!state.confirmed.has(item.id)) {
    confirmItems([item]);
    return;
  }
  // Only reachable with "Show confirmed" on.
  state.confirmed.delete(item.id);
  state.confirmHistory = state.confirmHistory
    .map((batch) => batch.filter((id) => id !== item.id))
    .filter((batch) => batch.length > 0);
  const index = state.index;
  applyFilters();
  select(index);
}

function confirmCurrentGroup() {
  const item = current();
  if (item === undefined) return;
  if (state.group === "none") {
    confirmItems([item]);
    return;
  }
  const key = groupOf(item).key;
  confirmItems(state.filtered.filter((i) => groupOf(i).key === key));
}

function undoConfirm() {
  const batch = state.confirmHistory.pop();
  if (batch === undefined) return;
  for (const id of batch) state.confirmed.delete(id);
  applyFilters();
  const restored = state.filtered.findIndex((i) => i.id === batch[0]);
  if (restored !== -1) select(restored);
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
  const allConfirmed =
    ALL.length > 0 && ALL.every((i) => state.confirmed.has(i.id));
  els.viewport.replaceChildren(
    h(
      "div",
      "empty",
      ALL.length === 0
        ? "No changed snapshots."
        : allConfirmed
        ? `All ${ALL.length} snapshots confirmed. Press U to undo, H to show them.`
        : state.filtered.length === 0 && !hasActiveFilters()
        ? "Everything left is confirmed."
        : "No snapshots match filters."
    )
  );
  renderConfirmButton();
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
        h("div", "stage-label", `← ${manifest.beforeLabel}`),
        h("div", "stage-label after", `${manifest.afterLabel} →`)
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
      column("before", manifest.beforeLabel),
      column("after", manifest.afterLabel),
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
    label.textContent = state.showAfter
      ? manifest.afterLabel
      : manifest.beforeLabel;
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
  els.confirm.addEventListener("click", toggleConfirmCurrent);
  els.undoConfirm.addEventListener("click", undoConfirm);
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
    const target = e.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement
    ) {
      if (e.key === "Escape") target.blur();
      return;
    }
    if (e.key === "Y") {
      e.preventDefault();
      confirmCurrentGroup();
      return;
    }
    const actions: Record<string, () => void> = {
      y: toggleConfirmCurrent,
      Enter: toggleConfirmCurrent,
      u: undoConfirm,
      h: () => {
        state.showConfirmed = !state.showConfirmed;
        els.showConfirmed.checked = state.showConfirmed;
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
      Escape: () => toggleHelp(false),
    };
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const action = actions[key];
    if (action !== undefined) {
      e.preventDefault();
      action();
    }
  });
}

initFilters();
bindControls();
bindKeyboard();
applyFilters();
