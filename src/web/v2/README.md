# UI V2 (Progressive Enhancement Architecture)

## Overview

The UI V2 prototype explores a server-rendered Multi-Page Application (MPA) model as an alternative to the existing Single-Page Application (SPA) + JSON-RPC architecture.

### Core Principles

1. **Zero-JS Baseline**: All primary user flows (dictionary lookup, inflected search, site navigation, and readability) function 100% without client-side JavaScript using standard HTML semantics (`<form method="GET">`, native `<details>`/`<summary>`, and semantic `<a>` links).
2. **Light DOM Custom Elements (Zero Framework Overhead)**: Web Components extend native `HTMLElement` to wrap server-rendered markup without shadow root barriers or form association issues, keeping client bundle size minimal.
3. **Safe DOM Manipulation**: Components use safe DOM APIs (`textContent`, `replaceChildren`) and typed HTML sinks (`setHtml`, `replaceWithHtml` in `core/dom.client.ts`) accepting branded `SafeHtml` produced by `core/html.common.ts`, backed by `eslint-plugin-no-unsanitized` for automated XSS prevention.
4. **Coexistence**: Mounted under `/v2/*`, leaving the existing React/Preact SPA, RPC endpoints, and build pipelines completely unaffected.

---

## Architecture & Layout Philosophy

UI V2 is structured by **topic (domain vertical slices)** rather than technical file types:

```
src/web/v2/
├── core/               # Shared primitives: BaseElement, LifetimeScope, html, partial swap, drawer, popover, components.css
├── shell/              # Document skeleton, app bar, theme & global design tokens
├── dict/               # Dictionary search, entry rendering, inflections & settings
├── reader/             # Parallel two-column reader
├── library/            # Work catalog & filtering
├── external/           # External Latin text loader & reader
├── corpus/             # Corpus search & concordances
├── dialog/             # Accessible modal dialogs & issue reporting
├── about/              # Project information & metadata
├── v2_router.server.ts # Express router orchestrator mounted at /v2 (public integration)
├── v2_elements.client.ts # Test-only aggregator of all 5 route entry manifests (*_entry.client.ts)
├── v2.css              # Global stylesheet manifest (imports topic *.css)
└── v2-critical.css     # Inlined above-the-fold critical CSS
```

> [!NOTE]
>
> - Known code-quality debt is tracked as an incremental, checklist-driven backlog in
>   [CODE_HEALTH.md](CODE_HEALTH.md). Each item is scoped to be one small, independently landable
>   change. Add new debt there rather than leaving `TODO` comments, and check items off as they land.
> - Bugs and race conditions in the **pre-hydration window** (where a JS-enabled user views or
>   interacts with SSR markup before the route's JS chunks execute) are documented and tracked in
>   [PRE_HYDRATION.md](PRE_HYDRATION.md).
> - The longer-term strategy and checklist for graduating V2 to production (`dev` merge audit,
>   routing cutover, telemetry parity, V1 removal, and re-tuning pre-built artifacts) lives in
>   [GRADUATION.md](GRADUATION.md).

### Core Design Rules

1. **Colocated Vertical Slices**: Each topic folder contains everything required for that domain: SSR HTML templates, Light DOM Web Components, stylesheets, and unit tests. Deleting or refactoring a feature is isolated to its topic folder.
2. **Target Suffix Convention**: every module carries a tier, and the boundaries between them are enforced by `no-restricted-imports` rules in [eslint.config.mjs](../../../eslint.config.mjs) rather than by review.
   - `*.server.ts`: Executes in Node.js (Express SSR renderers, XML parsers, server-side utilities). **Never** bundled to browser assets; **no** browser DOM globals (`window`, `document`, `HTMLElement`). May not import `*.client.ts`.
   - `*.client.ts`: Executes in the Browser (Light DOM Web Components, client event delegation). Bundled via Rsbuild into 5 route-aligned chunks in `build/v2/` (`common.js`, `dict.js`, `reader.js`, `external.js`, `corpus.js`). May not import `*.server.ts`, Node builtins, `express`, or `he`.
   - `*.common.ts`: Isomorphic **logic and rendering**. Safe in both tiers, and subject to both restrictions above. See [The `.common.ts` contract](#the-commonts-contract) below.
   - `*.test.ts`: Colocated unit tests targeting adjacent modules. Deliberately exempt, since a test legitimately exercises both sides of a boundary.
   - `*.css`: Feature-scoped styles imported by the root `v2.css`.
3. **Flat Topic Directories**: Topics remain flat by default (avoiding micro-directories for 1–2 files). Filename prefixes (e.g. `dict_search.*`, `dict_settings.*`) keep related files automatically clustered alphabetically. Subdirectories are introduced only when a subcomponent exceeds 4+ dedicated files.
4. **Root Integration Hubs & Entry Chunks**: Top-level entry points (`v2_router.server.ts`, `v2.css`) and slice entry manifests (`shell/common_entry.client.ts`, `dict/dict_entry.client.ts`, `reader/reader_entry.client.ts`, `external/external_entry.client.ts`, `corpus/corpus_entry.client.ts`) aggregate exports across topics. They carry target suffixes like any other module — being an entry point is not an exemption.

---

## Conventions for All New Code

Follow these rules whenever adding or modifying UI V2 features:

1. **Forms first.** Every feature must work end-to-end as a plain HTTP `GET` or `POST` round-trip before any client JavaScript is added, then progressively enhance via `this.hijackForm()` and `this.syncQueryParam()`.
   - **Macronizer**: a `POST` form with a server-rendered result.
   - **Corpus**: a `GET` form with its query and settings (`pageSize`, `contextLen`, `strictMode`) in the URL.
2. **Don't move server-rendered nodes.** The server owns DOM structure; the client owns state (attributes, classes, listeners). If the JS-enhanced layout needs a different structure, render it in its final place on the server and hide it when JS is inactive. Reparenting SSR nodes in `onConnect()` reloads iframes, drops listeners, and requires fragile `onDisconnect()` restoration.
3. **Read before writing in `onConnect()` ([PRE_HYDRATION.md §2](PRE_HYDRATION.md#2-root-cause-four-disjoint-definitions-of-is-js-active)).** On a slow connection, the user may have already scrolled (`window.scrollY > 0`), typed into an `<input>`, toggled a `<details>` or checkbox, or triggered a `:target` hash navigation before `v2.js` runs. Reconcile with and adopt live DOM/URL state before writing defaults, and guard initial `focus()` / scroll calls when `window.scrollY > 0`. Compare against the server-rendered defaults (`defaultChecked`, `defaultValue`, the SSR `open` attribute) to tell user edits from server state. Gate JS-dependent UI only with the JS gate below.
4. **Extend `core/`; don't fork it.** Shared behaviours (`BaseElement`, `BaseController`, `this.scope`, `fetchAndSwapPartial`, `AnchoredPopoverController`, `DrawerController`, `back_to_top.client.ts`) and shared styles (`core/components.css` for focus rings, buttons, pills, and card headers) live in `core/`. If a slice needs a variation (e.g., a custom scroll container), parameterize the primitive in `core/` instead of copying it into the slice.
5. **New server templates use `html`, composed with `raw` / `joinHtml`.** Use `html` from `core/html.common.ts` in new `.server.ts` templates as well as `.common.ts` and `.client.ts` (do not add new `he.escape` calls). **Never interpolate a `SafeHtml` directly into another `html` template (`${childSafeHtml}`):** the brand is erased at runtime, so `html` escapes it a second time into literal text. Always compose sub-templates with `joinHtml(parts)` or `raw(childSafeHtml)`.
6. **Keep new feature code inside its slice.** Keep slice-specific controllers, helpers, and state self-contained inside their topic folder (`dict/`, `reader/`, `external/`, `corpus/`, etc.) without cross-slice entanglement so heavy slices can be split into lazy `import()` chunks ([CODE_HEALTH.md](CODE_HEALTH.md)).
7. **Verify audit findings before acting on them.**
   - Require concrete evidence (file, line, and exact mechanism) and verify each claim against the code before changing anything.
   - Check consequences across slices—especially keyboard focus preservation across swaps, custom element disconnect/reconnect lifecycles, and the zero-JS baseline.
   - Fix one-off issues locally; introduce a new shared primitive or conformance check only when a bug class recurs, weighting real shipped bugs over theoretical audit items.
8. **Don't preserve backwards compatibility within V2.** V2 has no users yet. Change storage keys and formats, cookies, URLs, attributes, CSS hooks, and internal APIs freely: no migration code, legacy reads, fallback paths, deprecation shims, or "one-load flash" trade-offs. Rename or delete outright and update every caller in the same change. This does not cover the browser support target below, or the V1 → V2 cutover, which is decided separately ([dict/PREFERENCES.md](dict/PREFERENCES.md)).

### Quick Reference (`core/` Primitives)

| For                                               | Use                                                                                                                                                      | Not                                                                                    |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Listeners, timers, animation frames, cancellation | `this.scope`: `listen`, `delegate`, `timeout`, `rAF`, `debounce`, `latest(lane)`                                                                         | Raw `addEventListener` / `setTimeout` in components                                    |
| Updating regions from the server                  | `swapSlots` for several regions (`core/partial.client.ts` + `core/slots.common.ts`, with a `testing/slot_parity.ts` test); `fetchAndSwapPartial` for one | Scraping swapped markup to patch other regions                                         |
| UI that needs JS, or only makes sense without it  | `data-js-only` / `data-nojs-only` (see [JS-only and No-JS-only UI](#js-only-and-no-js-only-ui))                                                          | `<noscript>`, `.has-js`, `:defined`, per-slice `*-js-only` classes                     |
| A different layout when JS runs                   | Render it in place on the server; hide it without JS                                                                                                     | Moving server-rendered nodes on the client                                             |
| Opening hidden UI for a `#hash` / link target     | `registerRevealer` (`core/reveal.client.ts`, see [Hash targets](#hash-targets-and-the-reveal-protocol))                                                  | Reading `location.hash` in `onConnect`; `:target` rules that still match after upgrade |
| Back-to-top                                       | `core/back_to_top.client.ts`                                                                                                                             | A slice-local copy                                                                     |
| Focus ring, buttons, pills, card headers          | `core/components.css`                                                                                                                                    | Redeclaring `outline: 2px solid var(--primary)` per slice                              |
| Building HTML (server, common, client)            | `html`, composed with `raw` / `joinHtml` (`core/html.common.ts`)                                                                                         | `${safeHtml}` inside `html` (re-escaped); `he.escape` in new code                      |
| Form-driven UI                                    | A working `<form>` first, then `this.hijackForm` / `this.syncQueryParam`                                                                                 | Controls that only work with JS                                                        |
| Cross-slice inventory ratchet                     | Extend `core/` or reuse a primitive on a regression; run `npm run inventory:update` in the same change for a stale entry                                 | Raising `inventory_ratchet.json` for a regression                                      |

### JS-only and No-JS-only UI

**Before upgrade, a page looks like the JS page but behaves like the No-JS page.** The upgrade then adopts whatever the user did in the meantime (adopt-before-write, PRE_HYDRATION.md). There is exactly one way to show or hide UI depending on whether JavaScript is running:

- **`data-js-only`** on anything that only works with JS (a `type="button"` control, a client-populated list).
- **`data-nojs-only`** on a No-JS fallback (an Apply submit button, "needs JavaScript" notes).
- **The owner** is the nearest element carrying `data-upgraded`. `BaseElement` sets it on every custom element after `onConnect()` returns (and removes it on disconnect), so inside a component there is nothing to do. A global script that wires up one specific element outside any component calls `markUpgraded(el)` from `core/js_gate.client.ts`.

Two separate facts decide two separate things:

| Question                  | Decided by                                    | Known              | Effect                                                                                                                                                                 |
| :------------------------ | :-------------------------------------------- | :----------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What is painted?**      | `@media (scripting: enabled / none)`          | Before first paint | With scripting on, `data-nojs-only` is never painted, so fallbacks can't flash. With it off, `data-js-only` is never painted.                                          |
| **What works, and when?** | `data-upgraded` on the owner                  | At upgrade         | Until then, `data-js-only` keeps its box but is `visibility: hidden` (invisible, unfocusable, hidden from assistive tech), so nothing shifts when it appears.          |
| **What if JS broke?**     | `data-js-failed` on the owner, or on `<html>` | On failure         | JS-only UI in that subtree is dropped and its fallbacks are painted again. Set by `BaseElement` when `onConnect()` throws, and on `<html>` when `v2.js` fails to load. |

**Styling that differs by mode** follows the same split. Ask whether a rule changes what the element **does** or only how it **looks**:

- Looks only: `@media (scripting: none)` / `@media (scripting: enabled)` (plus `[data-js-failed] .x` if the failed state should match No-JS).
- Behaviour or hand-over (a `:target` rule the component takes over, a native fallback it replaces): `[data-upgraded] .x` for enhanced, `.x:not([data-upgraded] *)` for No-JS / pre-upgrade.

The rule block lives in [`v2-critical.css`](v2-critical.css), so it's correct from first paint. Content under a not-yet-registered custom element also stays gated, so lazily loaded chunks work without changes. Browsers in `V2_BROWSERSLIST` without `(scripting)` (Chrome 111–119, Safari 16.4–16.x) fall back to hiding fallbacks at upgrade.

There is no global "JS is on" flag. [`core/gate_conformance.test.ts`](core/gate_conformance.test.ts) fails on `<noscript>`, `.has-js`, `:defined` and `.js-only` classes, and ratchets the number of `[data-upgraded]` rules per CSS file. **Exceptions and ratchet increases require human review**; do not add one to make the test pass.

### Hash targets and the reveal protocol

No-JS UI often opens via a link to a fragment (`<a href="#reader-dict">` plus a `:target` rule). Scope such `:target` rules with `:not([data-upgraded] *)` so the component takes over after upgrade, and have the component adopt the state instead of reading `location.hash` itself:

- In `onConnect()`, `this.scope.use(registerRevealer(el, reveal, { ownsHash }))` from [`core/reveal.client.ts`](core/reveal.client.ts). `reveal(target)` must be idempotent (open, don't toggle).
- [`core/anchor_scroll.client.ts`](core/anchor_scroll.client.ts) calls `revealTarget()` for the initial hash (at page ready, via `onPageReady`, so every route chunk has registered its elements and a link clicked before the scripts arrived is adopted), on `hashchange`, on in-page anchor clicks and on `beforematch`. It opens ancestor `<details>` and calls every registered revealer from the innermost outwards, then scrolls.
- The click handler only intercepts when the target's owners are upgraded (`ownersUpgraded` in [`core/js_gate.client.ts`](core/js_gate.client.ts)). Otherwise it lets the browser navigate natively so the No-JS `:target` UI keeps working; the component adopts the hash when it upgrades.
- Global setups (`setupX` singletons) never run at import time. Entries call them from `onPageReady` ([`core/page_ready.client.ts`](core/page_ready.client.ts)); [`core/boot_conformance.test.ts`](core/boot_conformance.test.ts) enforces this. See [CHUNK_ORDERING.md](CHUNK_ORDERING.md) §8.
- `ownsHash: true` means the hash was only a No-JS state carrier (a drawer, a sheet). When the hash points exactly at such an element, it's cleared with `history.replaceState` once revealed, so closing the UI later isn't fought by a stale `:target`.

### Native takeovers

A _native takeover_ is any call that suppresses or replaces what the browser would do: `preventDefault()`, `stopPropagation()`, `stopImmediatePropagation()`, `history.pushState()` / `replaceState()` (the URL changes without a navigation, so `:target` and `hashchange` don't follow), and `history.scrollRestoration`. Taking over on behalf of an owner that isn't running breaks that owner's No-JS fallback too. That was the chunk-ordering bug ([CHUNK_ORDERING.md](CHUNK_ORDERING.md) §8).

The `morcus/native-takeover` ESLint rule ([`tools/native_takeover.cjs`](tools/native_takeover.cjs)) requires a marker on the line(s) directly above every such call in `*.client.ts`:

```ts
// native-takeover(own-subtree): Escape closes this popover
e.preventDefault();
```

| Kind            | Use when                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| `self`          | This code performs the replacement itself, or owns the state it writes (its own query parameter).       |
| `own-subtree`   | A component acting on events or DOM it owns.                                                            |
| `owner-checked` | The replacement is handed to another owner. The rule checks for an `ownersUpgraded(...)` guard (below). |

`owner-checked` calls must sit inside `if (ownersUpgraded(x)) { ... }` (or `ownersUpgraded(x) && ...`), or after `if (!ownersUpgraded(x)) return;` in the same function. The reason text is required and is what reviewers check. Adding a marker is a review decision, like a gate ratchet increase. Markers not directly above a takeover are reported as stale.

> [!IMPORTANT] > **Get the kind right.** Only `owner-checked` is verified mechanically. A `self` or `own-subtree` marker on code that actually acts for another owner passes lint and every test, then breaks that owner's No-JS fallback in production, exactly when its chunk fails to load. Never pick a kind just to make lint pass. If you aren't sure the code owns the event or DOM, ask a reviewer.

---

### The `.common.ts` contract

`.common.ts` means **isomorphic logic _and_ isomorphic rendering**. The second half is the
non-obvious one: a `.common.ts` may legitimately export HTML-rendering functions, not just pure
logic.

That is correct whenever the server and the client must emit **byte-identical markup** for the same
widget — the server paints it on initial load, and the client repaints it after an interaction that
does not reload the page. Keeping one implementation is the whole point: server and client copies of
the same template would be free to drift silently, and the bug would only appear as a flicker after
the first interaction.

The canonical example is `dict/search_bar.common.ts`, whose `renderLangChipsHtml` and
`renderInflectChipHtml` are used in strict parallel with `computeActiveLanguages` by both
`dict/search_bar.server.ts` and `dict/dict_search.client.ts`.

Two consequences worth knowing before you "clean up" such a module:

- **They return `SafeHtml`, not DOM nodes.** The client updates the DOM via typed sinks
  (`setHtml` / `replaceWithHtml` in `core/dom.client.ts`), so returning DOM nodes is not an option.
- **Attach-before-write convention.** When dynamically creating new elements in client code, attach the element to its live parent before calling `setHtml` (e.g. `parent.appendChild(el); setHtml(el, content);`). Calling `setHtml`, `replaceWithHtml`, or `swapElementContent` on a detached node trips the `assertConnected` invariant. For offline markup parsing without attaching, use `createHtmlFragment(html)` from `core/partial.client.ts`.
- **Escaping is provided by `core/html.common.ts`.** Escaping in `.common.ts` (and new `.server.ts`
  templates) uses the `html` tagged template from `core/html.common.ts` rather than `he` (~100 KB of
  poorly tree-shakeable CommonJS, banned from `.common.ts` and `.client.ts` by ESLint). `html`
  auto-escapes dynamic values and brands output as `SafeHtml`; compose nested `SafeHtml` fragments
  with `joinHtml` or `raw` so they are not double-escaped.

### Build Pipeline

- **Bundler script**: [src/bundler/v2.rsbuild.ts](src/bundler/v2.rsbuild.ts)
- **Build contract**: [src/bundler/v2_build_contract.ts](../../bundler/v2_build_contract.ts) (chunk names, `dependOn` graph, manifest asset names, build directory; shared by the bundler and the server)
- **Output chunks**: `build/v2/{common,dict,reader,external,corpus}.js` (ESM chunks built via Rspack `dependOn` and loaded via `<script type="module">` tags emitted per route by `page_shell.server.ts`)
- **Stylesheet**: `src/web/v2/v2.css` served statically at `/v2/assets/v2.css`

### Browser Support & Compatibility Target

UI V2 targets **Baseline 2023 + Extended Mobile** (`chrome >= 111`, `firefox >= 121`, `safari >= 16.4`, `ios_saf >= 16.4`, `and_chr >= 111`, `and_ff >= 121`, `samsung >= 23`, `opera >= 96`, `op_mob >= 73`), codified in [browser_targets.common.ts](browser_targets.common.ts).

On browsers meeting this standard, all client modules and modern CSS features are active. Browsers below this floor are not supported: `:has()`-dependent layout rules and client modules will not work on them, though server-rendered HTML and text remain readable.

---

## Data Flow & Progressive Enhancement

UI V2 follows a universal progressive enhancement lifecycle across all pages:

1. **Zero-JS Initial Paint**: The user issues a standard HTTP `GET` (e.g. `/v2/dicts?q=habeo` or `/v2/reader`). Express renders a complete semantic HTML document with native `<form>`, `<details>`, and `<a>` elements.
2. **Non-Blocking Enhancement**: The browser downloads the route's client chunks (`common.js` plus any route-specific slice chunks) and defines native custom elements (`customElements.define`).
3. **Client Form Hijack & Partial Swapping**: When JavaScript is active, Web Components intercept user actions, fetch partial HTML fragments (`format=partial`) or autocomplete JSON from the router, and swap DOM nodes instantaneously via `replaceChildren()` while syncing URL state with `history.pushState()`.

> **Topic-Specific Data Flows**: Detailed request lifecycle sequence diagrams and component breakdowns live in each topic's documentation (e.g., see [dict/README.md](dict/README.md)).

---

## Theme Switching Model

- **No-JS**: Media query `@media (prefers-color-scheme: dark)` adapts colors automatically based on the user's OS preference. Interactive custom elements (`morcus-theme-toggle` and `morcus-report-dialog`) carry `data-js-only`, so no dead controls are shown to users without JavaScript (or before upgrade).
- **With JS**: `<morcus-theme-toggle>` and `<morcus-report-dialog>` initialize and display buttons in the app bar. Theme selection toggles `[data-theme="dark"]` / `[data-theme="light"]` on `document.documentElement` and persists to `localStorage.getItem("GlobalSettings")`. Feedback reporting opens via native `<dialog>` modal and submits via AJAX.
- **Zero Flicker**: An inline script in `<head>` executes before the first paint to apply the saved theme attribute immediately.

---

## Rapid Iteration Workflow (Instruction for AI Agents)

> [!IMPORTANT] > **Fast Visual Feedback**: When iterating on small changes (especially styling/CSS adjustments, visual polish, or minor UI tweaks):
>
> - **Make the fix and restart the server immediately** so the user can see it visually right away.
> - **Do NOT** wait for or run linting (`eslint`), formatting (`prettier`), type checking (`tsc`), or test suites during rapid iteration.
> - Save full verification (lint, types, tests) for when the user is satisfied with the visual outcome or explicitly asks to finalize/commit.

---

## Testing & Quality Verification (Pre-Commit / Finalization)

Comprehensive instructions for running unit tests and Playwright E2E tests are detailed in [TESTING.md](TESTING.md). Run these when finalizing features or before committing:

- **Linting & Import Rules**: `npx eslint --cache src/web/v2`
- **Code Style**: `npx prettier --cache src/web/v2 --check`
- **Type Checking**: `npx tsc --noEmit` (incremental via `.cache/.tsbuildinfo`)
- **Cross-Slice Inventory & Ratchet**: `npm run inventory` (or `./morcus.sh inventory`) verifies cross-file CSS duplicate blocks, client DOM construction/mutation outside `core/`, and string-selector calls per file against [`inventory_ratchet.json`](inventory_ratchet.json) and writes `.cache/inventory/report.md` (also checked in-memory by `tools/inventory_ratchet.test.ts` during `npm run ts-tests:v2`). When a cleanup lowers a metric, update the ratchet in the same change with `npm run inventory:update` (or `./morcus.sh inventory --update`).
- **Unit Tests**: `npx jest src/web/v2`
- **E2E Tests**: `REUSE_DEV_SERVER=true PORT=1337 npx playwright test browser_v2_e2e`
