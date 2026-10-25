# UI V2 (Progressive Enhancement Architecture)

## Overview

UI V2 is Morcus.net's server-rendered Multi-Page Application (MPA) and progressive enhancement web architecture.

### Core Principles

1. **Zero-JS Baseline**: All primary user flows (dictionary lookup, inflected search, site navigation, and readability) function 100% without client-side JavaScript using standard HTML semantics (`<form method="GET">`, native `<details>`/`<summary>`, and semantic `<a>` links).
2. **Light DOM Custom Elements (Zero Framework Overhead)**: Web Components extend native `HTMLElement` to wrap server-rendered markup without shadow root barriers or form association issues, keeping client bundle size minimal.
3. **Safe DOM Manipulation**: Components use safe DOM APIs (`textContent`, `replaceChildren`) and typed HTML sinks (`setHtml`, `replaceWithHtml` in `core/dom/dom.client.ts`) accepting branded `SafeHtml` produced by `core/dom/html.common.ts`, backed by `eslint-plugin-no-unsanitized` for automated XSS prevention.
4. **Root Mounting**: Mounted directly at `/` on the Express web server.

---

## Architecture & Layout Philosophy

UI V2 is structured by **topic (domain vertical slices)** rather than technical file types:

```
src/web/ui/
├── core/                 # Shared primitives: BaseElement, LifetimeScope, html, partial swap, drawer, dialog, components.css
├── shell/                # Document skeleton, app bar, Appearance menu & global design tokens
├── dict/                 # Dictionary search, entry rendering, inflections & settings
├── reader/               # Parallel two-column reader
├── library/              # Work catalog & filtering
├── external/             # External Latin text loader & reader
├── corpus/               # Corpus search & concordances
├── macronizer/           # Vowel-length macronizer & interactive disambiguation
├── dialog/               # Accessible modal dialogs & issue reporting
├── about/                # Project information & metadata
├── testing/              # Shared SSR, interaction, and form conformance harnesses & fixtures
├── tools/                # Static analysis & conformance tools (CSS audit, inventory ratchet, Stylelint rules)
├── docs/                 # Cross-cutting guides, testing reference, code health backlog & archive
├── api_routes.server.ts  # JSON API endpoints (/api/completions, POST /api/report)
├── browser_targets.common.ts # Baseline 2023 + Extended Mobile browser support floor
├── inventory_ratchet.json # Ceiling ratchet for cross-slice CSS & client DOM mutations
├── app_router.server.ts   # Express router orchestrator mounted at / (public integration)
├── app.css                # Global stylesheet manifest (imports topic *.css)
└── critical.css       # Inlined above-the-fold critical CSS
```

### Docs

Each slice has its own `README.md` (and `TODOS.md` when open items remain). Cross-cutting docs live in [`docs/`](docs/):

| Doc                                               | Read it when                                                                       |
| :------------------------------------------------ | :--------------------------------------------------------------------------------- |
| [TESTING.md](docs/TESTING.md)                     | Running or writing tests; includes the pre-hydration (PH) bug index                |
| [NEW_FEATURE_GUIDE.md](docs/NEW_FEATURE_GUIDE.md) | Adding a page, slice, or interactive component                                     |
| [DESIGN_TRAPS.md](docs/DESIGN_TRAPS.md)           | Before writing code: recurring mistakes that lint and tests don't catch            |
| [CODE_HEALTH.md](docs/CODE_HEALTH.md)             | Looking for, or adding, small code-quality debt items (instead of `TODO` comments) |
| [FRAMEWORK_GAPS.md](docs/FRAMEWORK_GAPS.md)       | Hitting a missing framework primitive; also the deferred compile-time contracts    |
| [PREFERENCES.md](docs/PREFERENCES.md)             | Adding or changing a user preference                                               |
| [archive/](docs/archive/)                         | Historical design records only; not current guidance                               |

### Core Design Rules

1. **Colocated Vertical Slices**: Each topic folder contains everything required for that domain: SSR HTML templates, Light DOM Web Components, stylesheets, and unit tests. Deleting or refactoring a feature is isolated to its topic folder.
2. **Target Suffix Convention**: every module carries a tier, and the boundaries between them are enforced by `no-restricted-imports` rules in [eslint.config.mjs](../../../eslint.config.mjs) rather than by review.
   - `*.server.ts`: Executes in Node.js (Express SSR renderers, XML parsers, server-side utilities). **Never** bundled to browser assets; **no** browser DOM globals (`window`, `document`, `HTMLElement`). May not import `*.client.ts`.
   - `*.client.ts`: Executes in the Browser (Light DOM Web Components, client event delegation). Bundled via Rsbuild into 6 route-aligned chunks in `build/client/` (`common.js`, `dict.js`, `reader.js`, `external.js`, `corpus.js`, `macronizer.js`; see [Build Pipeline](#build-pipeline)). May not import `*.server.ts`, Node builtins, `express`, or `he`.
   - `*.common.ts`: Isomorphic **logic and rendering**. Safe in both tiers, and subject to both restrictions above. See [The `.common.ts` contract](#the-commonts-contract) below.
   - `*.test.ts`: Colocated unit tests targeting adjacent modules. Deliberately exempt, since a test legitimately exercises both sides of a boundary.
   - `*.css`: Feature-scoped styles imported by the root `app.css`.
3. **Flat Topic Directories**: Topics remain flat by default (avoiding micro-directories for 1–2 files). Filename prefixes (e.g. `dict_search.*`, `dict_settings.*`) keep related files automatically clustered alphabetically. Subdirectories are introduced only when a subcomponent exceeds 4+ dedicated files.
4. **Root Integration Hubs & Entry Chunks**: Top-level entry points (`app_router.server.ts`, `app.css`) and slice entry manifests (`shell/common_entry.client.ts`, `dict/dict_entry.client.ts`, `reader/reader_entry.client.ts`, `external/external_entry.client.ts`, `corpus/corpus_entry.client.ts`, `macronizer/macronizer_entry.client.ts`) aggregate exports across topics. They carry target suffixes like any other module — being an entry point is not an exemption.

---

## Conventions for All New Code

Follow these rules whenever adding or modifying UI V2 features:

1. **Forms first.** Every feature must work end-to-end as a plain HTTP `GET` or `POST` round-trip before any client JavaScript is added, then progressively enhance via `this.hijackForm()` and `this.syncQueryParam()`.
   - **Macronizer**: a `POST` form with a server-rendered result.
   - **Corpus**: a `GET` form with its query and settings (`pageSize`, `contextLen`, `strictMode`) in the URL.
2. **Don't move server-rendered nodes.** The server owns DOM structure; the client owns state (attributes, classes, listeners). If the JS-enhanced layout needs a different structure, render it in its final place on the server and hide it when JS is inactive. Reparenting SSR nodes in `onConnect()` reloads iframes, drops listeners, and requires fragile `onDisconnect()` restoration.
3. **Read before writing in `onConnect()` ([PH bug index](docs/TESTING.md#pre-hydration-ph-bug-index)).** On a slow connection, the user may have already scrolled (`window.scrollY > 0`), typed into an `<input>`, toggled a `<details>` or checkbox, or triggered a `:target` hash navigation before `v2.js` runs. Reconcile with and adopt live DOM/URL state before writing defaults, and guard initial `focus()` / scroll calls when `window.scrollY > 0`. Compare against the server-rendered defaults (`defaultChecked`, `defaultValue`, the SSR `open` attribute) to tell user edits from server state. Gate JS-dependent UI only with the JS gate below.
4. **Extend `core/`; don't fork it.** Shared behaviours (`BaseElement`, `BaseController`, `this.scope`, `fetchAndSwapPartial`, `setupModalDialog`, `DrawerController`, `ComboboxController`, `back_to_top.client.ts`) and shared styles (`core/nav/components.css` for focus rings, buttons, pills, and card headers) live in `core/`. If a slice needs a variation (e.g., a custom scroll container), parameterize the primitive in `core/` instead of copying it into the slice.
5. **New server templates use `html`, composed with `raw` / `joinHtml`.** Use `html` from `core/dom/html.common.ts` in new `.server.ts` templates as well as `.common.ts` and `.client.ts` (do not add new `he.escape` calls). **Never interpolate a `SafeHtml` directly into another `html` template (`${childSafeHtml}`):** the brand is erased at runtime, so `html` escapes it a second time into literal text. Always compose sub-templates with `joinHtml(parts)` or `raw(childSafeHtml)`. Older server templates that predate `html` are tagged with `ssr` (`core/server/ssr_template.server.ts`), which doesn't escape; never leave a multi-line server template untagged. Both tags strip the template's own indentation (values pass through untouched), so keep literal text inside `white-space: pre*` elements on one line. Don't write `<!-- -->` comments in templates (they ship in every response); use TypeScript comments beside the template.
6. **Keep new feature code inside its slice.** Keep slice-specific controllers, helpers, and state self-contained inside their topic folder (`dict/`, `reader/`, `external/`, `corpus/`, etc.) without cross-slice entanglement so heavy slices can be split into lazy `import()` chunks ([CODE_HEALTH.md](docs/CODE_HEALTH.md)).
7. **Verify audit findings before acting on them.**
   - Require concrete evidence (file, line, and exact mechanism) and verify each claim against the code before changing anything.
   - Check consequences across slices—especially keyboard focus preservation across swaps, custom element disconnect/reconnect lifecycles, and the zero-JS baseline.
   - Fix one-off issues locally; introduce a new shared primitive or conformance check only when a bug class recurs, weighting real shipped bugs over theoretical audit items.
8. **Never cache an element that a swap can replace.** Partial swaps (`swapSlots`, `replaceWithHtml`, `fetchAndSwapPartial`) replace nodes, so an element stored in a field goes stale without any error, and a later markup change can move an element into a swapped region. Store an element in a field only if it sits outside every region the component swaps, or if you re-resolve it in `onContentSwap` (see `reader_panel.client.ts`). Otherwise look it up when you use it. If a selector is needed in more than one place, put it in one private getter (`get #searchForm()`) or a module constant that queries on each read. Lookups take microseconds, so performance is never a reason to cache.
9. **Private members use `#`, not TypeScript's `private`.** Write `#field`, `#method()` and `get #el()`; `protected` stays as it is (`#` has no protected form). Why: TypeScript's `private` is only a type-level check, and at runtime it's an ordinary property. (a) The minifier can shorten `#` names but must keep `private` ones, which cost the routes 3–9 kB raw each before the switch (the `library` route dropped from 105.4 to 97.0 kB). (b) Components are DOM objects, so a `private` field can be read or overwritten by any script, extension, or peer, and could collide with a property a browser adds to `HTMLElement` later. (c) Reading `#x` off the wrong object throws instead of returning `undefined`. Two syntax limits: a constructor parameter can't be `#` (declare the field and assign it in the constructor), and `#` members can't be destructured (`const { #a } = this` is a syntax error), so read them one at a time. Tests have no escape hatch into a component: drive it through the DOM, the URL (`popstate`), or its public methods, and if a test truly needs a member, make that member public on purpose. Don't use `@ts-expect-error`, `Reflect.get` or `as any` to reach internals: `@ts-expect-error` also hides the error when the member is later renamed or made `#`, so the test breaks silently. `no-restricted-syntax` in [eslint.config.mjs](../../../eslint.config.mjs) rejects `private`, in tests too.

### Quick Reference (`core/` Primitives)

| For                                               | Use                                                                                                                                                                                                                                                                                                          | Not                                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Listeners, timers, animation frames, cancellation | `this.scope`: `listen`, `delegate`, `timeout`, `rAF`, `debounce`, `latest(lane)`                                                                                                                                                                                                                             | Raw `addEventListener` / `setTimeout` in components                                                   |
| Text input + popup suggestions (search, complete) | `ComboboxController` (`core/widgets/combobox.client.ts`, WAI-ARIA 1.2 combobox pattern)                                                                                                                                                                                                                      | Per-slice ArrowUp/Down keydown, blur timers, bespoke ARIA                                             |
| Updating regions from the server                  | `swapSlots` for several regions (`core/nav/partial.client.ts` + `core/nav/slots.common.ts`, with a `testing/slot_parity.ts` test); `fetchAndSwapPartial` for one                                                                                                                                             | Scraping swapped markup to patch other regions                                                        |
| Caching a GET that is static per build            | Client: `swapSlots({ versioned: true })`, `fetchAndSwapPartial({ versioned: true })`, or `withBuildVersion(url)` (`core/nav/build_version.client.ts`). Server: `setVersionedCacheControl` on the success path (`core/server/build_version.server.ts`). Only for responses that depend on nothing but the URL | `max-age` TTLs; `?v=` on navigation, history, or fallback URLs; versioning cookie-dependent responses |
| UI that needs JS, or only makes sense without it  | `data-js-only` / `data-nojs-only` (see [JS-only and No-JS-only UI](#js-only-and-no-js-only-ui))                                                                                                                                                                                                              | `<noscript>`, `.has-js`, `:defined`, per-slice `*-js-only` classes                                    |
| A different layout when JS runs                   | Render it in place on the server; hide it without JS                                                                                                                                                                                                                                                         | Moving server-rendered nodes on the client                                                            |
| Opening hidden UI for a `#hash` / link target     | `registerRevealer` (`core/nav/reveal.client.ts`, see [Hash targets](#hash-targets-and-the-reveal-protocol))                                                                                                                                                                                                  | Reading `location.hash` in `onConnect`; `:target` rules that still match after upgrade                |
| Back-to-top                                       | `core/widgets/back_to_top.client.ts`                                                                                                                                                                                                                                                                         | A slice-local copy                                                                                    |
| Focus ring, buttons, pills, card headers          | `core/nav/components.css`                                                                                                                                                                                                                                                                                    | Redeclaring `outline: 2px solid var(--primary)` per slice                                             |
| Building HTML (server, common, client)            | `html`, composed with `raw` / `joinHtml` (`core/dom/html.common.ts`)                                                                                                                                                                                                                                         | `${safeHtml}` inside `html` (re-escaped); `he.escape` in new code                                     |
| Form-driven UI                                    | A working `<form>` first, then `this.hijackForm` / `this.syncQueryParam`                                                                                                                                                                                                                                     | Controls that only work with JS                                                                       |
| Inventory ratchet (a growth guard, not a target)  | Extend `core/` or reuse a primitive on a regression; run `npm run inventory:update` in the same change for a stale entry                                                                                                                                                                                     | Raising `inventory_ratchet.json` for a regression                                                     |

### JS-only and No-JS-only UI

**Before upgrade, a page looks like the JS page but behaves like the No-JS page.** The upgrade then adopts whatever the user did in the meantime (adopt-before-write; see the [PH bug index](docs/TESTING.md#pre-hydration-ph-bug-index)). There is exactly one way to show or hide UI depending on whether JavaScript is running:

- **`data-js-only`** on anything that only works with JS (a `type="button"` control, a client-populated list).
- **`data-nojs-only`** on a No-JS fallback ("needs JavaScript" notes).
- **The owner** is the nearest element carrying `data-upgraded`. `BaseElement` sets it on every custom element after `onConnect()` returns (and removes it on disconnect), so inside a component there is nothing to do. A global script that wires up one specific element outside any component calls `markUpgraded(el)` from `core/dom/js_gate.client.ts`.

Two separate facts decide two separate things:

| Question                  | Decided by                                    | Known              | Effect                                                                                                                                                                 |
| :------------------------ | :-------------------------------------------- | :----------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What is painted?**      | `@media (scripting: enabled / none)`          | Before first paint | With scripting on, `data-nojs-only` is never painted, so fallbacks can't flash. With it off, `data-js-only` is never painted.                                          |
| **What works, and when?** | `data-upgraded` on the owner                  | At upgrade         | Until then, `data-js-only` keeps its box but is `visibility: hidden` (invisible, unfocusable, hidden from assistive tech), so nothing shifts when it appears.          |
| **What if JS broke?**     | `data-js-failed` on the owner, or on `<html>` | On failure         | JS-only UI in that subtree is dropped and its fallbacks are painted again. Set by `BaseElement` when `onConnect()` throws, and on `<html>` when `v2.js` fails to load. |

**Styling that differs by mode** follows the same split. Ask whether a rule changes what the element **does** or only how it **looks**:

- Looks only: `@media (scripting: none)` / `@media (scripting: enabled)` (plus `[data-js-failed] .x` if the failed state should match No-JS).
- Behaviour or hand-over (a `:target` rule the component takes over, a native fallback it replaces): `[data-upgraded] .x` for enhanced, `.x:not([data-upgraded] *)` for No-JS / pre-upgrade.

The rule block lives in [`critical.css`](critical.css), so it's correct from first paint. Content under a not-yet-registered custom element also stays gated, so lazily loaded chunks work without changes. Browsers in `V2_BROWSERSLIST` without `(scripting)` (Chrome 111–119, Safari 16.4–16.x) fall back to hiding fallbacks at upgrade.

There is no global "JS is on" flag. [`core/conformance/gate_conformance.test.ts`](core/conformance/gate_conformance.test.ts) fails on `<noscript>`, `.has-js`, `:defined` and `.js-only` classes, and ratchets the number of `[data-upgraded]` rules per CSS file. **Exceptions and ratchet increases require human review**; do not add one to make the test pass.

### Hash targets and the reveal protocol

No-JS UI often opens via a link to a fragment (`<a href="#reader-dict">` plus a `:target` rule). Scope such `:target` rules with `:not([data-upgraded] *)` so the component takes over after upgrade, and have the component adopt the state instead of reading `location.hash` itself:

- In `onConnect()`, `this.scope.use(registerRevealer(el, reveal, { ownsHash }))` from [`core/nav/reveal.client.ts`](core/nav/reveal.client.ts). `reveal(target)` must be idempotent (open, don't toggle).
- [`core/nav/anchor_scroll.client.ts`](core/nav/anchor_scroll.client.ts) calls `revealTarget()` for the initial hash (at page ready, via `onPageReady`, so every route chunk has registered its elements and a link clicked before the scripts arrived is adopted), on `hashchange`, on in-page anchor clicks and on `beforematch`. It opens ancestor `<details>` and calls every registered revealer from the innermost outwards, then scrolls.
- The click handler is a `LifetimeScope` listener, so the activation gate (below) skips it when the target's owner isn't running. The browser then navigates natively and the No-JS `:target` UI keeps working; the component adopts the hash when it upgrades.
- Global setups (`setupX` singletons) never run at import time. Entries call them from `onPageReady` ([`core/dom/page_ready.client.ts`](core/dom/page_ready.client.ts)); [`core/conformance/boot_conformance.test.ts`](core/conformance/boot_conformance.test.ts) enforces this. See [CHUNK_ORDERING_ADR.md](docs/archive/CHUNK_ORDERING_ADR.md) §8.
- `ownsHash: true` means the hash was only a No-JS state carrier (a drawer, a sheet). When the hash points exactly at such an element, it's cleared with `history.replaceState` once revealed, so closing the UI later isn't fought by a stale `:target`.

### The activation gate

A handler that cancels a native action (`preventDefault()`, or `pushState` in place of a navigation) on behalf of an owner that isn't running breaks that owner's No-JS fallback too. That was the chunk-ordering bug ([CHUNK_ORDERING_ADR.md](docs/archive/CHUNK_ORDERING_ADR.md) §8). An owner isn't running when its route chunk failed to load, its `onConnect` threw (`data-js-failed`), or it's defined later.

`LifetimeScope.listen()` prevents this structurally. For `click`, `submit` and activating `keydown` (Enter / Space), it doesn't call the listener at all (`canHandleActivation` in [`core/dom/js_gate.client.ts`](core/dom/js_gate.client.ts)) when any of the conditions below hold. A skipped listener can neither cancel the action nor run side effects such as `pushState`, so the browser's native handling goes ahead untouched. The conditions:

- the scope's own component, or any element above it, has failed (including `<html>` after a chunk failed to load; the CSS gate hides all `data-js-only` UI under a failure, running children included);
- the event target is inside a component that isn't running (checked up to the scope's component; to the document for standalone scopes); or
- a native control on the event path points at an element inside a component that isn't running: an in-page `href="#id"`, `aria-controls`, `popovertarget`, `commandfor` or `form`.

So a native action whose No-JS replacement has no running owner is never cancelled. Other events always pass. What that means for new code:

- **Listen through a scope.** Use `this.scope.listen(...)` in components and a standalone `new LifetimeScope(doc)` in global setups. Raw `addEventListener` and `on*` handler properties would bypass the gate, so ESLint bans them in `*.client.ts` (`no-restricted-syntax` in `eslint.config.mjs`). Only `lifetime_scope.client.ts` (the scope itself) is exempt file-wide; the few other raw listeners carry a per-line `eslint-disable-next-line` with the reason above it.
- **Reach peers with `queryUpgraded` / `closestUpgraded`.** Component classes are registered in `MorcusElementTagNameMap`, not `HTMLElementTagNameMap`, so a raw `querySelector("morcus-x")` is an untyped `Element`. [`core/conformance/boot_conformance.test.ts`](core/conformance/boot_conformance.test.ts) also bans importing `Morcus*` classes, even as types (let the type be inferred from `queryUpgraded`, or name `MorcusElementTagNameMap["morcus-x"]`), dynamic `import()` and `async onConnect`.
- **Keep references within an owner or visible to the gate.** A `label[for]` or `[form]` must share its nearest `morcus-*` owner with its target. A same-page hash link must be written as a bare `#id`. [`core/conformance/route_bundle_conformance.test.ts`](core/conformance/route_bundle_conformance.test.ts) checks both.
- The SSR conformance harness ([`testing/ssr_conformance_harness.ts`](testing/ssr_conformance_harness.ts), run by each feature's `*_ssr_conformance.test.ts`) section 4 fails each `morcus-*` instance in the SSR fixtures in turn (its `onConnect` throws, or its tag is never defined) and asserts that no activation in it, or pointing into it, is cancelled. It also marks `<html data-js-failed>` and asserts that no activation on the page is cancelled. It runs every global setup the entry files start, and a check in [`core/conformance/ssr_conformance.test.ts`](core/conformance/ssr_conformance.test.ts) fails if a new one is missing.
- Each feature's `*_interaction_conformance.test.ts` (e.g. [`dict/dict_interaction_conformance.test.ts`](dict/dict_interaction_conformance.test.ts)), built on [`testing/interaction_harness.ts`](testing/interaction_harness.ts), re-checks the SSR invariants after user interaction: every control in the feature's fixtures, plus the fetches that follow, including teardown mid-request. DOM a component builds or replaces after interaction must be in [`testing/created_dom_allowlist.ts`](testing/created_dom_allowlist.ts) or [`testing/isomorphic_rerenders.ts`](testing/isomorphic_rerenders.ts); both need human review to extend. See [TESTING.md](docs/TESTING.md), "SSR conformance harnesses", and its table "When to add or change a conformance test" for what a new page, flow, endpoint or form needs.

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

The canonical example is `dict/search/search_bar.common.ts`, whose `renderLangChipsHtml` and
`renderInflectChipHtml` are used in strict parallel with `computeActiveLanguages` by both
`dict/search/search_bar.server.ts` and `dict/search/dict_search.client.ts`.

Two consequences worth knowing before you "clean up" such a module:

- **They return `SafeHtml`, not DOM nodes.** The client updates the DOM via typed sinks
  (`setHtml` / `replaceWithHtml` in `core/dom/dom.client.ts`), so returning DOM nodes is not an option.
- **Attach-before-write convention.** When dynamically creating new elements in client code, attach the element to its live parent before calling `setHtml` (e.g. `parent.appendChild(el); setHtml(el, content);`). Calling `setHtml`, `replaceWithHtml`, or `swapElementContent` on a detached node trips the `assertConnected` invariant. For offline markup parsing without attaching, use `createHtmlFragment(html)` from `core/nav/partial.client.ts`.
- **Escaping is provided by `core/dom/html.common.ts`.** Escaping in `.common.ts` (and new `.server.ts`
  templates) uses the `html` tagged template from `core/dom/html.common.ts` rather than `he` (~100 KB of
  poorly tree-shakeable CommonJS, banned from `.common.ts` and `.client.ts` by ESLint). `html`
  auto-escapes dynamic values and brands output as `SafeHtml`; compose nested `SafeHtml` fragments
  with `joinHtml` or `raw` so they are not double-escaped.

### Build Pipeline

- **Bundler script**: [src/bundler/client.rsbuild.ts](../../bundler/client.rsbuild.ts)
- **Build contract**: [src/bundler/client_build_contract.ts](../../bundler/client_build_contract.ts) (chunk names, `dependOn` graph, manifest asset names, build directory; shared by the bundler and the server)
- **Output chunks**: `build/client/{common,dict,reader,external,corpus,macronizer}.js` (ESM chunks built via Rspack `dependOn` and loaded via `<script type="module">` tags emitted per route by `page_shell.server.ts`)
- **Shared modules**: a module imported by two or more chunks that depend on the same ancestor must ship once, in that ancestor. List it in the ancestor's `shared` array in `V2_CHUNK_ENTRIES` (it becomes an extra entry module of that chunk). A plain `import` from the entry file isn't enough: Rspack drops imports of side-effect-free modules whose exports the chunk doesn't use. The build fails with this advice (`checkV2ChunkDuplication`) when a module is duplicated.
- **Stylesheet**: `src/web/ui/app.css` served statically at `/assets/app.css`
- **Precompression**: every minified build (production and `./morcus.sh web`) writes `.br` (quality 11) and `.gz` (level 9) next to each hashed asset in the manifest. `preCompressedMiddleware` in [`web_server.ts`](../web_server.ts) serves them ahead of the V2 router's static handler, preferring brotli whenever the client accepts it and marking them `X-MorcusNet-PreCompressed: 1`. A missing sibling falls back to on-the-fly gzip from `compression()`. `critical.*` is inlined, so it has no siblings.

### Browser Support & Compatibility Target

UI V2 targets **Baseline 2023 + Extended Mobile** (`chrome >= 111`, `edge >= 111`, `firefox >= 121`, `safari >= 16.4`, `ios_saf >= 16.4`, `and_chr >= 111`, `and_ff >= 121`, `samsung >= 23`, `opera >= 96`), codified in [browser_targets.common.ts](browser_targets.common.ts).

On browsers meeting this standard, all client modules and modern CSS features are active. Browsers below this floor are not supported: `:has()`-dependent layout rules and client modules will not work on them, though server-rendered HTML and text remain readable.

Check new Web APIs against this floor, not just "works in my browser". For example, `AbortSignal.timeout()` is in, but `AbortSignal.any()` (Safari 17.4, Firefox 124) is out.

---

## Data Flow & Progressive Enhancement

UI V2 follows a universal progressive enhancement lifecycle across all pages:

1. **Zero-JS Initial Paint**: The user issues a standard HTTP `GET` (e.g. `/dicts?q=habeo` or `/work/caesar/de_bello_gallico/1.1`). Express renders a complete semantic HTML document with native `<form>`, `<details>`, and `<a>` elements.
2. **Non-Blocking Enhancement**: The browser downloads the route's client chunks (`common.js` plus any route-specific slice chunks) and defines native custom elements (`customElements.define`).
3. **Client Form Hijack & Partial Swapping**: When JavaScript is active, Web Components intercept user actions, fetch partial HTML fragments (`format=partial`) or autocomplete JSON from the router, and swap DOM nodes instantaneously via `replaceChildren()`, writing URL state through the router (`this.syncQueryParam()`'s `push` / `pushUrl` / `replaceUrl`) so Back and Forward stay in sync.

> **Topic-Specific Data Flows**: Detailed request lifecycle sequence diagrams and component breakdowns live in each topic's documentation (e.g., see [dict/README.md](dict/README.md)).

---

## Theme Switching Model

- **No-JS**: Media query `@media (prefers-color-scheme: dark)` adapts colors automatically based on the user's OS preference. Interactive custom elements (`morcus-appearance-menu` and `morcus-report-dialog`) carry `data-js-only`, so no dead controls are shown to users without JavaScript (or before upgrade).
- **With JS**: `<morcus-appearance-menu>` and `<morcus-report-dialog>` initialize and display buttons in the app bar. The Appearance menu (palette icon) holds the theme (System / Light / Dark), and the reading-text font, size and line spacing (`shell/appearance.client.ts`). A Light/Dark choice sets `[data-theme]` on `document.documentElement` (via `setPrepaint`; System removes it so the OS scheme applies), persists to `localStorage.getItem("GlobalSettings")`, and updates `<meta name="theme-color">` (server-rendered as one tag per OS colour scheme) to match the app bar. Feedback reporting opens via native `<dialog>` modal and submits via AJAX.
- **Zero Flicker**: The critical `<head>` script restores `data-theme` from the pre-paint snapshot before the first paint (see [`docs/PREFERENCES.md`](docs/PREFERENCES.md)).

---

## Rapid Iteration Workflow (Instruction for AI Agents)

> [!IMPORTANT]
>
> **Fast Visual Feedback**: When iterating on small changes (especially styling/CSS adjustments, visual polish, or minor UI tweaks):
>
> - **Make the fix and restart the server immediately** so the user can see it visually right away.
> - **Do NOT** wait for or run linting (`eslint`), formatting (`prettier`), type checking (`tsc`), or test suites during rapid iteration.
> - Save full verification (lint, types, tests) for when the user is satisfied with the visual outcome or explicitly asks to finalize/commit.

---

## Testing & Quality Verification (Pre-Commit / Finalization)

Comprehensive instructions for running unit tests and Playwright E2E tests are detailed in [TESTING.md](docs/TESTING.md). Run these when finalizing features or before committing:

- **Linting & Import Rules**: `npx eslint --cache src/web/ui`
- **Code Style**: `npx prettier --cache src/web/ui --check`
- **Type Checking**: `npx tsc --noEmit` (incremental via `.cache/.tsbuildinfo`)
- **Cross-Slice Inventory & Ratchet**: `npm run inventory` (or `./morcus.sh inventory`) guards against growth in cross-file CSS duplicate blocks and in client DOM construction/mutation outside `core/`, checked against [`inventory_ratchet.json`](inventory_ratchet.json), and writes `.cache/inventory/report.md` (also checked in-memory by `tools/inventory/inventory_ratchet.test.ts`, part of the whole-system tier: `./morcus.sh test --whole-system`). The counts are not targets. The check is exact, so if a change happens to remove counted calls or blocks it reports a stale entry; refresh the file in the same change with `npm run inventory:update` (or `./morcus.sh inventory --update`) so the ceiling stays tight.
- **Dead CSS**: [`tools/css_audit/css_audit_conformance.test.ts`](tools/css_audit/css_audit_conformance.test.ts) (part of the whole-system tier: `./morcus.sh test --whole-system`) fails on two kinds of dead stylesheet code, both at a baseline of zero. **Allowlist entries require human review**; stale entries also fail.
  1. _Shadowed declarations_: a later rule with the same selector, at-rule context and importance, and at least the same specificity, resets the property (directly or via a covering shorthand such as `padding` after `padding-bottom`). The later rule always wins, so the earlier declaration can be deleted. Nested `&` rules are resolved with `:is()` specificity.
  2. _Unreferenced names_: a `.class`, `[data-*]` or `morcus-*` name in CSS that no non-test `.ts` file under `src/` mentions in a string or template literal (or, for `data-*`, via `el.dataset.fooBar`). Class names completed at runtime (`lang-chip-${lang}`) must be spelled as literals per case where the set is closed; the open-ended families are listed in `DYNAMIC_CLASS_PREFIX_ALLOWLIST` in [`tools/css_audit/css_audit_unreferenced.ts`](tools/css_audit/css_audit_unreferenced.ts). There is no dynamic escape hatch for `data-*` attribute names: build them from literals.
- **Unit Tests**: `npx jest src/web/ui`
- **E2E Tests**: `REUSE_DEV_SERVER=true PORT=1337 npx playwright test browser_e2e`
