# UI V2 Code Health Backlog

A running, incremental backlog of code-quality work for `src/web/v2/`. Derived from a holistic
audit on 2026-09-13 (102 files, ~22,300 lines).

**How to use this file**

- Each `[ ]` item is scoped to be **one small, independently landable change**. Nothing here
  requires a mega-refactor.
- Check items off as they land. Delete a section once it is fully done.
- Sizes: 🟢 < 30 min · 🟡 an hour or two · 🔴 half a day+
- When adding new debt, add it here rather than a TODO comment, so it stays reviewable.

**Audit summary**: the architecture is sound — vertical slices, the `*.server`/`*.client`/`*.common`
suffix convention, the zero-JS baseline, and the `core/` primitives are all the right bones.
The recurring problem is that **the good abstractions in `core/` are only half-adopted**, and
**the conventions in [README.md](README.md) are documented but unenforced**.

> [!IMPORTANT]
> Prefer to land **Phase 2 (guardrails)** before doing the bulk of Phase 3/4 cleanup.
> The guardrails are what stop the cleanup from being re-accumulated.

---

## Phase 1 — Correctness & security

- [x] 🟢 **Fix DOM XSS in the reader dictionary sheet.** `?q=` reached `innerHTML` unescaped at
      five sites in `reader_view.client.ts`. `currentQuery` is assigned from `this.router.get()`
      at L49; `trimRawQuery()` does **not** strip `<`/`>` (they are `\p{Sm}`, not `\p{P}`), so a
      payload survived intact.
      **Done**: all five sites now route through one `setSheetLabel(query, showExpandHint)` helper
      that builds the `<strong>` via `textContent` + `replaceChildren`. The `<strong>` wrapper is
      load-bearing — `.v2-reader-sheet-label strong` in `core/drawer.css` supplies its color and
      weight — so it is preserved as a real element. Verified by three tests in
      `reader_view.test.ts`: the two behaviour tests pass against **both** the old and new code
      (proving output equivalence), and the XSS test fails against the old code (proving it
      actually catches the bug).
- [x] 🟢 **Escape the query in router error responses.** `v2_router.ts` interpolated the raw query
      into an HTML error string on the `/dicts` and `/dicts/id/:id` failure paths.
      **Done**: only the `format=partial` branches were affected — the full-page fallbacks already
      escaped via `renderDictPageHtml`. Rather than bolting on `he.escape`, the markup moved to a
      `renderDictErrorHtml(term, isIdSearch)` renderer beside the other `.v2-no-results` renderers
      in `dict_page.server.ts`, so the router no longer hand-builds HTML (a down-payment on the
      Phase 4 router split). Covered by four new tests; the two partial-path tests fail against the
      old code, and the two full-page tests now guard the previously-untested safe path.
- [x] 🟢 **Gate or delete `/api/completions/profile`.** A diagnostic endpoint on an unauthenticated
      GET that ran a **synchronous** `zlib.gzipSync` over up to **50,000** results (its `limit`
      defaulted to the maximum), blocking the event loop for the duration — an availability risk.
      **Done**: deleted rather than gated. It was added in `89d7ef35` to inform the 2-letter chunk
      caching work, which has shipped; it had zero callers, no tests, and was reachable only by
      typing the URL. Also removed the orphaned `onTiming` / `V2CompletionsTiming` plumbing it was
      the sole consumer of, which incidentally drops 6 `performance.now()` calls and 3
      `toFixed`/`Number` round-trips from the real completions hot path. `zlib` is no longer
      imported by the router. A guard test asserts the route 404s. If profiling is wanted again,
      prefer an offline `src/scripts/` entry over a production route.
- [ ] 🟢 **Pass an `AbortSignal` to the main results fetch.** `dict_search.client.ts` L587 omits it,
      so out-of-order responses overwrite the DOM. `LatestTask` is _already imported and used in
      this same file_ for autocomplete (L55), and `fetchAndSwapPartial` already supports
      `options.signal` and handles `AbortError` (`partial.client.ts` L53). Add
      `private readonly resultsTask = new LatestTask()` and pass `this.resultsTask.start()`.
      Also fixes the 3-concurrent-fetch storm when toggling dictionary checkboxes
      (`dict_settings.client.ts` L273 → `dict_search.client.ts` L332).
- [ ] 🟢 **Validate `localStorage` reads.** `reader_view.client.ts` L849 does
      `{ ...DEFAULT_PREFS, ...JSON.parse(stored) }` — malformed stored prefs bypass the type system.
      Reuse `matchesObject` / `typeOf` from `src/web/utils/rpc/parsing.ts`.

---

## Phase 2 — Guardrails (do these before the big cleanups)

- [ ] 🟡 **Add an auto-escaping `html` tagged template** in `core/html.common.ts`. There are
      currently **five** ways to escape: `he.escape`, `he.encode`, a hand-rolled `escapeHtml`,
      trusted-by-assumption, and the outright bugs above. `he.escape` and `he.encode` are used
      interchangeably for the same job within single files (e.g. `inflection_table.server.ts`
      L55-56 alternates between them on adjacent `<td>`s).

      > [!WARNING]
      > This helper **must not import `he`** — `he` is ~100 KB of CommonJS UMD and poorly
      > tree-shakeable, so a `.common.ts` importing it lands it in the client bundle. Use the
      > existing hand-rolled escape from `search_bar.common.ts` (see the note in Phase 5).

      ```ts
      const RAW = Symbol("raw");
      export type SafeHtml = { [RAW]: string };
      export const raw = (s: string): SafeHtml => ({ [RAW]: s });

      export function html(
        strings: TemplateStringsArray,
        ...values: unknown[]
      ): SafeHtml {
        let out = strings[0];
        for (let i = 0; i < values.length; i++) {
          const v = values[i];
          out +=
            v && typeof v === "object" && RAW in v
              ? (v as SafeHtml)[RAW]
              : escapeHtml(String(v ?? ""));
          out += strings[i + 1];
        }
        return raw(out);
      }
      ```

      Makes the safe path the default and the unsafe path explicitly `raw(...)` — greppable and
      reviewable. Migrate files opportunistically; no big-bang rewrite needed.

- [ ] 🟢 **Prefer `he.escape` over `he.encode`** in remaining server templates. `he.encode`
      entity-encodes all non-ASCII, which on Latin/Greek lexica is wasted CPU and payload on every
      render. Hot path: `xml_to_html.server.ts` L65 (runs per XML node).
- [ ] 🟡 **Enforce the target-suffix boundaries with ESLint.** There are currently **zero**
      violations — no `*.client.ts` imports a `*.server.ts`, none import Node builtins, and
      `.common.ts` imports neither. That discipline is real and worth protecting mechanically
      before it silently lapses. Add to `eslint.config.mjs`:

      ```js
      {
        files: ["src/web/v2/**/*.client.ts", "src/web/v2/**/*.common.ts"],
        rules: { "no-restricted-imports": ["error", { patterns: [{
          group: ["**/*.server", "fs", "path", "zlib", "he", "express"],
          message: "Client/common code must not import server-only modules.",
        }]}]},
      },
      {
        files: ["src/web/v2/**/*.server.ts", "src/web/v2/**/*.common.ts"],
        rules: { "no-restricted-imports": ["error", { patterns: [{
          group: ["**/*.client"],
          message: "Server/common code must not import client modules.",
        }]}]},
      }
      ```

- [ ] 🟢 **Add a client bundle size budget** to `src/bundler/v2.rsbuild.ts`. [README.md](README.md)
      claims "< 20 KB gzipped"; the minified bundle currently measures **21.0 KB gzipped**
      (74.5 KB raw). Either fix the claim or enforce it — right now nothing checks, so it will
      drift further. (CSS is a further 15.4 KB gzipped / 91.8 KB raw.)
- [ ] 🟢 **Give the four unsuffixed modules a tier**: `core/icons.ts`, `dict/dict_attribution.ts`,
      `reader/reader_types.ts`, `reader/reader_data.ts`. Renaming to `.common.ts` makes the
      convention total rather than mostly-true (and lets the lint rule above cover them).
- [ ] 🟢 **Document the `.common.ts` contract in [README.md](README.md)** as _"isomorphic logic
      **and** isomorphic rendering"_. See the Phase 5 note — this was investigated and the current
      usage is correct; it just isn't written down.

---

## Phase 3 — Adopt the abstractions we already built

Every item here is a feature reimplementing something `core/` already provides.

- [ ] 🟢 **Delete `stripMacrons()`** (`reader_view.client.ts` L378). The same file already imports
      `removeDiacritics` from `@/common/text_cleaning` (L11) and uses it 23 lines later at L401.
      Two normalization functions racing to disagree.
- [ ] 🟢 **Move `this.delegate(...)` out of the constructor** in `dict_suggestions.client.ts`
      L18-28. `BaseElement` clears disposables on disconnect, so if the element is ever moved or
      re-attached its delegation is silently gone forever. Move to `onConnect()`.
- [ ] 🟢 **Use `onConnect()` / `this.listen()` in `dict_toc.client.ts`** L21-25, which overrides
      `connectedCallback` directly and hand-manages `matchMedia` listeners, bypassing the
      `BaseElement` cleanup guarantee.
- [ ] 🟢 **Guard `BaseElement` against re-connection.** `connectedCallback` has no re-entry guard,
      so an element moved within the DOM runs `onConnect()` twice and double-registers listeners.
      Add `private hasConnected = false`, or document that `onConnect` must be idempotent.
- [ ] 🟢 **Delete the empty `initSummaryCapture()`** (`drawer.client.ts` L291-293) — a no-op method
      whose body is a comment saying the work happens elsewhere.
- [ ] 🟡 **Extract `core/disposable.client.ts`.** `DrawerController` hand-rolls four parallel
      unbind fields plus a `destroy()` (`drawer.client.ts` L56-59) — exactly `BaseElement.disposables`.
      A shared `DisposableBag { add(fn); dispose(); }` used by both removes ~40 lines of bookkeeping
      and the possibility of forgetting one.
- [ ] 🟡 **Extract `core/cookies.common.ts`.** The literal
      `; Path=/; Max-Age=31536000; SameSite=Lax` appears in four places
      (`dict_selection.server.ts` L102, `v2_router.ts` L269, `settings.client.ts` L87 and L125),
      and `DICT_COOKIE_NAME` is declared twice (`dict_selection.server.ts` L4 **and**
      `settings.client.ts` L64) — a client/server contract with two sources of truth.
- [ ] 🟢 **Reuse the repo's validator combinators** in `settings.client.ts` L14-36, which hand-writes
      a four-branch `typeof` validator that grows one block per setting.
      `src/web/utils/rpc/parsing.ts` already exports `matchesObject` and `typeOf`.
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

### `v2_router.ts` (626 lines)

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

- [ ] 🟢 **Move the inlined 404 page** (`v2_router.ts` L455-468, complete with an inline `style=`
      attribute) into `library/not_found.server.ts`.
- [ ] 🔴 **Split into `dict_routes.server.ts` / `reader_routes.server.ts` / `api_routes.server.ts`**,
      reducing `v2_router.ts` to mounting. Preserves the "single stable contract" in
      [README.md](README.md) while letting each vertical own its routes.

### `v2_bundle.ts` (274 lines)

Documented as "the client bundle manifest"; the first 10 lines are that, and the other **262** are
untested global behavior.

- [ ] 🟢 **Remove the production `console.log`** (L272).
- [ ] 🟢 **Move the `declare global { interface HTMLElement { showPopover… } }` block** (L139) into a
      `.d.ts` — it is also redundant with modern `lib.dom`.
- [ ] 🟡 **Split into `core/anchor_scroll.client.ts`, `core/back_to_top.client.ts`, and
      `dict/abbr_popover.client.ts`**, returning `v2_bundle.ts` to a ~12-line import list. The
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
- [ ] 🟢 Hoist magic numbers to named constants (drawer `18`/`48`/`88` dvh at L188-190; splitter
      `300`/`800`/`320` px at L517-519)
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

---

## Phase 5 — Investigated & resolved

Kept so these aren't re-litigated.

> [!NOTE] > **`search_bar.common.ts` exporting HTML renderers is CORRECT — do not "fix" it.**
>
> `renderLangChipsHtml` and `renderInflectChipHtml` are the only HTML-rendering functions in the
> entire `.common.ts` tier, and both are genuinely used on **both** sides, in strict parallel with
> `computeActiveLanguages`:
>
> |        | `computeActiveLanguages`    | `renderLangChipsHtml` | `renderInflectChipHtml` |
> | ------ | --------------------------- | --------------------- | ----------------------- |
> | Server | `search_bar.server.ts:42`   | `:43`                 | `:44`                   |
> | Client | `dict_search.client.ts:381` | `:382` (`innerHTML`)  | `:399` (`outerHTML`)    |
>
> The server paints the chips on initial load; the client must repaint **byte-identical** markup
> when the user toggles dictionaries without a reload. Splitting them into server/client copies
> would guarantee silent drift. They must also return HTML **strings** (the client assigns to
> `innerHTML`/`outerHTML`), so returning DOM nodes is not an option either.
>
> Corollary: the hand-rolled `escapeHtml` at `search_bar.common.ts` L49 is **also correct**, not a
> smell — it cannot use `he` without pulling ~100 KB of CommonJS UMD into the client bundle.

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

---

## Phase 7 — Docs & tests

- [ ] 🟢 **Remove the three stale "Lit" references** — there is no Lit dependency in
      `package.json`. One ships in the HTML of **every page**:
      `shell/page_shell.server.ts` L179 `<!-- UI V2 enhanced with Lit Web Components -->`.
      Also [TESTING.md](TESTING.md) L23 and [dict/README.md](dict/README.md) L19.
- [ ] 🟢 **Fix the stale test inventory** in [TESTING.md](TESTING.md) §1 — it lists 7 test files;
      there are 25. Replace the enumeration with a glob.
- [ ] 🟢 **Relocate `reader/reader_data.ts`** — 257 lines of hardcoded Caesar text in the production
      folder, imported **only** by `reader.test.ts`. Move to `testing/` (where
      `mock_reader_loader.ts` already correctly lives) or delete.
      **Cover the untested logic.** Well-tested today: SSR renderers, router routes, bitmask/clustering,
      dialog markup. Gaps:

- [ ] 🟡 `v2_bundle.ts` — all 262 lines of global behavior
- [ ] 🟢 Reader keyboard shortcuts (`reader_view.client.ts` L1028-1066)
- [ ] 🟡 Reader preference save/hydrate lifecycle (L806-984)
- [ ] 🟡 `DrawerController` snap thresholds and flick-velocity logic — extract the snap math to a
      pure function and test that directly

---

## Phase 8 — Performance

- [ ] 🟢 **Stop scanning every word to clear one class.** `reader_view.client.ts` L213-217 and
      L276-279 run `querySelectorAll(".v2-lat-word")` over ~3,000 nodes on _every_ word click, to
      remove a class present on exactly one element. Query `.v2-word-active` instead.
- [ ] 🟡 **Don't tokenize the whole chapter synchronously on mount.** `reader_view.client.ts`
      L357-360 blocks the main thread in `onConnect` — a long task that delays INP. Batch via
      `requestIdleCallback`.
- [ ] 🟢 **Hoist `getBoundingClientRect()` out of `pointermove`** (`reader_view.client.ts` L516) —
      forces a reflow at ~60 Hz while dragging. Measure once in `onStart`.
- [ ] 🟢 **Stop `fs.existsSync` on the render hot path.** `shell/asset_manifest.server.ts` L18-23
      does up to 2 syscalls per page render. Check once at boot, or on a timer in dev only.
- [ ] 🟡 **Lazy-load the two heavy verticals.** `v2_bundle.ts` L1-10 eagerly bundles everything, so
      reader users download the full dictionary interaction matrix and vice versa. Gate behind
      `document.querySelector(...)` + dynamic `import()`.
