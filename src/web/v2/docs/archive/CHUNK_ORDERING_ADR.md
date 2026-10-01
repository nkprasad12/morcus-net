# UI V2 Chunk Ordering: startup code that runs before the route's components

> **Archived.** Kept for context only; do not treat it as current guidance or a to-do list.
> Living rules: [README: The activation gate](../../README.md#the-activation-gate) and the [PH bug index](../TESTING.md#pre-hydration-ph-bug-index).
> Commit SHAs, phase numbers, and relative links in this file refer to `lit-prototype` history and may not resolve.

Findings from landing route code splitting (commit `feat(v2): split the client bundle into
per-route chunks`). The split added an intermediate page state that nothing in `common.js` was
written for. This file records what we know, what is still a hypothesis, and the options, so the
follow-up starts from here rather than from the stopgap.

> [!IMPORTANT]
> Status: **resolved (A + D, §8).** Global setups run from `onPageReady` (`DOMContentLoaded`,
> after every chunk) and the anchor click handler leaves links native while the target's owner
> hasn't upgraded. The `whenDefined` stopgap is gone. Enforced by
> [`boot_conformance.test.ts`](core/boot_conformance.test.ts), `page_shell.test.ts` and the staged
> late-hydration cases. §1–§7 are kept as the record of how we got here.
> Related: [PRE_HYDRATION.md](PRE_HYDRATION.md).

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

| Setup                                                                                          | Shape | Status                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setupAnchorScroll` initial `revealHashTarget` ([anchor_scroll](core/anchor_scroll.client.ts)) | (a)   | **Confirmed.** Caused late-hydration PH5 (TOC) and PH7 (dict sheet) failures. Stopgap in place (§4).                                                                                                                                                                             |
| `setupAnchorScroll` document `click` handler                                                   | (b)   | **Confirmed** in Chromium and Firefox (§7.1). The click is lost, not just delayed.                                                                                                                                                                                               |
| `setupAnchorScroll` `hashchange` / `beforematch`                                               | (a)   | `hashchange` calls the same `revealHashTarget`, so the stopgap covers it (staged test passes). `beforematch` calls `revealTarget` directly and is not covered, but it is harmless: the browser removes `hidden="until-found"` itself, and `revealTarget` only opens `<details>`. |
| `setupBackToTop` ([back_to_top](core/back_to_top.client.ts))                                   | -     | Safe: only touches shell markup (`.back-to-top`).                                                                                                                                                                                                                                |
| `setupMobileMenu` ([mobile_menu](shell/mobile_menu.client.ts))                                 | -     | Safe: only touches shell markup.                                                                                                                                                                                                                                                 |
| `setupDeferredIframes` ([deferred_iframe](core/deferred_iframe.client.ts))                     | -     | Safe: plain DOM (`<details>` + `iframe[data-deferred-src]`). Its `DOMContentLoaded` branch is dead code: module scripts run at `readyState === "interactive"`, never `"loading"`.                                                                                                |
| `morcus-theme-toggle` ([theme_toggle](shell/theme_toggle.client.ts))                           | -     | Safe (audited): reads only `<html data-theme>`, `settingsStore` and `matchMedia`; dispatches nothing. Its iframe theme sync (on click only) sets `data-theme` on each same-origin frame's `<html>`, which no chunk state depends on.                                             |
| `morcus-report-dialog` ([report_dialog](dialog/report_dialog.client.ts))                       | -     | Safe (audited): self-contained (`scope.$` inside its own host); dispatches nothing on connect.                                                                                                                                                                                   |
| `core/index.client.ts` re-exports                                                              | -     | Safe (audited): no module-level statements other than declarations (`WeakMap`/`Set` registries, stores as plain objects). Listeners (`syncQueryParam` popstate, focus trap, dismissable) are installed only when called.                                                         |

Audit method: every top-level statement in `core/`, `shell/` and `dialog/` `*.client.ts`, plus
every `addEventListener` / `dispatchEvent` / `emit` in `src/web/v2`. The only component events
(`suggestion-select`, `dict-selection-change`, `dict-inflected-change`,
`morcus:popover-will-open`) are dispatched on user interaction, never on connect, and all live in
the same chunk as their listeners.

`abbr_popover` also runs a global setup at import time, but lives in `dict.js` (a leaf chunk), so
it is not affected today.

### The anchor click handler in the intermediate state (confirmed)

The handler in [`anchor_scroll.client.ts`](core/anchor_scroll.client.ts) catches any
`a[href^='#']` whose target exists, then `preventDefault()`, `revealTarget(target)`,
`scrollIntoView()`, `history.replaceState(null, "", href)`.

On a reader page in the intermediate state, clicking `#reader-toc-btn`
(`<a href="#reader-toc-drawer">`):

1. `preventDefault()` cancels the fragment navigation the No-JS drawer relies on
   (`.reader-toc-drawer:target` in `reader_toc.css`).
2. `revealTarget` finds no revealer: `ReaderTocController` has not connected yet.
3. `replaceState` changes the URL but does **not** update `:target` (verified in both engines:
   `document.querySelector(":target")` stays `null`), so the drawer stays closed.
4. `replaceState` fires no `hashchange`, and the click path does not go through the
   `whenDefined` stopgap, so nothing retries when `reader.js` arrives. After upgrade the drawer is
   still closed and a stale `#reader-toc-drawer` is left in the URL.

The same happens to the mobile companion-panel tabs (`#panel-view-*`, PH7). Any other
`:target`-driven No-JS UI inside a route component is exposed the same way.

## 4. The stopgap (removed)

> [!NOTE]
> Removed with the A + D fix: at `DOMContentLoaded` every custom element on the page is defined,
> so there is nothing to wait for. Kept for the record.

[`revealHashTarget`](core/reveal.client.ts) looked for the nearest ancestor of the target that
was a custom element tag without a definition yet (`findUndefinedCustomHost`). If there was one,
it waited for `customElements.whenDefined(tag)` and retried. `whenDefined` resolves after the
element is defined, and defining it upgrades and connects the existing instances, so its
revealers were registered by then.

Limits:

- It fixed one symptom in one function. It did not cover the click handler (§3).
- It guessed that any undefined hyphenated tag would be defined soon. If a page ever rendered a
  custom tag whose chunk that page did not load, deep links under it would wait forever,
  silently. [`route_bundle_conformance.test.ts`](core/route_bundle_conformance.test.ts) made
  that impossible for full pages and partial templates, which was the only reason the stopgap
  was safe.

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
measurement and a decision, not a default. Questions to settle (answered in §7 and §8):

1. Is the §3 click bug real? **Yes** (§7.1).
2. How long does the intermediate state actually last (throttled, cold cache, mobile)? **About
   0 ms on a cold cache; one round trip plus the route chunk's transfer once `common.js` is
   cached** (§7.2).
3. Is the extra `DOMContentLoaded` delay in A acceptable, and do we expect other deferred
   scripts on V2 pages? **Yes, and no:** today A waits exactly as long as B would, and V2 will
   carry no analytics or third-party scripts (§8).
4. With B, where does `bootV2()` go for routes whose leaf is shared or is `common`? Moot: B was
   not chosen (§8).

## 6. Test gaps

- [x] **Staged release in the late-hydration harness** (`openStaged` in
      [`browser_v2_late_hydration.test.ts`](../../integration/suites/browser_v2_late_hydration.test.ts),
      describe block "UI V2 chunk ordering: intermediate state"): TOC link (PH5), dictionary tab (PH7),
      a `#hash` deep link, a `hashchange`, and in-page links on the dictionary page.
- [x] **The same inside the reader's dictionary iframe** (`common.js` → `dict.js`).
- [x] **A conformance guard**: [`boot_conformance.test.ts`](core/boot_conformance.test.ts) and
      the non-`async` script check in [`page_shell.test.ts`](shell/page_shell.test.ts) (§8).

## 7. Findings (Phase 1 and 2)

### 7.1 Reproduction

Staged runs (`common.js` released, route chunk held) on chromium, firefox, MobileChrome and
FirefoxSmallScreen:

| Case                                              | Result                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| TOC link (PH5), clicked in the intermediate state | **Fails, all 4 projects.** `:target` stays `null`; drawer closed before and after upgrade. |
| Mobile dictionary tab (PH7), same                 | **Fails** (MobileChrome, FirefoxSmallScreen; desktop skips). Same mechanism.               |
| `#reader-toc-drawer` deep link on initial load    | Passes: the stopgap waits, the reader adopts at upgrade and clears the hash.               |
| `hashchange` in the intermediate state            | Passes: real fragment navigation sets `:target`; the stopgap adopts at upgrade.            |
| Jump pill on `/v2/dicts?q=habeo`                  | Passes: dictionary targets need no revealer (`revealTarget` opens `<details>` itself).     |
| Jump pill inside the reader's dictionary iframe   | Passes (desktop; the iframe is collapsed on mobile).                                       |

Side finding, not caused by the split: for a deep link, **Chromium does not apply `:target`
until `load`** (after every chunk has run); Firefox applies it at once. So in Chromium a
`#reader-toc-drawer` deep link shows nothing before upgrade in any case. The deep-link test only
checks the No-JS drawer where the browser has applied `:target`.

### 7.2 How long the intermediate state lasts

Measured with Playwright + CDP throttling against the dev server (gzip), median of 3, from
`common.js`'s last `customElements.define` to the route chunk's first. "common cached" = visit
`/v2/about` (loads only `common.js`) first, i.e. the first visit to a second route.

| Profile                  | Network                    | Cold cache | `common.js` cached (dicts / reader / library / corpus / external) |
| ------------------------ | -------------------------- | ---------- | ----------------------------------------------------------------- |
| Desktop                  | none                       | 1–2 ms     | 1–7 ms                                                            |
| Desktop                  | 4G (165 ms, 9 Mb/s)        | 1–2 ms     | 175 / 157 / 162 / 133 / 172 ms                                    |
| Desktop                  | slow 4G (563 ms, 1.4 Mb/s) | 1–2 ms     | 605 / 639 / 636 / 569 / 668 ms                                    |
| Desktop                  | 3G (2 s, 0.4 Mb/s)         | 1–2 ms     | 2207 / 2356 / 2315 / 2148 / 2442 ms                               |
| Mobile (Pixel 5, 4x CPU) | 4G                         | 5–10 ms    | 149 / 42 / 61 / 73 / 133 ms                                       |
| Mobile (Pixel 5, 4x CPU) | slow 4G                    | 5–12 ms    | 596 / 634 / 629 / 595 / 614 ms                                    |
| Mobile (Pixel 5, 4x CPU) | 3G                         | 5–10 ms    | 2184 / 2351 / 2290 / 2119 / 2420 ms                               |

- **Cold cache: effectively zero.** Both chunks download in parallel and every route chunk is
  smaller than `common.js` (52 KB raw), so it is already there when `common.js` finishes. This
  depends on sizes: `reader.js` is 46 KB raw, so if it outgrows `common.js` the cold case opens
  up too.
- **`common.js` cached, route chunk not: one round trip plus transfer**, on every route. This is
  the first visit to each route after any other V2 page, and every route after a deploy that
  changes only a route chunk. 150 ms on 4G, 0.6 s on slow 4G, 2.1–2.4 s on 3G. A user who lands
  on the dictionary and then opens a reader page and taps the TOC within that window loses the
  tap.
- `DOMContentLoaded` minus `common.js` matches the intermediate state on every route except
  `/v2/dicts`, where it is about 180 ms higher on desktop (about 900 ms on 4x-throttled mobile)
  even without throttling. That is `dict.js` itself: executing it upgrades every component on a
  238 KB results page. Option A and B wait for this equally. It is a separate performance lead
  (not investigated here).

Method: fresh browser context per run (cold HTTP cache); `customElements.define` patched in an
init script to timestamp each tag; CDP `Network.emulateNetworkConditions` and
`Emulation.setCPUThrottlingRate`. Absolute numbers are from the local dev server; the shape (cold
≈ 0, cached-common ≈ RTT + transfer) is what matters.

## 8. Decision: A + D

The first recommendation was B (explicit boot keyed by a leaf name from the page shell). It was
revisited once it was settled that V2 will carry **no analytics or third-party scripts**, which
removed A's main cost. What was left:

| Concern with A                                                                                     | Resolution                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DOMContentLoaded` fires even when a chunk fails to load or throws, so setups run over dead owners | **D**: the anchor click handler only takes over when every enclosing custom element carries `data-upgraded` (`ownersUpgraded` in [`js_gate.client.ts`](core/js_gate.client.ts)). A failed or missing owner keeps native `:target` behaviour. |
| `DOMContentLoaded` does not wait for `async` scripts                                               | [`page_shell.test.ts`](shell/page_shell.test.ts) fails if any V2 script tag is not a plain `type="module"` (no `async`/`defer`).                                                                                                             |
| Every static script tag delays startup                                                             | Only our own chunks exist. A heavy optional feature should be a lazy `import()`, which does not delay `DOMContentLoaded`; components it defines later are covered by D.                                                                      |
| Lazy `import()` chunks are not waited for (true of B too)                                          | D, again: it works per owner, not per chunk.                                                                                                                                                                                                 |

Measured delay is the same as B's would be: `DOMContentLoaded` fires right after the last chunk
runs (§7.2). A + D has fewer moving parts than B (no shell attribute, no per-entry
`chunkExecuted`, no leaf naming) and uses the browser's own ordering.

### What landed

- [`core/page_ready.client.ts`](core/page_ready.client.ts): `onPageReady(setup)` runs `setup` on
  `DOMContentLoaded`, or at once if it has already fired. Module scripts run while `readyState`
  is already `"interactive"` but before the event, so "already fired" comes from Navigation Timing
  (`domContentLoadedEventStart`), not `readyState`.
- `common_entry.client.ts` starts anchor scroll, back-to-top, the mobile menu and deferred iframes
  from `onPageReady`; `dict_entry.client.ts` starts the abbreviation popover. The five
  `if (typeof document !== "undefined") setupX()` tails are gone, so feature modules are pure.
- `anchor_scroll.client.ts`: the click handler checks `ownersUpgraded(target)` before
  `preventDefault()` (D).
- `reveal.client.ts`: the `whenDefined` stopgap is removed (§4).

### Guardrails

- [`boot_conformance.test.ts`](core/boot_conformance.test.ts) (TypeScript AST): no `*.client.ts`
  has top-level side effects other than `registerElement(...)` (the inline head script
  `critical_theme.client.ts` is the one named exception); only `*_entry.client.ts` files call
  `onPageReady`; every exported `createSingletonSetup` setup is started from an `onPageReady`
  callback in some entry.
- [`page_shell.test.ts`](shell/page_shell.test.ts): every external script is a non-`async`
  module script.
- `anchor_scroll.test.ts` / `js_gate.test.ts`: the owner check, including nested and failed owners.
- `browser_v2_late_hydration.test.ts`, "UI V2 chunk ordering: intermediate state": the PH5 and PH7
  clicks, deep link, `hashchange`, and dictionary (page and reader iframe) links, staged; and a
  route chunk that fails to load (the TOC link still opens the drawer natively).
- The activation gate ("The activation gate" in [README.md](README.md)): `LifetimeScope.listen()`
  applies D to every `click`, `submit` and activating `keydown` listener, not just
  `anchor_scroll`'s. `activation_gate.test.ts` covers the gate itself;
  the SSR conformance harness (`testing/ssr_conformance_harness.ts`) section 4 fails each component in the SSR fixtures in turn and checks
  that nothing cancels an activation in it or pointing into it.

### When is D's check actually false?

After A, the click handler installs only once every chunk has run, so D is not about timing any
more. It matters when an owner never upgrades:

1. **Its route chunk failed to load** (flaky mobile network, deploy skew where stale HTML names
   a hashed asset that is gone). `DOMContentLoaded` still fires; the tag is never defined. This is
   the realistic case, and not a bug in our code.
2. **Its `onConnect` threw** (`data-js-failed`).
3. **Its definition arrives later** (a lazy `import()`; none today).

In each, the owner shows its No-JS fallback, and D keeps that fallback working.

### Prior art

Other progressively enhanced approaches avoid the problem structurally rather than with a lint
rule:

- **Components own all behaviour** (GitHub Catalyst, Stimulus, Lit, 11ty `<is-land>`, Astro
  islands): nothing global acts for a component, so pre-upgrade events fall through to the
  browser. This is our `BaseElement` model; `anchor_scroll` is the exception because a link and
  its target can sit in different owners, or none.
- **One global interceptor with declared opt-outs** (Turbo Drive): a single document click
  handler that defers to `defaultPrevented` (and makes sure it runs last), modifier keys,
  `target`/`download`, a `data-turbo="false"` ancestor, and a cancelable `turbo:click`. D is the
  same idea, with the veto inferred from un-upgraded owners.
- **Capture and replay** (jsaction/Wiz, Angular event replay, Qwik, React selective hydration):
  an early loader queues events and replays them to owners declared in markup. It has to cancel
  native actions, which conflicts with a No-JS baseline, so it is not a fit.

We have no central dispatcher (`bindDismissable`, `popover` and window-level shortcuts each
listen on their own), so the gate lives in the one API they all listen through,
`LifetimeScope.listen()`.

### Rules for new code

- A global setup is a pure `export const setupX = createSingletonSetup(...)`, started from
  `onPageReady` in its chunk's entry. Never at import time.
- Listen through a `LifetimeScope` (`this.scope.listen`, or a standalone scope in a global
  setup), never raw `addEventListener`, so the activation gate applies D for you.
- Don't mark V2 chunk tags `async`. Load heavy optional features with `import()`.
- Jump pills scroll instantly, not smoothly: they are for quick navigation, and across many long
  dictionary entries a smooth scroll takes (or feels like it takes) seconds. Keep it that way if
  the anchor scroll mechanism changes.
- Not pursued (for the record): replacing `replaceState` with `location.replace(href)` in the
  click handler would make it a real fragment navigation (so `:target` updates, no history entry)
  and remove the need for D, but it hands scrolling to the browser for every in-page link and
  runs revealers twice (click and `hashchange`), and revealers are not yet verified idempotent.
