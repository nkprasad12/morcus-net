# UI V2 Code Health Backlog

A running, incremental backlog of active code-quality and refactoring work for `src/web/v2/`.

**How to use this file**

- Each `[ ]` item is scoped to be **one small, independently landable change**. Nothing here
  requires a mega-refactor.
- Sizes: 🟢 < 30 min · 🟡 an hour or two · 🔴 half a day+
- When adding new debt, add it here rather than a TODO comment, so it stays reviewable.
- When an item lands, check it off or remove it from the active backlog.
- If the work turned up something counter-intuitive — a decision that looks wrong until you know why,
  or advice that proved incorrect — add it to **Investigated & resolved** at the bottom so it is
  not rediscovered or undone.

**Audit summary**: the architecture is sound — vertical slices, the `*.server`/`*.client`/`*.common`
suffix convention, the zero-JS baseline, and the `core/` primitives are all the right bones.
The recurring problem is that **the good abstractions in `core/` are only half-adopted**, and
**the conventions in [README.md](README.md) are documented but unenforced**.

---

## Phase 2 — Guardrails

- [x] 🟡 **Enforce the `critical.js` byte budget.** `maxCriticalJsRawBytes` / `maxCriticalJsGzipBytes`
      in [`v2_bundle_budget.ts`](../../bundler/v2_bundle_budget.ts) (450 B / 350 B) fail every
      minified build that exceeds them. That matters because
      [`page_shell.server.ts`](shell/page_shell.server.ts) inlines `build/v2/critical.js` **into
      every HTML response** (uncached, paid per page load, parser-blocking); a stale unminified
      artifact weighs 2.78 KB and would otherwise ship silently.
- [x] 🔴 **Bundle splitting strategy.** Partitioned into 5 route-aligned entry chunks via Rspack
      `dependOn` (`splitChunks: false`), defined in
      [`v2_build_contract.ts`](../../bundler/v2_build_contract.ts): `common.js` (core, shell,
      dialog), `dict.js`, `reader.js` (reader + library), and `corpus.js` each `dependOn: "common"`,
      and `external.js` `dependOn: "reader"`. [`page_shell.server.ts`](shell/page_shell.server.ts)
      emits only the chunks a route needs, in dependency order (plus `<link rel="prefetch">` for
      `dict.js` on reader pages, whose dictionary iframe loads it). Guarded by per-chunk raw/gzip
      ceilings and `checkV2ChunkDuplication` (0 duplicate modules across chunks) in
      [`v2_bundle_budget.ts`](../../bundler/v2_bundle_budget.ts), and by
      [`route_bundle_conformance.test.ts`](core/route_bundle_conformance.test.ts) across all full
      pages and partial swap templates.
- [x] 🟡 **Stop client modules installing global listeners at import time.**
      `anchor_scroll`, `back_to_top`, `mobile_menu`, `deferred_iframe` and `abbr_popover` now only
      export their `setupX` functions; `common_entry` and `dict_entry` call them from
      `onPageReady` ([`core/page_ready.client.ts`](core/page_ready.client.ts)). Enforced by
      [`core/boot_conformance.test.ts`](core/boot_conformance.test.ts): no top-level side effects
      outside `registerElement` (and `onPageReady` in entries), and every singleton setup is called
      from an entry. Note that [`v2_elements.client.ts`](v2_elements.client.ts) still imports the
      entries, and jsdom's `readyState` is `"complete"`, so tests importing it still run the setups.
- [x] 🔴 **Startup code in `common.js` runs before the route's components exist.** Fixed with
      A + D: global setups run at page ready (after every deferred module chunk has executed), and
      the anchor click handler leaves the native `:target` path alone while the target's owners
      are not upgraded (`ownersUpgraded` in [`core/js_gate.client.ts`](core/js_gate.client.ts)).
      The `whenDefined` stopgap is gone. The late-hydration suite now stages `common.js` before
      the route chunk. Decision record: [CHUNK_ORDERING.md §8](CHUNK_ORDERING.md). Recurrence is
      prevented by the activation gate in `LifetimeScope.listen()` ("The activation gate" in
      [README.md](README.md)).
- [ ] 🟡 **Make revealers idempotent by contract, and test it.** README says `reveal(target)` must
      be idempotent, but the [`Revealer`](core/reveal.client.ts) type doesn't, and no test calls a
      revealer twice. Back/forward and `beforematch` can repeat a reveal. `reader_panel`'s
      revealer calls `setTab("translation")`, which re-shows the spinner and starts a second fetch
      while the first is in flight, and fires `onTabChange` again. `reader_view`'s
      `restoreDrawer()` is unverified. Fix: document it on `Revealer`, guard the in-flight
      translation load, and add a call-twice test per revealer (same state, one fetch).
- [ ] 🟢 **Tighten the reader's window-level keyboard shortcuts.** `reader_view.client.ts` listens
      for `keydown` on `window` and calls `preventDefault` for page turns, TOC, panel tabs and
      settings. It skips modifier keys, `contenteditable`, `input`, `textarea` and `select`, but
      not `e.defaultPrevented`, `e.isComposing`, `role="textbox"`/`combobox`/`listbox` targets, or
      focus inside a dialog, popover or menu elsewhere on the page (the report dialog, the section
      menu). It also calls `settings.toggle()` on `morcus-reader-settings` without checking it
      upgraded. Found while annotating native takeovers.
- [ ] 🟢 **Review document-level takeovers in shared helpers.** `bindDismissable` calls
      `preventDefault` on Escape for any target while its overlay is open, with no
      `defaultPrevented` check, so a nested widget that handles Escape still closes the outer
      overlay. `popover`'s focus trap takes Tab even when focus is outside the panel (it does
      check `defaultPrevented`). `abbr_popover` suppresses clicks on any `.lsHover`, which would
      also swallow navigation if one ever sat inside a link. None are chunk-ordering bugs, but
      each acts on events it doesn't own.
- [ ] 🟢 **Extend the import-boundary lint beyond `src/web/v2` and `src/bundler`.** The tier rules in
      `eslint.config.mjs` only match files inside those two trees. `src/bundler` importing
      `asset_manifest.server.ts` went unnoticed until review for exactly that reason (it has its own
      rule now). Elsewhere, e.g. `src/start_server.ts`, `src/scripts/**` and
      `src/integration/**`, nothing stops Node code importing a `*.client.ts` module (DOM globals
      at load time) or browser-bound code picking up a `*.server.ts`. Low priority: no such import
      exists today.

---

## Phase 3 — Adopt the abstractions we already built

> [!NOTE] > **Dictionary selection is currently represented four ways**: base36 URL bitmask, the
> `morcus_dicts` cookie, `SEARCH_SETTINGS_KEY` as a semicolon-string in localStorage, and
> `GlobalSettings` JSON — each with its own parser. This is the most likely source of future
> "my settings didn't stick" bugs. Worth a deliberate consolidation pass eventually; at minimum,
> document the precedence ladder in one place next to one parser.

- [ ] 🔴 **Ratchet down string-selector queries outside `core/`** (metric C of
      `./morcus.sh inventory`; 202 calls across 18 files when first measured). Work hotspot-first
      from §4 of `.cache/inventory/report.md`: `reader_view.client.ts` (54),
      `reader_settings.client.ts` (24), `reader_toc.client.ts` (22), `external_loader.client.ts`
      (20), `reader_panel.client.ts` (16), `dict_settings.client.ts` (13), `dict_search.client.ts`
      (12). Resolve each element once on connect (`this.scope.require`) into a field, or hand the
      lookup to a `core/` controller, instead of re-querying by string at each use. Land one file
      per change and lower the ratchet with `npm run inventory:update`.

---

## Phase 4 — Decomposition

### Server-side render functions

- [x] 🟢 **Use or delete `linkifyText`'s `activeWord` parameter** (`dict/linkify.server.ts` L26).
      Deleted `linkify.server.ts` and the `allowLinkify` option in `xml_to_html.server.ts` entirely.
      All Latin word linkification in UI V2 is performed client-side via progressive enhancement
      (`dict_search.client.ts` / `core/tokenize.client.ts`), making the entire server-side linkification
      tree dead code.

### Client DOM construction outside `core/`

Tracked by metric B of `./morcus.sh inventory` (`domMutationOutsideCore` in
[`inventory_ratchet.json`](inventory_ratchet.json)); was 32 calls across 6 files. Server-render the
markup and adopt it on connect, or move the construction into a `core/` helper. Lower the ratchet
with `npm run inventory:update` in the same change.

- [x] 🟢 **`dict_search.client.ts`: stop creating `<morcus-dict-suggestions>` and the word links.**
      The suggestions host is server-rendered inside `.input-wrapper` by `renderDictSearchBar`
      (`data-js-only`) and adopted on connect; the `<a class="lat-word">` factory is
      `createWordLink` in `core/tokenize.client.ts`. The two remaining calls re-render the language
      and inflection chips from `search_bar.common.ts`.
- [ ] 🟡 **`dict_suggestions.client.ts` (11)**: build the suggestion list from a
      `*.common.ts` HTML renderer (as the chips do) instead of `createElement`/`appendChild`, and
      server-render the empty `ul.suggestions` so the SSR conformance allowlist can drop it.
- [ ] 🟡 **`reader_view.client.ts` (9)**: the bottom-sheet label `<strong>` runs and the
      `lat-word` span factory (a sibling of `createWordLink` in `core/tokenize.client.ts`).
- [ ] 🟢 **`library_view.client.ts` (3)**, **`reader_panel.client.ts` (3)**,
      **`external_loader.client.ts` (1)**: resume badge, translation loading/error states,
      saved-items list.

---

## Phase 7 — Docs & tests

- [x] 🟢 **Stop the Firefox baselines going stale again.** Made `--update` refuse to run on visual
      regression tests (`--visual`) without `--all` in `src/scripts/run_morcus.ts`. Updating snapshots
      now strictly requires the full browser matrix (`./morcus.sh e2e --visual --all --update`),
      preventing fast-path Chromium-only updates from leaving Firefox and FirefoxSmallScreen
      baselines stale.

- [ ] 🟡 **Fix the Firefox click-to-lookup flake.** `browser_v2_e2e.test.ts` _"click-to-lookup
      progressively enhances Latin words and navigates on click (JS enabled)"_ fails ~20–40% of runs
      on `firefox` / `FirefoxSmallScreen` (21/50 on `8f630e3b`, run with `--repeat-each=25
    --retries=0`); `--retries` hides it in normal runs. The URL stays at `?q=habeo` instead of
      `?q=habere`. The `.lat-word` is an `<a href>`, so a skipped handler would have navigated
      natively and passed: the handler in `dict_search.client.ts` (results `click` listener) most
      likely calls `preventDefault()` and then `chooseSuggestion` never updates the URL. Suspects:
      a supersession lane cancelling the lookup, or the click landing before `enhanceWords`
      finishes. Not caused by the activation gate (same rate with and without it).

**Cover the untested logic.** Well-tested today: SSR renderers, router routes, bitmask/clustering,
dialog markup. Gaps:

- [ ] 🟢 **Reader keyboard shortcuts** (`reader_view.client.ts` L1028-1066)
- [ ] 🟡 **Reader preference save/hydrate lifecycle** (L806-984)
- [ ] 🟡 **`DrawerController` snap thresholds and flick-velocity logic** — extract the snap math to a
      pure function and test that directly
- [ ] 🟡 **Widen selector inventory contract test (`reader_selector_contract.test.ts`)**:
      Guard against dead-selector classes across the client bundle: - Scan more than `reader_toc.client.ts` + `reader_settings.client.ts` — `reader_view.client.ts`
      alone binds ~32 selectors and is unscanned, as are `reader_panel`, `drawer`, and every `dict_*` module. - Match `this.scope.require(...)` — the current extractor regex misses it. - Match delegated selectors — the 3rd argument of `delegate(root, type, selector, fn)` (e.g. `#btn-retry-translation`) is invisible today. - Stop skipping comma-containing selectors (`if (!raw.includes(","))`), which silently exempts real bindings such as `#toggle-inflected, .inflected-checkbox`.

**Close the No-JS testing gap.** Found while reviewing why `ca9cb47e` (No-JS dictionary selection)
shipped broken. The gap was not a missing test: [`browser_v2_e2e.test.ts`](../../integration/suites/browser_v2_e2e.test.ts)
_"exposes usable dictionary settings without JavaScript"_ covers that exact CUJ and **passed the whole
time the feature was broken**. Under the bug the server returned all eight dictionaries, and every
assertion still held — it checked that Lewis & Short was _present_, using L&S (the default, and the
first card) as the fixture, then asserted on the request URL rather than the response.

- [ ] 🔴 **Add a jsdom "form contract" test layer.** Nothing today sits between "the SSR emits the
      right HTML" (fast, unit) and "a real browser submits correctly" (slow, pre-push, rarely run),
      yet all four root causes of that bug lived in exactly that gap. Render the SSR form into jsdom,
      mutate controls, serialize with `new FormData(form)`, and feed the result straight to supertest.
      Runs in milliseconds and needs no browser. It is the only layer that sees a form as a whole,
      which is what cause 1 (a stale hidden `d` rendered beside the live `dict` checkboxes) required.
      Note this also fixes a process problem: [`TESTING.md`](TESTING.md) puts all No-JS correctness in
      the pre-push Playwright matrix, which `AGENTS.md` rightly tells agents not to run proactively —
      so the zero-JS baseline is gated by the check that runs least often.
- [ ] 🔴 **Exact-set assertions for anything that filters.** For a selection feature, "the expected
      item is present" is vacuous: the failure mode is that nothing was filtered. Assert the count and
      the full set of `.dict-title`s. Add a helper and treat bare `.first()` + `toContainText` in a
      selection test as a review smell.
- [ ] 🟡 **Never fixture an override with its default value.** L&S is the worst possible choice here:
      it is the one value for which "your override applied" and "your override was ignored" look
      identical. Standardize on Gaffiot / Georges — `GAF` and `GRG` are also the tokens that broke
      naive parsing.
- [ ] 🟡 **Test parameter precedence, not just parameters.** Every dict param was covered in
      isolation (`?dict=`, `?d=`, `?o=`) and none in combination, so a precedence inversion was
      invisible. Same for wire format: tests used the shapes _our client_ emits, never the shapes a
      native form emits (hidden default + checkbox → repeated key).
- [ ] 🟡 **Convert the selection specs from single actions to journeys.** select → search again →
      reload → toggle inflection off → and back. Each of the four root causes died at a different
      step; the single-shot test could not see any of them past the first.
- [ ] 🟢 **Round-trip property test over the state representations.** `LatinDict.AVAILABLE` is 8
      entries, so all 256 subsets are cheap. Assert identity through checkbox serialization, the `d`
      bitmask, the `dict` list, and the cookie — including the empty, single (the cause-3 boundary),
      and full sets.
- [ ] 🟢 **Visual scenarios for post-interaction state.** `v2VisualScenario`'s `action` hook exists
      for this and no dictionary scenario uses it. Popover-open and results-with-one-dictionary would
      have caught the bug as a pixel diff across all four form factors.

---

## Phase 8 — Performance

> [!NOTE]
> The drag-related items were found together on 2026-09-13 while investigating a report that
> **resizing the reader drawer feels laggy**. They compound. The one among them that was a **bug**
> rather than an optimization — the dead drag-transition selector — has since landed, and it was
> expected to account for most of the symptom on its own, so **re-measure before spending effort on
> the rest**. None of this has been profiled; the mechanisms are confirmed by reading, the split
> between them is not.

- [ ] 🟡 **Don't tokenize the whole chapter synchronously on mount.** `reader_view.client.ts`
      L366-374 walks every target block calling `tokenizeElement` (L401) inside `onConnect` — one
      long task that delays first interaction. Batch via `requestIdleCallback`.
- [ ] 🟡 **Add CSS containment to the reader text panel.** There is currently **no** `contain:` or
      `content-visibility:` anywhere in `src/web/v2`, so a drawer or splitter resize relayouts the
      full text panel and all of its inline word spans.
- [x] 🟡 **Split the heavy verticals by route.** Replaced `v2_bundle.client.ts` with 5 route-aligned
      `dependOn` entry chunks (`common.js`, `dict.js`, `reader.js`, `external.js`, `corpus.js`).

---

## Phase 9 — CSS duplication

- [x] 🟡 **Resolve the `.reader-btn:hover` conflict — this one changes pixels.**
      `reader_nav.css` styles hover twice. The shared rule sets
      `border-color: var(--border-strong)` plus `color: var(--primary)`; the per-control rules
      earlier in the file set `color: var(--text)`, `border-color: var(--app-bar-toggle-border)`
      and `background: var(--card-bg)`. Both are `(0,2,0)`, so the **later** shared rule wins and
      the per-control `color` / `border-color` are dead — only their `background` survives. The
      dedup pass left both in place and pinned their file order with comments precisely because
      collapsing them would silently pick a winner. Deciding which hover is intended is a
      **design** call and needs visual baseline approval.
- [x] 🟡 **Sweep for dead CSS.** `.jump-input`, `.sticky-jump-input` and `.jump-submit` were removed
      after grep showed zero references anywhere outside their own rules — leftovers from a removed
      section-number jump form. `.ghost-scrollbar` is still declared and applied to nothing. Three
      confirmed instances found incidentally suggests a systematic coverage pass would beat any
      further hand-deduplication.
- [x] 🟢 **Extend duplicate detection across files.** `morcus/no-duplicate-declaration-blocks` is
      per-file, and `lint:css` runs with `--cache`, so accumulating state across files is
      unreliable. The focus-ring block still appears ~9× across the bundle; only the 5 within
      `reader_nav.css` were catchable. Cross-file dedup wants a standalone script over the built
      bundle, run as its own CI step.
- [x] 🟡 **Eliminate the 10 cross-file duplicate declaration blocks** reported by
      `./morcus.sh inventory` (§2 of `.cache/inventory/report.md`): - App bar vs critical CSS (`0937c20e`, `023f94c4`, `1209c6d3`, `1a3fa00c`, `950ab4e7`):
      `.brand-group`, `.actions-group`, `.mobile-menu` and the ≤640px `.app-bar-inner` grid now
      live only in [`v2-critical.css`](v2-critical.css), which is inlined into every page ahead
      of `v2.css`. `shell/app_bar.css` keeps only what first paint does not need. - 20px icon-button glyph (`690729f2`) → one rule in [`core/components.css`](core/components.css). - Open settings button (`789b1926`) → `details[open] > .settings-btn` joins the
      `[aria-expanded="true"]` rule in [`core/settings.css`](core/settings.css) (it must stay after
      `.settings-btn:hover`, which `components.css` would not be). - `.dict-source-popover-body a` (`a97493b7`) repeated the base `a` rule in `v2.css`; deleted. - Vertical stacks (`02e1f1f3`, `e2207a61`) → shared selector lists in `core/components.css`. - `0937c20e` also matched `.about-header` against critical `.brand-group`. Critical CSS has
      to be self-contained, so that pair is allowlisted in `inventory_ratchet.json` rather than
      merged.

---

## Investigated & resolved (Design Traps & Architectural Lessons)

Findings that cost real time to establish and that would otherwise be rediscovered — or worse,
"fixed" back. Keep this section at the bottom as a permanent technical reference.

**Do not add `eslint-plugin-wc` — won't do.** Investigated and resolved with self-populating conformance testing instead. `eslint-plugin-wc`'s justifying rule (`wc/no-typos`) only checks W3C standard lifecycle methods (`connectedCallback`, `disconnectedCallback`, `attributeChangedCallback`, `observedAttributes`). In UI V2, `BaseElement` has fully centralized `connectedCallback` and `disconnectedCallback`; feature components implement `onConnect()` and `onDisconnect()`, which `eslint-plugin-wc` does not recognize or validate. Furthermore, `wc/no-invalid-element-name` keys off `customElements.define` AST nodes, missing registrations routed through `registerElement()`. Rather than adding an external dependency that does not inspect `onConnect`, lifecycle and reattachment correctness is mechanically enforced by `core/reattach_conformance.test.ts` paired with `v2_elements.client.ts` and `getRegisteredElementTags()`, asserting bidirectional fixture coverage and statically verifying all `registerElement` callers are imported in the manifest.

**The mobile TOC drawer flash does not exist — do not re-file it.** It was filed as a Phase 1
correctness bug on the theory that `dict_toc.client.ts` builds a `DrawerController` below 1080px and
that minimizing the drawer undoes the SSR state after paint. `DrawerController`'s constructor only
calls `initDrag` / `initKeyboard` / `initDetailsSync`; it never calls
`minimize()`, and nothing else writes `drawer-minimized` on load. Sampling every animation frame
from document start on `/v2/dicts?q=gladius` in MobileChrome shows the drawer at `height=349,
top=378, open=true, minimized=false` before the element upgrades (137 ms), at upgrade (182 ms), and
thereafter. The only state change after upgrade is the intentional `scrollToResults` moving the page
to y=162. The proposed `@media (scripting: none)` fix would have been a UX change — mobile TOC
starts collapsed — sold as a flash fix, and would not have turned the suite green.

**`fullPage` screenshots on `isMobile` contexts move the scroll offset, and `toHaveScreenshot`
cannot recover from it.** The capture briefly resizes the viewport and Chromium does not restore
the offset: gladius walks 162 → 213 → 263 → 312 → 361, one step per capture. Fixed chrome is painted
somewhere new each time, so `toHaveScreenshot`'s stability loop — which re-captures until two
consecutive frames agree — drives the very drift it is waiting out and reports "Failed to take two
consecutive stable screenshots". Only pages that are scrolled are affected, which is why it hit
exactly the three `?q=` dictionary scenarios with JS and never their no-JS or desktop siblings.
Ruled out along the way: `scroll-behavior: smooth` (fails identically under `reducedMotion:
reduce`), scroll anchoring (`overflow-anchor: none` changes nothing), `scale: "css"` vs `"device"`
(both drift), and masking the chrome (the mask rectangle tracks the element and moves with it).

**Do not "strengthen" the visual harness to require byte-identical frames.** Replacing
`toHaveScreenshot` with a capture-until-byte-equal loop plus `toMatchSnapshot` looks stricter and
breaks six _passing_ no-JS mobile tests: consecutive captures of an idle page differ by sub-threshold
antialiasing, which `toHaveScreenshot`'s comparator is designed to absorb. Stability and equality are
different questions, and the comparator is the one that knows the difference.

**`search_bar.common.ts` exporting HTML renderers is CORRECT — do not "fix" it.**
`renderLangChipsHtml` and `renderInflectChipHtml` are the only HTML-rendering functions in the
entire `.common.ts` tier, and both are genuinely used on **both** sides, in strict parallel with
`computeActiveLanguages` (`search_bar.server.ts` L42-44; `dict_search.client.ts` L381-399). The
server paints the chips on initial load, and the client must repaint **byte-identical** markup when
the user toggles dictionaries without a reload, so server/client copies would guarantee silent
drift. They return markup rather than DOM nodes for the same reason.

**`he` must never reach browser-bound code** — ~100 KB of poorly tree-shakeable CommonJS UMD, so a
`.common.ts` importing it lands it in the client bundle. Now enforced by `no-restricted-imports` on
the client and common tiers rather than resting on a comment, and it is why the escaping in
`core/html.common.ts` is hand-rolled.

**`he.encode` entity-encodes all non-ASCII characters (> 0x7E) into hex numeric references.**
In Latin and Greek lexica, this converts macronized vowels (`hăbēna` → `h&#x103;b&#x113;na`),
Greek text (`λόγος` → `&#x3BB;...`), and typographical symbols (`•` → `&#x2022;`) into bloated
entity strings, running 40× slower on Greek text and inflating payload size by ~3×. `he.escape`
only escapes the five HTML syntactic characters (`&`, `<`, `>`, `"`, `'`) and preserves raw UTF-8.
Enforced on server templates by `no-restricted-properties` and `no-restricted-syntax` in
`eslint.config.mjs`.

**`SafeHtml` is a branded string, not a wrapper object.** The obvious design —
`type SafeHtml = { [RAW]: string }` — does not compile: an object cannot be assigned to `innerHTML`,
and unwrapping it at the call site is exactly the kind of call expression `no-unsanitized` cannot
see through. So `html` returns `string & { [SAFE_HTML]: true }`: a real string at runtime,
assignable to `string`, but not constructible from one. `raw()` stays an object, because that is
what makes trusted content recognisable at runtime.

**A `SafeHtml` interpolated directly into another `html` template is escaped again**, because the
brand is erased at runtime. Compose with `joinHtml` or `raw`. It fails safe — visibly
double-encoded text, not an injection — and there is a test pinning it.

**`no-unsanitized`'s `escape: { taggedTemplates: ["html"] }` is deliberately unused.** Trusting the
tag by name only covers markup written inline as a template; it cannot cover a site that assigns the
_result of a renderer function_, which the rule rejects however the callee is written. Routing every
sink through `setHtml` / `replaceWithHtml`, which take `SafeHtml`, covers both shapes and keeps the
trust in the type system — where a renderer changing its return type is caught, unlike a config
allowlist of function names.

**ESLint flat config _replaces_ a rule's options rather than merging them.** Re-declaring
`no-restricted-imports` in a V2 block switched the repo-wide relative-import ban back **off** for
exactly the files the block was meant to constrain. Every block that touches it now re-states
`NO_RELATIVE_IMPORTS`.

**Prettier formats the markup inside `html` tagged templates.** It is whitespace-aware and will not
introduce a rendered gap between inline elements, but it reflows block elements across lines — which
does put real whitespace in the output — and rewrites single-quoted attributes to double quotes.
Tests asserting exact output should therefore use inline elements.

**`// eslint-disable-next-line rule -- long reason` is unsafe in this repo.** Prettier wraps the
trailing reason onto a second line, and the directive then applies to _that comment_ rather than to
the code. `reportUnusedDisableDirectives` is what catches it. Put the reason on its own line above
the directive.

**Do not wrap Express handlers inline as `router.get("/x", asyncHandler(async (req, res) => {`.**
The last argument becomes a call expression, so prettier stops hugging the callback and re-indents
every handler body — ~450 lines of noise in a 577-line file. Piloted and reverted; the local
`getAsync` / `postAsync` registrars make each handler a one-line diff instead.

**`matchesObject` must not be used for settings stores; use `pickValid`.** `matchesObject` is
all-or-nothing: one corrupt or unrecognized key returns `false` for the entire object, which
would discard unrelated valid settings in `GlobalSettings` and wipe out stored `ReaderPreferences`
on schema upgrades. `pickValid` keeps valid fields and drops invalid or missing ones. Crucially,
missing fields are omitted from the returned `Partial<T>` rather than set to `undefined`, so
`{ ...defaults, ...pickValid(...) }` never clobbers defaults with `undefined`.

**Do not debounce dictionary/inflection checkbox toggles in settings.** A short debounce (e.g.
180 ms) cannot coalesce human checkbox clicking (Fitts's law and pointer transit take 400–800 ms),
so sequential toggles still fire separate requests while single clicks (the 95%+ case) suffer
artificial latency. A long debounce (600–800 ms) makes single toggles feel sluggish and unresponsive.

**Do not coalesce pointer drags to animation frames in `core/gesture.client.ts` — won't do.**
Investigated and closed with zero code changes. Browsers (Blink, Gecko, WebKit) already coalesce
continuous input events (`pointermove`, `mousemove`, `touchmove`, `wheel`) and align dispatch to
the `requestAnimationFrame` cadence; `event.getCoalescedEvents()` exists specifically to recover
the intermediate positions the browser discarded. Measured via on-page instrumentation across five
splitter and drawer drags on the heaviest reader text in the corpus (`apuleius/metamorphoses`):
`max 1/fr`, `burst 0` across all 48 rendered frames (no frame ever received >1 `pointermove`).
Furthermore, `onMove` contains only arithmetic and CSS variable writes (`--drawer-height`, `--dict-width`).
Property writes do not force synchronous layout; the browser merges them at paint time anyway.
The real cost was layout _reads_ after writes, which the hoist eliminated. Redundant rAF coalescing
would add ~30 lines carrying a subtle flush-on-`pointerup` footgun for zero measurable gain.

**`eslint-plugin-compat` cannot detect static Web API incompatibilities — closed as won't-do.**
The motivating use-case for linting browser compatibility was evaluating `AbortSignal.any()`. In
MDN Browser Compat Data (BCD), static class methods are keyed with an `_static` suffix
(`any_static`, `timeout_static`), but `eslint-plugin-compat`'s underlying AST engine
(`ast-metadata-inferer`) only indexes prototype instance properties (`aborted`, `reason`,
`throwIfAborted`) and constructor `.name`. Tested against Safari 14 targets, `eslint-plugin-compat`
reports 0 errors for `AbortSignal.any()` or `AbortSignal.timeout()`, providing zero protection for
the bug class that prompted the proposal. Furthermore, it cannot lint `.css` files where UI V2's
real platform floor (`:has()`, `dvh`) lives. Under unconfigured defaults it also produces 21 false
positives on core APIs (`fetch`, `URL`, `performance.now`) due to Opera Mini.

**`AbortSignal.any()` is outside Baseline 2023; `AbortSignal.timeout()` is supported.**
`AbortSignal.any()` was added in Safari 17.4 (March 2024), Firefox 124 (March 2024), and Chrome 116
(August 2023). Under UI V2's Baseline 2023 target floor (`safari >= 16.4`, `firefox >= 121`,
`chrome >= 111`), `AbortSignal.any()` cannot be used. The decision in `BaseElement` to reject it in
favor of explicit lifecycle teardown (`this.lanes` + `this.lifetime.abort()`) is correct. Conversely,
`AbortSignal.timeout()` is supported across Safari 16.0+, Firefox 100+, and Chrome 103+, and is
sanctioned for client use throughout UI V2 (e.g. `core/partial.client.ts`).

**Adopting Baseline 2023 browserslist saves 3.8 kB JS / 925 B CSS without dropping vendor prefixes.**
Targeting Baseline 2023 in `src/bundler/v2.rsbuild.ts` via `output.overrideBrowserslist` allows SWC
to emit native class fields (`disposables = [];`), native optional chaining (`?.`), and rest
parameters (`(...s) => ...`) instead of injecting `_defineProperty` helpers and `arguments` arrays.
In CSS, Lightning CSS preserves WebKit properties like `-webkit-overflow-scrolling: touch` while
enabling Media Queries Level 4 range syntax (`width <= 640px`), `:is(...)` selector deduplication,
and `inset` property shorthands.

**`HTMLElement` popover methods do not require a custom `.d.ts` declaration.** TypeScript 5.8
`lib.dom.d.ts` natively provides `showPopover(): void` and `hidePopover(): void` on `HTMLElement`
under the `"dom"` library target in `tsconfig.json`. The `declare global` block in the client bundle
was completely redundant and safely removed without auxiliary declaration files.

**The floating return-to-top button must stay elevated above mobile drawers (`--z-fab: 110`).**
On mobile, `.back-to-top` dynamically rests 16px above the top edge of `.drawer` via
`bottom: calc(var(--drawer-height) + ...)`. During drawer drag transitions and docking, the drawer's
upward box-shadow and swipe surface occlude lower-z-index elements. Elevating to `--z-fab: 110`
(strictly above `--z-drawer: 100`) is required.

**Never style `:target` unscoped from a vertical-slice stylesheet.** `v2.css` concatenates every
slice into one bundle served on every page, so a bare `:target` in `dict_layout.css` applied
app-wide. Paired with `animation-fill-mode: forwards` — which outranks normal author declarations —
its terminal `transparent` keyframe permanently erased the background, box-shadow, and
border-radius of whatever the URL hash pointed at. Three symptoms, one cause: the No-JS reader TOC
dropdown rendered fully transparent over the passage text; `#sec-` permalink highlights were dead
in **both** JS and No-JS (the hash matches `:target` regardless of the `.target-highlight` class the
client adds); and the mobile No-JS dictionary drawer blanked when targeted. JS mode masked the TOC
case because the controller `preventDefault()`s the trigger click, so `:target` never fires.
The distinction that matters: `:target` is **ambient** (matches on hash alone, nothing opts in) and
must be scoped to a slice-owned ancestor, whereas `.target-active` is **opt-in** via core's
`flashElement()`, is self-scoping by construction, and is correctly left global — scoping it would
silently break every core caller. Note the combinator: `.dict-card :target` (descendant), not
`.dict-card:target`. Real dictionary deep-link anchors are descendants of a card, and the card
itself must not animate. Nothing caught this because no E2E or visual scenario opens the TOC drawer
or loads a `#sec-` deep link — see the selector-inventory item in Phase 7.

**Do not use `env(safe-area-inset-bottom)` without `viewport-fit=cover`.** We don't set
`viewport-fit=cover`, so Chrome and Safari report the inset as 0 and those `+ env(...)` terms did
nothing there. Firefox Android instead reports the system nav-bar height (~38px) and animates it
with its dynamic URL bar. The `.drawer` rule had `padding-bottom: env(safe-area-inset-bottom)` on
a fixed-height, `overflow: hidden` box, so Firefox's inset shrank the inner scroller and left a
blank, drawer-coloured band above the nav bar, sized with the inset. That was the "dead space" at
the bottom of the dictionary TOC and reader drawers after a slow scroll-up. The same term also
jostled every back-to-top/FAB offset during toolbar transitions. It was isolated with a standalone
bisection page (orphan branch `debug-repro`, `fixed_drawer.html`). If we ever adopt
`viewport-fit=cover`, reintroduce insets deliberately and test on Firefox Android.
