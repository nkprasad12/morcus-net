# UI V2 Code Health Backlog

A running, incremental backlog of code-quality work for `src/web/v2/`. Derived from a holistic
audit on 2026-09-13 (102 files, ~22,300 lines).

**How to use this file**

- Each `[ ]` item is scoped to be **one small, independently landable change**. Nothing here
  requires a mega-refactor.
- Sizes: 🟢 < 30 min · 🟡 an hour or two · 🔴 half a day+
- When adding new debt, add it here rather than a TODO comment, so it stays reviewable.
- **When an item lands, move it to the `Landed` section as one line naming the commit** rather than
  leaving a write-up in place. Put the reasoning in the commit message. If the work turned up
  something counter-intuitive — a decision that looks wrong until you know why, or advice in this
  file that proved incorrect — add it to **Phase 5** so it is not rediscovered or undone. Keeping
  full post-mortems inline is what made this file 866 lines.

**Audit summary**: the architecture is sound — vertical slices, the `*.server`/`*.client`/`*.common`
suffix convention, the zero-JS baseline, and the `core/` primitives are all the right bones.
The recurring problem is that **the good abstractions in `core/` are only half-adopted**, and
**the conventions in [README.md](README.md) are documented but unenforced**.

> [!IMPORTANT]
> Prefer to land **Phase 2 (guardrails)** before doing the bulk of Phase 3/4 cleanup.
> The guardrails are what stop the cleanup from being re-accumulated.

---

## Phase 1 — Correctness & security

_(All items completed or resolved — see Landed and Phase 5 below)_

---

## Phase 2 — Guardrails (do these before the big cleanups)

- [ ] 🟡 **Fix the ~7 async-safety violations in `start_server.ts` / `web_server.ts`.** Filed off
      the back of the item above. Those two files are outside `src/web/v2`, so the new block does
      not cover them, but they are the process entry points: an unhandled rejection there takes
      down the whole server, V2 included. Small enough to do as a one-off without taking on the
      other ~86 legacy violations.

- [ ] 🟢 **Decide whether to enforce a bundle-size budget.** Deliberately deferred when the stale
      "< 20 KB gzipped" claims came out of [README.md](README.md): a budget is only useful once the
      prototype feature set stops moving, and until then it would just be a number someone bumps.
      Current baseline is **75.2 kB raw / 21.4 kB gzip**. Revisit when V2 feature work settles —
      and note the browserslist item below changes this number, so sequence the two.

- [ ] 🟡 **Decide on `eslint-plugin-compat` + a browserslist — deliberately, or not at all.** There
      is currently **no browserslist** anywhere (no `.browserslistrc`, no `package.json` key, no
      target in `v2.rsbuild.ts`), so browser-support questions get answered by guessing. That has
      already cost us once: `AbortSignal.any()` was the natural way to link a lane signal to the
      element lifetime in `BaseElement`, and it was rejected purely because support was unknowable.

      > [!CAUTION]
      > **Rsbuild reads browserslist too.** Adding one is not merely a lint-config change — it
      > changes transpilation targets, and therefore bundle output and size. Re-measure the bundle
      > in the same change, and sequence this with the bundle-budget item above so the effect is
      > visible rather than silent.

      Closing this as "won't do" is reasonable. It should be a decision, not a default.

- [ ] 🟢 **Bump `nwsapi` so jsdom can evaluate `:has()`.** jsdom's selector engine is currently
      **2.2.2**, which throws `unknown pseudo-class selector ':has(...)'` on `matches()` /
      `querySelector()`. That makes every `:has()` rule we ship untestable, and `reader.css` already
      has two load-bearing ones: L371 (`:has(.v2-drawer-minimized)`, drives the text panel's bottom
      padding) and L388 (`:has(.v2-is-dragging)`, suppresses its transition mid-drag). It also
      removed `:has()` from consideration when the drawer's drag-transition selector was fixed (see
      **Landed**), which is why that fix went through TypeScript instead.

      The fix is smaller than it looks — **nothing needs upgrading except the lockfile**. jsdom stays
      20.0.3 and jest stays 29.7.0; only the transitive `nwsapi` moves, and **2.2.27** already
      satisfies both `jsdom@20`'s `^2.2.2` and `jsdom@17`'s `^2.2.0` (the latter arrives via
      `@craftamap/esbuild-plugin-html`, and the two dedupe). Measured on a scratch install of
      jsdom 20.0.3 + nwsapi 2.2.27: `.v2-drawer:has(.v2-is-dragging)` matches correctly, with a
      non-matching control also behaving.

      > [!WARNING]
      > nwsapi backs `querySelector` for **every** jsdom test in the repo, not just V2 — so verify
      > with the full `npm run ts-tests`, not `ts-tests:v2`. Consider pinning via `overrides` so a
      > later `npm install` cannot silently resolve back down the `^2.2.x` range.

---

## Phase 3 — Adopt the abstractions we already built

Every item here is a feature reimplementing something `core/` already provides.

- [ ] 🟢 **Move `stripMacrons()` into `@/common/text_cleaning` as `removeMacrons`**
      (`reader_view.client.ts` L401). This item previously read "delete `stripMacrons()`, the file
      already imports `removeDiacritics`" — that is wrong, and acting on it would ship a visible
      regression. They are not two functions racing to disagree; they do different jobs.
      `stripMacrons` removes only `U+0304`/`U+0305` and re-normalizes to NFC, whereas
      `removeDiacritics` strips the entire `U+0300–U+036F` range plus `U+1DC0–1DFF` and
      `U+20D0–20FF`, and leaves the result decomposed. The decisive call site is L878, the
      **Show Macra** toggle: `w.textContent = show ? orig : this.stripMacrons(orig)`. Swapping in
      `removeDiacritics` there would also strip breves, diaereses and Greek accents from displayed
      text. The real smell is only that a text-normalization primitive lives as a private method on
- [ ] 🔴 **Extract `core/tokenize.client.ts`.** `dict_search.client.ts` L596-685 and
      `reader_view.client.ts` L385-422 independently implement
      `createTreeWalker(SHOW_TEXT)` → `processTokens` → fragment-swap-with-clickable-spans,
      with subtly different exclusion rules (~100 lines duplicated).

> [!NOTE] > **Dictionary selection is currently represented four ways**: base36 URL bitmask, the
> `morcus_dicts` cookie, `SEARCH_SETTINGS_KEY` as a semicolon-string in localStorage, and
> `GlobalSettings` JSON — each with its own parser. This is the most likely source of future
> "my settings didn't stick" bugs. Worth a deliberate consolidation pass eventually; at minimum,
> document the precedence ladder in one place next to one parser.

---

## Phase 4 — Decomposition

### `v2_router.server.ts` (626 lines)

- [ ] 🟡 **Extract `core/request_params.server.ts`** with `readDictParam`, `isPartialRequest`,
      `isEmbeddedRequest`, `readLimit`. Current duplication:

      | Repeated block | Occurrences |
      | --- | --- |
      | `toStringOrArray(req.query.d) ?? .dict ?? .in` | L88, L147, L239 |
      | `isPartial` derivation | L229, L359, L445, L529 |
      | `isEmbedded` derivation | L232, L362 |
      | `limit` parse + clamp | L93, L152 |
      | `res.setHeader("Content-Type", "text/html…")` | ~12× (Express does this automatically) |
      | reader render + error block | L485-509 ≡ L556-580 (**verbatim**) |
      | jump-redirect block | L472-483 ≡ L543-554 (**verbatim**) |

- [ ] 🟢 **Move the inlined 404 page** (`v2_router.server.ts` L455-468, complete with an inline `style=`
      attribute) into `library/not_found.server.ts`.
- [ ] 🔴 **Split into `dict_routes.server.ts` / `reader_routes.server.ts` / `api_routes.server.ts`**,
      reducing `v2_router.server.ts` to mounting. Preserves the "single stable contract" in
      [README.md](README.md) while letting each vertical own its routes.

### `v2_bundle.client.ts` (274 lines)

Documented as "the client bundle manifest"; the first 10 lines are that, and the other **262** are
untested global behavior.

- [ ] 🟢 **Remove the production `console.log`** (L272).
- [ ] 🟢 **Move the `declare global { interface HTMLElement { showPopover… } }` block** (L139) into a
      `.d.ts` — it is also redundant with modern `lib.dom`.
- [ ] 🟡 **Split into `core/anchor_scroll.client.ts`, `core/back_to_top.client.ts`, and
      `dict/abbr_popover.client.ts`**, returning `v2_bundle.client.ts` to a ~12-line import list. The
      abbreviation popover (L146-270) is dictionary-specific (`.lsHover`) but currently lives at the
      root, violating the vertical-slice rule. Note the three separate global `click`/`pointerdown`
      handlers share an implicit ordering contract via `e.defaultPrevented` (L73) — preserve that
      carefully, and add tests (this is currently the only V2 module with substantial logic and
      **zero** tests).

### `reader_view.client.ts` (1,110 lines — god class)

One class orchestrating ten unrelated subsystems: tokenization, splitter drag, mobile drawer, TOC,
bibliography modal, settings dialog, keyboard shortcuts, dictionary sheet, URL sync, highlights.

- [ ] 🔴 Extract `reader_settings.client.ts` ← L806-984 (`<morcus-reader-settings>`)
- [ ] 🟡 Extract `reader_toc.client.ts` ← L739-791
- [ ] 🟡 Extract `reader_layout.client.ts` ← L484-595 (desktop splitter)
- [ ] 🟢 Hoist the drawer's `18`/`48`/`88` dvh magic numbers to named constants. (The splitter's
      `300`/`800`/`320` px were named as part of the `pointermove` hoist, which had to touch the
      same expressions.)
- [ ] 🟡 Decouple client from SSR markup shape: L350-355 queries exact CSS selector chains
      (`p.v2-reader-paragraph`, `.v2-passage-latin .v2-reader-line`). Have `reader.server.ts` emit
      `data-tokenize-target="true"` and query that instead, so restyling can't silently break
      tokenization.

### Server-side render functions

- [ ] 🔴 **Split `dict_page.server.ts: renderDictResultsHtml`** (L22-239, 217 lines) into
      `renderNoResultsView`, `renderJumpNavigation`, `renderDictCard`.
- [ ] 🔴 **Split `dict_toc.server.ts: renderDictTocHtml`** (L93-337, 244 lines, up to 5 levels of
      nesting) into a model (`buildTocTree(results)`) and a view (`renderTocSenseList(tree)`).
      This is also the single biggest testability win available — it converts regex-matching against
      a giant HTML blob into plain data assertions.
- [ ] 🟡 **Split `reader.server.ts: renderReaderContentHtml`** (L122-609) into `renderTocDrawer`,
      `renderBiblioDialog`, etc.
- [ ] 🟢 **De-duplicate dictionary-name resolution.** The expression
      `DICT_NAMES[k] ?? LatinDict.BY_KEY.get(k)?.displayName ?? k.toUpperCase()` is copied at
      `dict_page.server.ts` L56 and L102, `dict_toc.server.ts` L117 and L240. Export one
      `resolveDictDisplayName(key)`.
- [ ] 🟢 **Convert trailing-boolean signatures to option objects**:
      `renderDictResultsHtml(query, results?, queriedDicts?, isInflected = true)`
      (`dict_page.server.ts` L22) and `renderDictLandingHtml(activeDicts?, isInflected = true)`
      (`dict_landing.server.ts` L63). `renderDictPageHtml` already does this correctly.
- [ ] 🟢 **Name the TOC visibility thresholds** in `dict_toc.server.ts` L86
      (`totalSenses < 4 && maxSingleEntrySenses < 3 && totalEntries <= 1`).
- [ ] 🟢 **Use or delete `linkifyText`'s `activeWord` parameter** (`dict/linkify.server.ts` L26).
      Its only caller, `xml_to_html.server.ts` L63, never passes it, so nothing emits
      `v2-word-active` server-side today. That makes it a latent trap rather than dead weight:
      reviving it would start emitting the class into dictionary-entry markup, and any reader code
      that clears `.v2-word-active` unscoped would then reach into the dictionary panel. The
      reader's clear is scoped and has a test pinning the scope, so the trap is contained — but the
      parameter should still be either wired up deliberately or removed.

---

## Phase 5 — Investigated & resolved

Findings that cost real time to establish and that would otherwise be rediscovered — or worse,
"fixed" back. This is not a changelog; see **Landed** for what shipped.

**Do not add `eslint-plugin-wc` — won't do.** Investigated and resolved with self-populating conformance testing instead. `eslint-plugin-wc`'s justifying rule (`wc/no-typos`) only checks W3C standard lifecycle methods (`connectedCallback`, `disconnectedCallback`, `attributeChangedCallback`, `observedAttributes`). In UI V2, `BaseElement` has fully centralized `connectedCallback` and `disconnectedCallback`; feature components implement `onConnect()` and `onDisconnect()`, which `eslint-plugin-wc` does not recognize or validate. Furthermore, `wc/no-invalid-element-name` keys off `customElements.define` AST nodes, missing registrations routed through `registerElement()`. Rather than adding an external dependency that does not inspect `onConnect`, lifecycle and reattachment correctness is mechanically enforced by `core/reattach_conformance.test.ts` paired with `v2_elements.client.ts` and `getRegisteredElementTags()`, asserting bidirectional fixture coverage and statically verifying all `registerElement` callers are imported in the manifest.

**The mobile TOC drawer flash does not exist — do not re-file it.** It was filed as a Phase 1
correctness bug on the theory that `dict_toc.client.ts` builds a `DrawerController` below 1080px and
that minimizing the drawer undoes the SSR state after paint. `DrawerController`'s constructor only
calls `initDrag` / `initKeyboard` / `initDetailsSync`; it never calls
`minimize()`, and nothing else writes `v2-drawer-minimized` on load. Sampling every animation frame
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
`NO_RELATIVE_IMPORTS`. Still live for the remaining Phase 2 items.

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
`getAsync` / `postAsync` registrars make each handler a one-line diff instead. Worth knowing for the
Phase 4 router split, which is the right moment to hoist `asyncHandler` into a shared home.

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
Furthermore, with the layout-read hoist landed (`0be16378`), `onMove` contains only arithmetic and
CSS variable writes (`--v2-drawer-height`, `--v2-dict-width`). Property writes do not force synchronous
layout; the browser merges them at paint time anyway. The real cost was layout _reads_ after writes,
which the hoist eliminated. Redundant rAF coalescing would add ~30 lines carrying a subtle
flush-on-`pointerup` footgun (without which the synthetic `<summary>` click suppression and
splitter width persistence silently break) for zero measurable gain.

---

## Phase 6 — CSS

Verified counts as of the audit.

- [ ] 🟡 **Add a z-index scale to `shell/variables.css`.** 17 declarations across 11 distinct
      values (`2, 10, 25, 50, 100, 105, 150, 200, 300, 1000`, plus one `z-index: 10 !important`)
      spread over 8 files — nobody can reason about stacking.

      ```css
      --v2-z-raised: 10;  --v2-z-overlay: 50;  --v2-z-drawer: 100;
      --v2-z-nav: 300;    --v2-z-toast: 400;   --v2-z-modal: 1000;
      ```

- [ ] 🟡 **Reduce `!important` — 78 instances**, concentrated in:

      | Count | File |
      | --- | --- |
      | 26 | `dict/dict_toc.css` |
      | 22 | `reader/reader.css` |
      | 10 | `v2.css` |
      | 10 | `dict/dictionary.css` |
      | 9 | `core/drawer.css` |
      | 1 | `library/library.css` |

      Mostly `display: none !important` used for state toggling, plus a few hard layout overrides
      (`height: 54px !important`). Introduce a `.v2-hidden` utility (or the native `hidden`
      attribute) and drive state from a single ancestor class. `dict_toc.css` is the best
      starting point.

- [ ] 🟢 **Add the ~5 missing semantic color tokens.** Color-token discipline is largely _good_:
      102 of 125 hex values live correctly inside `variables.css` / `critical_variables.css`.
      Only **23 leak**, clustered in `dialog.css` (6, status colors), `library.css` (5, language
      badges), `reader.css` (4), `dictionary.css` (4), `search.css` (3), `dict_settings.css` (1).
      Adding `--v2-success`, `--v2-danger`, `--v2-on-accent` closes most of it.
- [ ] 🟢 **Stop branching themes inside component stylesheets.** e.g. `dialog.css` L255-264
      (`:root[data-theme="dark"] .v2-report-status.success { color: #5cdb95; }`). Put the flip in
      the token instead.
      **Extract shared component classes.** These shells are re-declared per feature — each row is one
      independently landable change:

| Extract               | Replaces                                                                                          | Notes                                               |
| --------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `.v2-card`            | `.v2-work-card`, `.v2-dict-card`, `.v2-landing-card`, `.v2-reader-text-card`, `.v2-settings-card` | all are `card-bg + 1px border + radius + shadow`    |
| `.v2-btn` + modifiers | `.v2-work-card-btn`, `.v2-reader-continue-btn`, `.v2-reader-return-btn`, `.v2-settings-btn`       | extend the existing `.v2-btn` in `dialog.css`       |
| `.v2-empty-state`     | `.v2-library-empty-state`                                                                         | the inlined router 404 already wants this           |
| `.v2-ghost-scrollbar` | —                                                                                                 | polished in `reader.css` L169-208, absent elsewhere |

- [ ] 🟡 Extract `.v2-card`
- [ ] 🟡 Extract `.v2-btn` + modifiers
- [ ] 🟢 Extract `.v2-empty-state`
- [ ] 🟢 Extract `.v2-ghost-scrollbar`

**Split the two large stylesheets** along their existing section comments:

- [ ] 🔴 `dictionary.css` (1,795) → layout / typography / embeds / landing
- [ ] 🔴 `reader.css` (1,552) → layout / text / dict-sidebar / settings. Note its settings block
      (L1432+) substantially mirrors `dict_settings.css` — merge into a shared `core/settings.css`.

**Other:**

- [ ] 🟢 Add spacing and radius scales (`--v2-space-*`, `--v2-radius-sm/md/lg`) — currently ~300
      arbitrary `padding`/`margin`/`border-radius` values (e.g. `reader.css` mixes `3px`/`6px`/`8px`
      radii; `library.css` L65 uses `10px 100px 10px 42px`).
- [ ] 🟡 **Add Stylelint — ESLint cannot see CSS, so every item in this phase is unenforceable.**
      The ESLint guardrails in Phase 2 protect the TypeScript; nothing protects the stylesheets, and
      this phase is the larger pile of debt: **78** `!important` declarations, **23 of 125** hex
      colours living outside the two token files, and **11** distinct z-index values across 17
      declarations. `stylelint-declaration-strict-value` can require that colours and z-index come
      from custom properties, which converts each cleanup below from a one-off sweep into an
      invariant.
      Start warn-only and ratchet. The value is stopping the _next_ hardcoded colour, not
      relitigating the existing 23 — otherwise this blocks on the full token migration and
      therefore never lands.

---

## Phase 7 — Docs & tests

- [ ] 🟢 **Remove the three stale "Lit" references** — there is no Lit dependency in
      `package.json`. One ships in the HTML of **every page**:
      `shell/page_shell.server.ts` L179 `<!-- UI V2 enhanced with Lit Web Components -->`.
      Also [TESTING.md](TESTING.md) L23 and [dict/README.md](dict/README.md) L19.
- [ ] 🟢 **Fix the stale test inventory** in [TESTING.md](TESTING.md) §1 — it lists 7 test files;
      there are 25. Replace the enumeration with a glob.
- [ ] 🟢 **Update the `.common.ts` contract in [README.md](README.md) for `SafeHtml`.** L68-71 now
      describes code that no longer exists: it says renderers "return HTML strings" that the client
      assigns to `innerHTML` / `outerHTML`, and that they "must hand-roll their escaping" via the
      local `escapeHtml` in `search_bar.common.ts`. That escaper is gone, the renderers return
      `SafeHtml`, and the client goes through `setHtml` / `replaceWithHtml`. The underlying reason
      is unchanged and should stay — `he` cannot enter the client bundle — but the mechanism is now
      `core/html.common.ts`. Check the safe-DOM paragraph near L11 in the same pass.

- [ ] 🟡 **Stop the Firefox baselines going stale again.** The baselines were all re-recorded when
      the suite moved to viewport + coverage shots, so the matrix is green today, but nothing
      prevents the drift recurring. `./morcus.sh e2e --visual` runs Chromium and MobileChrome only,
      while `--update` is almost always run through that fast path; the `firefox` and
      `FirefoxSmallScreen` baselines then sit at whatever the last `--all` run wrote. That is how
      they reached 48 / 64 failing: the refresh at `8e04058a` covered the fast pair, and two days
      later Firefox was still rendering the old about page (baseline 1163px tall, actual 1171px —
      a pure size mismatch, no pixel differences). Options are to make `--update` refuse to run
      without `--all`, or to run the full matrix in CI so the gap cannot open silently.

**Cover the untested logic.** Well-tested today: SSR renderers, router routes, bitmask/clustering,
dialog markup. Gaps:

- [ ] 🟡 `v2_bundle.client.ts` — all 262 lines of global behavior
- [ ] 🟢 Reader keyboard shortcuts (`reader_view.client.ts` L1028-1066)
- [ ] 🟡 Reader preference save/hydrate lifecycle (L806-984)
- [ ] 🟡 `DrawerController` snap thresholds and flick-velocity logic — extract the snap math to a
      pure function and test that directly

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
      full text panel and all of its inline word spans. This is what makes the two drag items above
      expensive rather than merely wasteful, so it is worth measuring after they land — it may be
- [ ] 🟡 **Lazy-load the two heavy verticals.** `v2_bundle.client.ts` L1-10 eagerly bundles everything, so
      reader users download the full dictionary interaction matrix and vice versa. Gate behind
      `document.querySelector(...)` + dynamic `import()`.

---

## Landed

One line per completed item, grouped by the phase it came from. The commit messages carry the full
reasoning deliberately, so it does not have to live here; anything counter-intuitive enough to be
worth not rediscovering is summarised in Phase 5 instead.

**Phase 1 — correctness & security**

- **DOM XSS in the reader dictionary sheet.** `?q=` reached `innerHTML` unescaped at five sites;
  all five now route through one `setSheetLabel()` built from `textContent`. (`1ba4ccd2`)
- **Escaped the query in router error responses.** Only the `format=partial` paths were affected;
  the markup moved to a `renderDictErrorHtml` renderer in `dict_page.server.ts` rather than being
  patched in the router. (`b9e16df9`)
- **Deleted `/api/completions/profile`.** An unauthenticated GET running a synchronous
  `zlib.gzipSync` over up to 50,000 results, with zero callers. (`a8ce5b91`)
- **Abort signals for the results fetch.** Generalised into `BaseElement` rather than patched:
  `this.signal`, `this.latest(lane)`, `this.cancel(lane)`, and `FetchAndSwapOptions.signal` is now
  required so future call sites have to decide. (`948a5349`, `fee5c5b0`)
- **Validated both localStorage stores via per-field partial combinators.** Extracted `pickValid` in
  `core/settings.client.ts` and added `isLiteral` to `parsing.ts`, replacing `parseSettings`'s four
  imperative `typeof` checks and fixing unvalidated `ReaderPreferences` deserialization in
  `reader_view.client.ts` with graceful fallback to defaults. (`6cf9dd90`)

**Phase 2 — guardrails**

- **Target-suffix import boundaries enforced by ESLint**, including the `he` ban for browser-bound
  code. There were zero pre-existing violations — the discipline was real and is now mechanical.
  (`06da3c29`)
- **The four unsuffixed modules given a tier**, then `v2_router.ts` and `v2_bundle.ts` as well: the
  "root integration hubs" exemption was backwards for the browser entry point, the single most
  valuable file to protect. (`acb202cf`, `112c66b0`)
- **The `.common.ts` contract documented in README.** (`68ed93e2`)
- **Stale "< 20 KB gzipped" bundle claims removed from README.** (`cd1c2d35`)
- **`no-floating-promises` and `no-misused-promises` enabled for V2**, with an `asyncHandler` +
  `getAsync` / `postAsync` wrapper in the router. Two of the seven async handlers were live crash
  paths: `/reader` and `/reader/:author/:name/:page?` both awaited before entering any `try`.
  (`4c89fa88`, `83f1f6f8`)
- **`core/html.common.ts`** — an auto-escaping `html` tagged template with `raw`, `joinHtml` and
  `escapeHtml`, plus the typed `setHtml` / `replaceWithHtml` sinks in `core/dom.client.ts`. Removed
  `search_bar.common.ts`'s private escaper, one of the five escape paths. (`37a6746a`)
- **`eslint-plugin-no-unsanitized` enforcing it.** Every raw HTML sink in V2 production code is now
  either typed or an audited disable; two turned out to be false positives better fixed with
  `textContent`, and one is the documented network trust boundary in `core/partial.client.ts`.
  (`ec3aa77f`)
- **`no-unused-vars`, `no-non-null-assertion` and `no-explicit-any` enabled for V2 production code.**
  All three are off repo-wide for the legacy React code; tests stay exempt, which is what made this
  15 fixes instead of 140. No fix needed a suppression: the assertions were all `has`-then-`get`
  Map lookups or `Boolean()` guards that had thrown the narrowing away, and both `any`s in the
  `debounce` constraint became `never[]`. The one exemption left is a single cast in `listen()`.
- **Stop applying React plugins to V2.** `plugin:react/recommended`, `plugin:react-hooks/recommended`,
  plugin registration, version detection, and custom rules scoped out of `src/web/v2/**` to eliminate
  latent false positives on `use*` helper functions.
- **`he.escape` preferred over `he.encode` across all server templates**, with an ESLint guardrail
  banning `he.encode` on server code. Eliminates entity-encoding of Greek, macrons, and symbols on
  the render hot path (`xml_to_html.server.ts` L65).
- **`recommended-type-checked` rules enabled for V2 production code.** Captures full value of the
  `parserOptions: { project: true }` program already running; 35 production violations resolved
  with zero type assertions, and tests exempt for dynamic fixture/mock typing.
- **`eslint-plugin-wc` evaluated and superseded by `v2_elements.client.ts` + conformance self-population.** `BaseElement` centralized native callbacks; `reattach_conformance.test.ts` now mechanically verifies manifest coverage and bidirectional fixture completeness.

**Phase 3 — adopt the abstractions we already built**

- **Suggestion selection survives a re-attach.** `BaseElement` clears disposables on disconnect, so
  anything registered once outside `onConnect()` is gone for good the first time an element moves.
  `dict_suggestions.client.ts` delegated from its constructor; `dict_search.client.ts` registered its
  `suggestion-select` listener inside the guard that creates the child exactly once. Both had to move
  — fixing only the child left it emitting to nobody.
- **The `onConnect` idempotency contract, documented on `BaseElement` and enforced by
  `core/reattach_conformance.test.ts`.** The test moves all nine registered elements and fails on any
  listener torn down by `dispose()` that is not put back. It found a third instance immediately —
  `reader_view.client.ts` guarded its passage `keydown` behind a `data-enhanced` marker, which lives
  in the DOM and so outlives the disconnect, permanently killing keyboard word selection after a
  move. Verified against all three bugs: reverting each one turns the corresponding case red.
  Resolves the "does `BaseElement` need a re-connection guard" question — no, it needs a documented
  contract and a test; a `hasConnected` flag would break the legitimate move-and-reconnect path.
- **Use `onConnect()` and `this.listen()` in `dict_toc.client.ts`**, eliminating manual
  `connectedCallback`/`disconnectedCallback` overrides, managing mediaQuery listeners via
  `BaseElement` disposables, and consolidating drawer teardown.
- **Extract `core/disposable.client.ts` with `DisposableBag`**, unifying cleanup across `BaseElement`,
  `DrawerController`, and `setupModalDialog` while preserving FIFO teardown and re-entrant safety without latches.
- **Extract `core/cookies.common.ts` and `dict/dict_preferences.client.ts`**, providing pure isomorphic
  cookie primitives (`readCookie`, `hasCookie`, `formatCookie`), unifying dictionary and inflection
  cookie formatting in `dict_selection.common.ts`, and relocating misplaced dictionary stores out
  of `core/settings.client.ts`.

**Phase 7 — docs & tests**

- **`reader/reader_data.ts` relocated to `testing/`** — it is test fixture data, which is why it had
  no right answer among the three target suffixes. (`acb202cf`)
- **The six unphotographable mobile dictionary baselines.** Filed as a drawer bug; it was the
  harness. `fullPage` captures on `isMobile` contexts walk the scroll offset, so `toHaveScreenshot`
  never converged. The scenario now locks the offset in-page before asserting, and the six baselines
  were re-recorded from stable frames.
- **The visual suite now shoots the viewport, not the whole page.** Every scenario's primary
  baseline is a viewport capture — the only one that shows `position: fixed` chrome where a user
  sees it — over the full js/theme/browser matrix. Below-the-fold coverage moved to one
  `-coverage.png` per scenario per browser, capped at three viewports. 176 baselines / 58MB became
  160 / ~25MB, and the 29135px library-landing image nobody could review is gone.

**Phase 8 — performance**

- **The drawer's drag-transition escape hatch.** `v2-is-dragging` was applied to the handle while
  three CSS rules were written against the panel, so the panel kept its 250 ms transition live for
  the whole drag and rubber-banded after the pointer. Fixed in TypeScript, not by rewriting the
  rules with `:has()` — which jsdom cannot currently evaluate, so it would have shipped untested.
  (`8b996e21`)
- **The two universal `user-select` overrides deleted.** `body.v2-resizing-* *` forced a
  whole-document style recalculation twice per drag while only ever overriding `none` with `none`.
  (`8b996e21`)
- **Stopped scanning every word to clear one class** on each word click in the reader. The scope
  `.v2-reader-text-panel` in the query is load-bearing, because `linkifyText` can emit the same
  class into the dictionary panel. (`a4e2a276`)
- **Stop `fs.existsSync` on the render hot path.** Deleted the per-render asset file existence
  checks in `shell/asset_manifest.server.ts` and cache the parsed manifest on first access. (`6f5b6d75`)
- **Hoisted the per-move layout reads out of both drags.** The splitter measured its container on
  every `pointermove`, immediately after the previous move wrote `--v2-dict-width`; the drawer read
  `window.innerHeight` the same way. Both are now measured once in `onStart`, so the move handlers
  are pure arithmetic plus writes. Pinned by read-counting tests rather than by the resulting
  geometry, which the hoist leaves unchanged. (`0be16378`)
- **Coalescing pointer drags to animation frames closed as won't-do.** Browser input alignment
  already delivers at most one `pointermove` per frame (measured `max 1/fr`, `burst 0/48` on heaviest
  reader text), and the hoist above leaves only property writes which the compositor merges anyway;
  see Phase 5.
