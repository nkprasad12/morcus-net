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
- [x] 🟢 **Escape the query in router error responses.** `v2_router.server.ts` interpolated the raw query
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
- [x] 🟢 **Pass an `AbortSignal` to the main results fetch.** `dict_search.client.ts` L587 omitted
      it, so out-of-order responses overwrote the DOM.
      **Done**, but generalized rather than patched. Adding a second `LatestTask` field would have
      been the fourth hand-rolled lifetime in the codebase, so the primitives moved into
      `BaseElement`: `this.signal` (aborts on disconnect), `this.latest(lane)` (aborts the previous
      request in that lane) and `this.cancel(lane)`. Lanes are a typed union on the class so an
      undeclared lane is a compile error. They are independent because `MorcusDictSearch` genuinely
      runs completions and results concurrently and neither may cancel the other.
      `FetchAndSwapOptions.signal` is now **required**, so future call sites have to decide.
      Two fetches are deliberately left uncancellable, each with a comment saying why:
      `dict_chunk_cache.client.ts` (shared in-flight promise — aborting for one caller poisons the
      cache for all) and `report_dialog.client.ts` (a POST mutation should still land).
      Fixing this surfaced a second bug: `fetchAndSwapPartial` captured and restored the container's
      inline opacity, so with overlapping requests the live one could be left permanently dimmed.
      An aborted request now leaves the container to whichever request is still live.
      Verified by reverting the client changes — the two supersession tests fail against the old
      code while the behavior tests pass against both.
      Still open: the 3-concurrent-fetch storm when toggling dictionary checkboxes
      (`dict_settings.client.ts` L273 → `dict_search.client.ts` L332) is now harmless rather than
      corrupting, but it should still be coalesced.
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
- [x] 🟡 **Enforce the target-suffix boundaries with ESLint.** There were **zero** violations — no
      `*.client.ts` imported a `*.server.ts`, none imported Node builtins, and `.common.ts` imported
      neither. That discipline was real and worth protecting mechanically before it silently lapsed.
      **Done**: three mutually-exclusive blocks at the bottom of `eslint.config.mjs`, sharing
      `NO_RELATIVE_IMPORTS` / `NO_SERVER_ONLY_IMPORTS` / `NO_CLIENT_IMPORTS` pattern constants.
      The draft sketched here needed two corrections, both found by testing rather than reading.
      First, ESLint flat config **replaces** a rule's options rather than merging them, so
      re-declaring `no-restricted-imports` for V2 files switched the repo-wide relative-import ban
      back **off** for exactly the files the new blocks were meant to constrain; each block now
      re-states it. Second, the drafted two-block form listed `.common.ts` under both the client and
      the server block, so the later one won and `.common.ts` silently kept only the client ban.
      Measured: against a `.common.ts` probe importing a `*.client`, a `*.server` and `he`, the
      drafted config reports **1 of 3**; the landed config reports **3 of 3**.
      `he` is banned by name for browser-bound code, so the Phase 5 invariant (importing it would
      drag ~100 KB of CommonJS into the bundle) is now mechanical rather than a comment.
      Verified with throwaway probe files in each tier: every ban fires with its intended message,
      while `fs` in a `*.server.ts` stays allowed — confirming the rules are tier-specific and not a
      blanket ban. Deliberately **not** covered: `*.test.ts` (colocated tests legitimately exercise
      both tiers, and `foo.client.test.ts` ends in `.test.ts` so it falls outside the globs), and
      the four unsuffixed modules in the next item, which no glob can match until they are renamed.
- [ ] 🟢 **Add a client bundle size budget** to `src/bundler/v2.rsbuild.ts`. [README.md](README.md)
      claims "< 20 KB gzipped"; the minified bundle currently measures **21.0 KB gzipped**
      (74.5 KB raw). Either fix the claim or enforce it — right now nothing checks, so it will
      drift further. (CSS is a further 15.4 KB gzipped / 91.8 KB raw.)
- [x] 🟢 **Give the four unsuffixed modules a tier**: `core/icons.ts`, `dict/dict_attribution.ts`,
      `reader/reader_types.ts`, `reader/reader_data.ts`. Renaming makes the convention total rather
      than mostly-true, which matters more than tidiness: a file with no target suffix matches no
      glob, so the lint rule above could not see these four at all.
      **Done**, but not all to `.common.ts` — the tier was chosen per file from actual usage rather
      than applied uniformly. `core/icons.ts` → **`.common.ts`**: genuinely dual-tier (5 server
      importers, 3 client), and its own docstring already claimed as much.
      `dict/dict_attribution.ts` → **`.server.ts`** and `reader/reader_types.ts` → **`.server.ts`**:
      both are Node-free and DOM-free, so `.common.ts` would have been _safe_, but nothing on the
      client imports either (the reader client does not reference citation concepts at all), and
      labelling a module isomorphic when no client uses it asserts a contract nobody tests. Tighter
      is the honest default; both are a one-line rename away if the client ever needs them.
      `reader/reader_data.ts` had no right answer among the three tiers because it is test fixture
      data, so it moved to `testing/` instead — that is the Phase 7 relocation item, done here
      because the two items are the same physical change and doing them separately would have
      touched the file twice.
      Verified the hole is actually closed with a controlled probe: the same one-line `import he`
      file reports **0** errors when unsuffixed and **1** when named `.common.ts`. Then confirmed on
      the real files — a deliberate violation injected into each of the three renamed modules is
      caught (3/3), where before the rename none of them were linted at all.
      **Follow-up, same day**: doing this exposed that the four named modules were not the whole
      gap — `v2_router.ts` and `v2_bundle.ts` were also unsuffixed, exempted by the
      "Root Integration Hubs" rule in [README.md](README.md). That exemption was backwards for
      `v2_bundle.ts`, which is the Rsbuild entry point and therefore the root of everything shipped
      to the browser: it was the single most valuable file to protect and the only browser-bound one
      no rule covered. Both are now `v2_router.server.ts` and `v2_bundle.client.ts`, and the README
      rule says explicitly that being an entry point is not an exemption. The rename is invisible to
      the build because Rsbuild interpolates `[name]` from the entry _key_, not the source path —
      verified by rebuilding and confirming the emitted `v2_bundle.7e3597c7bbe48ef0.js` and
      `manifest.json` are unchanged.
- [ ] 🟢 **Document the `.common.ts` contract in [README.md](README.md)** as _"isomorphic logic
      **and** isomorphic rendering"_. See the Phase 5 note — this was investigated and the current
      usage is correct; it just isn't written down.
      Partly addressed: the suffix list in README rule 2 now has a `.common.ts` entry, but it only
      states the _restriction_ ("safe in both tiers"). The actual contract — that a `.common.ts` may
      legitimately export HTML **renderers**, not just logic, when server and client must emit
      byte-identical markup — is still undocumented. That is the part worth writing down, since it
      is the non-obvious half and the reason `search_bar.common.ts` looks wrong but isn't.
- [ ] 🟢 **Hold V2 to the three rules the legacy code can't pass.**
      `@typescript-eslint/no-unused-vars`, `no-non-null-assertion` and `no-explicit-any` are
      disabled repo-wide in `eslint.config.mjs`, presumably because the older React code cannot
      satisfy them. V2 is new code and need not inherit that ceiling. Measured against
      `src/web/v2`, the split between production and test code is decisive:

      | rule | prod | test |
      | --- | --- | --- |
      | `no-non-null-assertion` | 10 | 98 |
      | `no-explicit-any` | 3 | 19 |
      | `no-unused-vars` | 2 | 0 |

      So the headline count (131) is misleading — **90% of it is test files**, where `el.querySelector(...)!`
      is idiomatic and worth keeping. Enable these for V2 production code only; the config already
      has a `**/*.test.ts*` override block to hang the exemption on. That leaves 15 real fixes
      across 6 files (`entry_view.server.ts`, `xml_to_html.server.ts`, `library.server.ts`,
      `reader_loader.server.ts` for the assertions; `core/base_element.client.ts` and
      `core/task.client.ts` for the `any`s — both in the `listen()` overload chain).
      The two `no-unused-vars` hits are real dead parameters in `dict_search.client.ts` L83/L87.

      > [!WARNING]
      > Same flat-config trap the target-suffix work hit: re-declaring a rule **replaces** its
      > options rather than merging them. Keep this block to rules the three tier blocks don't
      > touch, or it will silently undo their `no-restricted-imports` bans.

      Also worth noting: `plugin:react/recommended` and `react-hooks/recommended` are applied to V2,
      which contains no React. Inert today, but the hooks rules key off functions named `use*`, so
      it is a latent false-positive source.

- [ ] 🟡 **Enable the type-checked rules for V2 — the expensive part is already paid for.**
      `parserOptions: { project: true }` makes the parser build a full TypeScript `Program`,
      resolving the whole import graph. Measured on `src/web/v2` (102 files, two runs each):

      | | wall | peak RSS |
      | --- | --- | --- |
      | with `project: true` | 12.3 s / 16.7 s | ~868 MB |
      | without | 9.5 s / 7.6 s | ~475 MB |

      Type-awareness therefore costs about **+6 s and +390 MB** — a fixed, up-front cost incurred
      the moment `project` is set at all, and it currently buys exactly **three** rules
      (`prefer-find`, `prefer-readonly`, `no-confusing-void-expression`).
      `recommended-type-checked` adds ~40 more that reuse the same program.

      Measured cost of the full preset: **72 production + 104 test** violations. Land the two
      highest-value rules first, as their own change — they are the only ones that find latent bugs
      rather than style:
      - `no-misused-promises` (**7**, all in `v2_router.server.ts`): async handlers passed where a
        void return is expected. Express 4.22.2 does not await handler return values, so any
        rejection escaping an internal `try`/`catch` becomes an unhandled rejection — which on
        Node 22 terminates the process.
      - `no-floating-promises` (**9**, in `dict_search.client.ts`, `reader_view.client.ts`,
        `report_dialog.client.ts`): fire-and-forget calls from sync event handlers. Most are
        probably benign because the callee catches internally, but the rule forces that to be
        stated — `void this.foo()` for deliberate fire-and-forget — in the same spirit as the now
        required `FetchAndSwapOptions.signal`.

      The `no-unsafe-*` family (20 + 13 + 3 + 1 in production) is the bulk of the remainder and is
      mostly downstream of a handful of `any`s, so it should follow the item above rather than
      lead. `restrict-template-expressions` was the rule most likely to explode in an SSR codebase
      built on template strings; it reports only **9**, so that worry was unfounded.

      If lint latency becomes painful, the lever is `projectService: true` (typescript-eslint v8;
      we are on 8.38), which reuses the incremental program the editor already maintains, rather
      than giving up type-aware rules.

- [ ] 🟡 **Add `eslint-plugin-no-unsanitized`, configured to trust the `html` helper.** There are
      **13** `innerHTML` / `outerHTML` / `insertAdjacentHTML` / `createContextualFragment` sites in
      non-test V2 code, across `core/partial.client.ts`, `dict_greek.client.ts`,
      `dict_search.client.ts`, `dict_settings.client.ts`, `reader_view.client.ts` and
      `theme_toggle.client.ts`. Two of the three Phase 1 security fixes were exactly this sink.

      > [!IMPORTANT]
      > Land this **after** the `html` tagged-template item above, not before. The plugin can be
      > told which escapers are trusted:
      >
      > ```js
      > "no-unsanitized/property": ["error", { escape: { taggedTemplates: ["html"] } }]
      > ```
      >
      > That is what turns the helper from _available_ into _enforced_: every remaining raw
      > assignment becomes an error needing an explicit, reviewable disable. Adopted in the other
      > order it produces 13 `eslint-disable` comments and no behaviour change — which is precisely
      > the half-adoption failure mode named in the audit summary.

- [ ] 🟢 **Add `eslint-plugin-wc`, narrowly scoped.** The justifying rule is **`wc/no-typos`**: a
      misspelled `disconnectedCallback` is a _silent_ no-op, invisible to `tsc` (it is merely an
      unused method) and unfindable by review. Now that `BaseElement` disposal is what stands
      between us and leaked listeners and un-aborted fetches, a mistyped lifecycle hook is an
      expensive bug. `wc/no-invalid-element-name` and `wc/no-constructor-attributes` are cheap
      extras. Needs `settings: { wc: { elementBaseClasses: ["BaseElement"] } }`.

      > [!WARNING]
      > Turn **off** `wc/no-child-traversal-in-connectedcallback`. It exists because children may
      > not be parsed when `connectedCallback` fires — but `page_shell.server.ts` L180 loads the
      > bundle as `<script type="module">`, which is deferred, so upgrade always happens after
      > parsing completes. Light-DOM child traversal in `onConnect()` is correct for our SSR model,
      > and this rule would fire on nearly every component.

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
      (`dict_selection.server.ts` L102, `v2_router.server.ts` L269, `settings.client.ts` L87 and L125),
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
- [x] 🟢 **Relocate `reader/reader_data.ts`** — 257 lines of hardcoded Caesar text in the production
      folder, imported **only** by `reader.test.ts`. Move to `testing/` (where
      `mock_reader_loader.ts` already correctly lives) or delete.
      **Done**: moved to `testing/reader_data.ts` rather than deleted — `reader.test.ts` is its only
      consumer but is a real consumer, and `testing/` is already the accepted home for unsuffixed
      fixture modules. Landed together with the Phase 2 tier-assignment item, which had to resolve
      this same file: it was one of the four unsuffixed modules, and the reason it had no correct
      answer among `.client` / `.server` / `.common` is precisely that it is a fixture.
      **Cover the untested logic.** Well-tested today: SSR renderers, router routes, bitmask/clustering,
      dialog markup. Gaps:

- [ ] 🟡 `v2_bundle.client.ts` — all 262 lines of global behavior
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
- [ ] 🟡 **Lazy-load the two heavy verticals.** `v2_bundle.client.ts` L1-10 eagerly bundles everything, so
      reader users download the full dictionary interaction matrix and vice versa. Gate behind
      `document.querySelector(...)` + dynamic `import()`.
