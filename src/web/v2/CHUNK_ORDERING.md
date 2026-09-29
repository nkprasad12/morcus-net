# UI V2 Chunk Ordering: startup code that runs before the route's components

Findings from landing route code splitting (commit `feat(v2): split the client bundle into
per-route chunks`). The split added an intermediate page state that nothing in `common.js` was
written for. This file records what we know, what is still a hypothesis, and the options, so the
follow-up starts from here rather than from the stopgap.

> [!IMPORTANT]
> Status: **open.** One symptom has a stopgap (below); the general problem is unsolved. Tracked in
> [CODE_HEALTH.md](CODE_HEALTH.md) (Phase 2). Related: [PRE_HYDRATION.md](PRE_HYDRATION.md).

---

## 1. What changed

Before the split, the page loaded one bundle, `v2_bundle.client.ts`:

```ts
import "@/web/v2/v2_elements.client"; // 1. define every custom element
import "@/web/v2/core/anchor_scroll.client"; // 2. global startup (reads component state)
```

Defining an element upgrades the instances already in the parsed DOM synchronously, so by the
time step 2 ran, every component on the page was connected and had registered whatever it
registers (revealers, listeners, stores). **"All components are upgraded before global startup
runs" held by accident of import order.** Nothing stated or enforced it.

Now each page loads a chain of module scripts (see `v2RouteScripts` in
[`v2_build_contract.ts`](../../bundler/v2_build_contract.ts)), e.g. a reader page loads
`common.js` then `reader.js`. Module scripts download in parallel but execute in document order,
each to completion. That creates a new observable state:

| State            | `common.js` | route chunk (`reader.js`, `dict.js`, ...) |
| ---------------- | ----------- | ----------------------------------------- |
| Pre-hydration    | not run     | not run                                   |
| **Intermediate** | **run**     | **not run (still downloading)**           |
| Hydrated         | run         | run                                       |

The intermediate state lasts as long as the route chunk takes to arrive after `common.js`. It is
widest on slow networks with a cold cache, and it recurs on every navigation when the route
chunk is not cached.

## 2. The hazard class

Code **inside** a chunk, or in a later chunk, is safe: chunks run atomically and in `dependOn`
order, so dependencies always run first.

The hazard is code in an **earlier** chunk (today only `common.js`) that assumes components
from a **later** chunk are already live. It comes in two shapes:

- **(a) Startup reads:** code that runs once at `common.js` execution and reads state that route
  components produce (registries, `data-*` set on connect, stores, controller instances). It sees
  an empty or partial world, and singleton setups (`createSingletonSetup`) never retry.
- **(b) Premature interception:** event handlers installed by `common.js` that take over native
  behaviour (`preventDefault`) on the assumption that a component will handle the result. In the
  intermediate state, native No-JS behaviour is suppressed and nothing replaces it.

The same applies inside the reader's dictionary `<iframe>`, which is its own document with its
own `common.js` → `dict.js` chain.

## 3. Audit of `common.js` startup (as of the split)

[`shell/common_entry.client.ts`](shell/common_entry.client.ts) pulls in four modules that run a
global setup at import time (`if (typeof document !== "undefined") setupX()`):

| Setup                                                                                          | Shape | Status                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setupAnchorScroll` initial `revealHashTarget` ([anchor_scroll](core/anchor_scroll.client.ts)) | (a)   | **Confirmed.** Caused late-hydration PH5 (TOC) and PH7 (dict sheet) failures. Stopgap in place (§4).                                                                                    |
| `setupAnchorScroll` document `click` handler                                                   | (b)   | **Suspected, unverified.** See below.                                                                                                                                                   |
| `setupAnchorScroll` `hashchange` / `beforematch`                                               | (a)   | `hashchange` calls the same `revealHashTarget`, so the stopgap covers it. `beforematch` calls `revealTarget` directly and is not covered, though it is unlikely to fire before upgrade. |
| `setupBackToTop` ([back_to_top](core/back_to_top.client.ts))                                   | -     | Safe: only touches shell markup (`.back-to-top`).                                                                                                                                       |
| `setupMobileMenu` ([mobile_menu](shell/mobile_menu.client.ts))                                 | -     | Safe: only touches shell markup.                                                                                                                                                        |
| `setupDeferredIframes` ([deferred_iframe](core/deferred_iframe.client.ts))                     | -     | Safe: plain DOM (`<details>` + `iframe[data-deferred-src]`).                                                                                                                            |

Not yet audited: the **components** in `common.js` (`theme_toggle`, `report_dialog`) and
everything exported from `core/index.client.ts` that has import-time effects. Look for reads of
route components (`closest("morcus-reader-view")`, `data-work`, controller lookups) and for
events dispatched on connect that route components listen for (a route component that connects
later misses them).

`abbr_popover` also runs a global setup at import time, but lives in `dict.js`, so it is not
affected today.

### Suspected bug: the anchor click handler in the intermediate state

The handler in [`anchor_scroll.client.ts`](core/anchor_scroll.client.ts) catches any
`a[href^='#']` whose target exists, then `preventDefault()`, `revealTarget(target)`,
`scrollIntoView()`, `history.replaceState(null, "", href)`.

On a reader page in the intermediate state, clicking `#reader-toc-btn`
(`<a href="#reader-toc-drawer">`):

1. `preventDefault()` cancels the fragment navigation the No-JS drawer relies on
   (`.reader-toc-drawer:target` in `reader_toc.css`).
2. `revealTarget` finds no revealer: `ReaderTocController` has not connected yet.
3. `replaceState` changes the URL. As far as we know, `pushState`/`replaceState` do **not**
   update `:target`, so the drawer stays closed.

Result, if confirmed: the control does nothing until `reader.js` arrives. The same would apply
to the companion-panel tabs (`#panel-view-*`) and any other `:target`-driven No-JS UI inside a
route component.

**Why tests do not catch it:**
[`browser_v2_late_hydration.test.ts`](../../integration/suites/browser_v2_late_hydration.test.ts)
holds back every `/v2/assets/*.js` with one gate and releases them together, so it never produces
the intermediate state.

## 4. The stopgap in place

[`revealHashTarget`](core/reveal.client.ts) looks for the nearest ancestor of the target that is
a custom element tag without a definition yet (`findUndefinedCustomHost`). If there is one, it
waits for `customElements.whenDefined(tag)` and retries. `whenDefined` resolves after the element
is defined, and defining it upgrades and connects the existing instances, so its revealers are
registered by then.

Limits:

- It fixes one symptom in one function. It does not cover the click handler, or anything else in
  §3 that has not been audited.
- It guesses that any undefined hyphenated tag will be defined soon. If a page ever renders a
  custom tag whose chunk that page does not load, deep links under it wait forever, silently.
  [`route_bundle_conformance.test.ts`](core/route_bundle_conformance.test.ts) currently makes
  that impossible for full pages and partial templates, which is the only reason the stopgap is
  safe.

### Rejected first attempt (do not redo)

`registerRevealer` itself checked `location.hash` and triggered the reveal on registration,
queued in a microtask, together with `AnchoredPopoverController.onConnect` re-syncing an
already-open popover. Rejected because:

- It gave a passive registry navigation side effects on every registration.
- `BaseElement`/`BaseController` run the host's `onConnect()` **before** child controllers
  connect. `ReaderTocController` registers its revealer in `onConnect`, so a synchronous reveal
  called `open()` on a popover whose scope was still `DEAD_SCOPE`: dismissal and focus-trap
  listeners were silently dropped. The microtask and the popover re-sync patched that ordering
  instead of avoiding it.

Lesson: never open or reveal from inside a connect path. Act only once the owning element has
fully connected.

## 5. Options for a general fix

The goal is a stated, enforced invariant, for example: **page-level startup runs only after
every chunk on the page has executed, and nothing in an earlier chunk overrides native behaviour
for a component that has not upgraded.**

| Option                                                              | Idea                                                                                                                                                                                                                                           | Pros                                                                                                                                                                                                                                                 | Cons / costs                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. `DOMContentLoaded` as "page ready"**                           | Run global setups from `onPageReady(fn)`, i.e. a `DOMContentLoaded` listener (fire immediately if it has already fired). By spec, `DOMContentLoaded` fires after **all** deferred and non-async module scripts have run, so after every chunk. | One mechanism covers shapes (a) and (b) for every global setup, and brings back the pre-split ordering. Before page-ready, links behave natively. Small change.                                                                                      | **Couples our startup to every deferred script on the page.** Any future `defer`/module script (analytics, a third party, another chunk) delays anchor scroll, back-to-top, the mobile menu and deferred iframes. A slow chunk delays them all. Async scripts are not waited on, which is easy to get wrong.                                                                                                                                    |
| **B. Explicit boot from the leaf entry**                            | Global setups become pure exports; the last chunk on each page calls `bootV2()` once. A conformance test checks every route's leaf (`V2_ROUTE_LEAF`) boots exactly once, and that no `*.client.ts` has import-time side effects.               | Ordering is explicit and limited to **our** chunks, so unrelated deferred scripts cost nothing. Also closes the CODE_HEALTH item "Stop client modules installing global listeners at import time" (tests could import modules without side effects). | "Last chunk" is not the same as "an entry": `common_entry` runs first on every page, so boot cannot live there (`about`, whose leaf is `common`, needs its own leaf or a boot step emitted by the page shell). `reader_entry` also runs before `external.js` on external pages, so booting there is too early. Likely needs the page shell to emit the boot call after the last script (e.g. a final inline module), or a leaf entry per route. |
| **C. Per-feature `whenDefined`** (the current stopgap, generalised) | Each global feature waits for the specific owners it needs.                                                                                                                                                                                    | No global ordering, and no extra cost from other scripts.                                                                                                                                                                                            | Easy to forget. Spreads the problem everywhere. Relies on the "undefined tag will be defined" guess.                                                                                                                                                                                                                                                                                                                                            |
| **D. Owner-aware global handlers**                                  | Global handlers check the target's owner, using the existing JS-gate idea: the nearest custom element must be `data-upgraded` (or defined). If not, they do nothing and let native `:target` work.                                             | Fits the existing `data-upgraded` owner model. Fixes shape (b) without waiting on anything.                                                                                                                                                          | Only covers handlers. Startup reads (a) still need A, B or C. Each handler has to remember the check (a helper plus a lint rule could help).                                                                                                                                                                                                                                                                                                    |

A plausible combination is **B or A for startup ordering, plus D for handlers**, but this needs
measurement and a decision, not a default. Questions to settle:

1. Is the §3 click bug real? Reproduce it first.
2. How long does the intermediate state actually last (throttled, cold cache, mobile)? That
   decides how much (b) matters in practice.
3. Is the extra `DOMContentLoaded` delay in A acceptable, and do we expect other deferred
   scripts on V2 pages?
4. With B, where does `bootV2()` go for routes whose leaf is shared or is `common`?

## 6. Test gaps to close first

- **Staged release in the late-hydration harness:** release `common.js` while holding the route
  chunk, interact, then release the rest. Module scripts execute in order, so this reproduces the
  intermediate state exactly. Cover at least: TOC link (PH5), dictionary tab (PH7), a
  `#hash` deep link, and a `hashchange` in the intermediate state.
- **The same inside the reader's dictionary iframe** (`common.js` → `dict.js`).
- **A conformance guard** for whichever invariant is chosen (e.g. no import-time `setupX()` in
  `*.client.ts`, or every leaf entry calls boot once).
