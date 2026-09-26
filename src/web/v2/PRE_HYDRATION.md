# UI V2 Pre-Hydration & Progressive Upgrade Audit

Analysis and backlog for bugs that occur during the **Pre-Hydration Window** — the interval after first paint when a JavaScript-enabled user views and interacts with server-rendered HTML before `/v2/assets/v2.js` finishes downloading, parsing, and upgrading custom elements.

> [!NOTE]
> General code-quality debt is tracked in [CODE_HEALTH.md](CODE_HEALTH.md), and dictionary preference storage/resolution defects are tracked in [dict/PREFERENCES.md](dict/PREFERENCES.md). Items here are referenced as `PH0`–`PH12`.

---

## 1. The Pre-Hydration Window

Every UI V2 page load follows a three-stage lifecycle in [`page_shell.server.ts`](shell/page_shell.server.ts):

1. **Synchronous `<head>`**: Inlined [`v2-critical.css`](v2-critical.css) and synchronous inlined [`critical_theme.client.ts`](shell/critical_theme.client.ts) execute, followed by `<link rel="stylesheet" href="/v2/assets/v2.css">`.
2. **First Paint (SSR HTML)**: `<body>` renders the server-generated HTML immediately.
3. **Deferred Module Upgrade (`v2.js`)**: `<script type="module" src="/v2/assets/v2.js"></script>` downloads and executes asynchronously ([`v2_bundle.client.ts`](v2_bundle.client.ts)), registering all custom elements ([`v2_elements.client.ts`](v2_elements.client.ts)) and adding `.has-js` to `document.documentElement`.

Our architecture and test suites explicitly planned for **No-JS** (scripting disabled) and **Post-Hydration JS** (`v2.js` loaded), but did not systematically account for a **JS-enabled user interacting with the page between Stage 2 and Stage 3** (e.g., on slow mobile networks, cold caches, or if `v2.js` is later split into lazy route chunks).

---

## 2. Root Cause: Four Disjoint Definitions of "Is JS Active?"

UI V2 currently uses four different mechanisms to distinguish "No-JS" from "JS-enhanced". During the pre-hydration window on a JS-enabled browser, **two of them report JS = ON while the other two report JS = OFF**:

| Gate Mechanism             | State During Pre-Hydration (JS Enabled, Pre-`v2.js`)                                      | State After `v2.js` Executes | Current Usage in UI V2                                                                                                                                                     |
| :------------------------- | :---------------------------------------------------------------------------------------- | :--------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<noscript>`               | **JS = ON** (omitted by HTML parser)                                                      | **JS = ON**                  | Dictionary settings `"Apply"` button ([`search_bar.server.ts`](dict/search_bar.server.ts#L117-L121))                                                                       |
| `@media (scripting: none)` | **JS = ON** (query is false at first paint)                                               | **JS = ON**                  | Reader `Aa` settings button ([`reader_nav.css`](reader/reader_nav.css#L207-L211))                                                                                          |
| `:not(:defined)`           | **JS = OFF** (custom element not yet registered)                                          | **JS = ON**                  | `morcus-theme-toggle`, `morcus-report-dialog` ([`v2-critical.css`](v2-critical.css#L106-L114)), `morcus-external-loader` ([`external.css`](external/external.css#L34-L53)) |
| `:root:not(.has-js)`       | **JS = OFF** (`.has-js` added at end of [`v2_bundle.client.ts`](v2_bundle.client.ts#L12)) | **JS = ON**                  | `.dict-width-group`, `.reader-teaser-nojs`, `.reader-dict-panel:target`, `.drawer-toc`                                                                                     |

### Design Principles for Pre-Hydration Safety

1. **Gate on Upgrade (`.has-js` / `:defined`), Not Parser Scripting (`<noscript>` / `@media (scripting)`):**
   - Controls that only work once a custom element is upgraded (e.g., `#reader-settings-btn`) should be hidden via `:not(:defined)` or `:root:not(.has-js)`, never `@media (scripting: none)`.
   - Conversely, No-JS form submit fallbacks (like the dictionary settings `"Apply"` button) should be hidden by CSS once upgraded (`morcus-dict-settings:defined .settings-noscript-actions { display: none; }` or `:root.has-js ...`) rather than wrapped in `<noscript>`. That way, the form remains submittable both before `v2.js` arrives and if `v2.js` fails to load on a flaky connection.
2. **Non-Destructive `onConnect()` Hydration:**
   - When `onConnect()` runs, the user may have already scrolled (`window.scrollY > 0`), typed into an `<input>`, toggled a `<details>` element or checkbox, or triggered a `:target` hash navigation. `onConnect()` must reconcile with live DOM state rather than blindly overwriting it.

---

## 3. Pre-Hydration Issues Backlog

Sizes: 🟢 < 30 min · 🟡 an hour or two · 🔴 half a day+

### A. Pre-Hydration User Input Clobbered or Ignored on Upgrade

- [ ] 🟡 **PH1 — `<morcus-dict-settings>`: Un-submittable pre-hydration popover & checkbox reset on upgrade** ([`dict_settings.client.ts`](dict/dict_settings.client.ts#L51-L65), [`dict_settings.client.ts`](dict/dict_settings.client.ts#L266-L305), [`search_bar.server.ts`](dict/search_bar.server.ts#L117-L121); see also `F5` in [`dict/PREFERENCES.md`](dict/PREFERENCES.md))

  - The gear `<details class="dict-settings-details">` opens natively before `v2.js` arrives, but its `"Apply"` submit button is inside `<noscript>`, so a JS-enabled user sees checkboxes with no Apply button and no `change` listener.
  - Worse, if the user ticks/unticks dictionary checkboxes or toggles `"Inflected search"` during this window, `MorcusDictSettings.onConnect()` runs `initActiveDicts()` → `syncUi()`, which unconditionally overwrites `cb.checked` and `inflectedCheckbox.checked` from the URL/`localStorage`, silently reverting the user's clicks.
  - **Fix**: Render `.settings-noscript-actions` outside `<noscript>` and hide it via CSS when `morcus-dict-settings:defined` (or `:root.has-js`) matches; in `onConnect()`, detect dirty pre-hydration checkbox changes or adopt the server/DOM state rather than clobbering user edits.

- [ ] 🟢 **PH2 — `<morcus-library-view>`: Pre-hydration typing in `#library-search-input` is ignored** ([`library_view.client.ts`](library/library_view.client.ts#L16-L26))

  - `#library-search-input` is visible and focusable at first paint. If a user types into it before `v2.js` loads, `MorcusLibraryView.onConnect()` only registers the `input` listener and initializes `this.currentQuery = ""` without reading `input.value`. The catalog remains unfiltered until the user types another character.
  - **Fix**: In `MorcusLibraryView.onConnect()`, if `input.value.trim()` is non-empty on mount, set `this.currentQuery = input.value.trim()` and call `this.applyFilters()`.

- [ ] 🟡 **PH3 — `<morcus-dict-search>`: Pre-hydration typing on landing page misfires initial results check** ([`dict_search.client.ts`](dict/dict_search.client.ts#L390-L421))

  - `enhanceExistingMarkup()` sets `const currentQuery = this.inputElement?.value.trim() ?? ""` from the live `<input>` rather than the URL's `?q=` parameter.
  - If a user on `/v2/dicts` (landing page, no `?q=`) starts typing into `input.input` before `v2.js` arrives:
    1. `currentQuery` is truthy, so `onConnect()` mistakes the landing page for a server-rendered results page and runs the `if (currentQuery && ...)` scroll branch.
    2. Autocomplete suggestions are not fetched for the characters already typed until the next `input` event.
  - **Fix**: Check the URL's `?q=` parameter (or presence of rendered result cards) to determine whether initial results were server-rendered; if `this.inputElement` is focused and its value differs from the URL's `?q=`, trigger `this.handleInput()` on connect to start autocomplete.

- [ ] 🟢 **PH4 — `<morcus-greek-embed>`: Pre-hydration `<details>` or checkbox toggle clobbered** ([`dict_greek.client.ts`](dict/dict_greek.client.ts#L43-L57))
  - `onConnect()` unconditionally sets `this.checkbox.checked = isAutoOpen` and `if (isAutoOpen) this.details.open = true`, overwriting any manual toggle the user performed before hydration.

---

### B. No-JS `:target` & `<details>` Fallbacks Desynchronizing JS Controllers

- [ ] 🟡 **PH5 — Reader TOC drawer (`#reader-toc-drawer:target`) gets stuck open if clicked before hydration** ([`reader.server.ts`](reader/reader.server.ts#L197-L209), [`reader_toc.css`](reader/reader_toc.css#L48-L51), [`v2.css`](v2.css#L50-L53), [`popover.client.ts`](core/popover.client.ts#L100-L197))

  - `#reader-toc-btn` is `<a href="#reader-toc-drawer">`. Both `[hidden]:not(.reader-toc-drawer:target) { display: none !important; }` ([`v2.css`](v2.css#L50)) and `.reader-toc-drawer:target { display: flex; }` ([`reader_toc.css`](reader/reader_toc.css#L48)) apply unconditionally even after `.has-js` is added.
  - If a user clicks `#reader-toc-btn` before `v2.js` loads, `location.hash` becomes `#reader-toc-drawer` and CSS `:target` displays the drawer.
  - When `v2.js` loads, `AnchoredPopoverController` initializes with `_isOpen = false`:
    - Escape and outside clicks do nothing (`_isOpen` is `false` and `#reader-toc-backdrop` remains `hidden`).
    - Clicking `#reader-toc-btn` calls `toggle()` → `open()` instead of closing it.
    - Calling `close()` sets `panel.hidden = true`, which **still cannot hide the drawer** because `location.hash` is `#reader-toc-drawer` and `[hidden]:not(.reader-toc-drawer:target)` exempts `:target`.
  - **Fix**: Scope the CSS `:target` override to `:root:not(.has-js)` (i.e. `[hidden]:not(:root:not(.has-js) .reader-toc-drawer:target)` and `:root:not(.has-js) .reader-toc-drawer:target`), and in `ReaderTocController.onConnect()` (or `AnchoredPopoverController`), if `window.location.hash === "#reader-toc-drawer"`, clear the hash with `history.replaceState` and call `this.open()`.

- [ ] 🟡 **PH6 — Reader footnotes (`a.reader-note-ref`) & About link (`a.reader-about-link`) jump to bottom before panel relocation** ([`reader_panel.client.ts`](reader/reader_panel.client.ts#L274-L305), [`reader_view.client.ts`](reader/reader_view.client.ts#L218-L240))

  - In SSR, `.reader-notes` and `details#reader-work-about` render at the bottom of `.reader-text-card`.
  - If a user clicks a footnote superscript (`href="#note-1"`) or the `ⓘ` link (`href="#reader-work-about"`) before `v2.js` arrives, the browser scrolls the main window to the bottom of the passage and sets `location.hash`.
  - Moments later, `ReaderPanelController.onConnect()` detaches `.reader-notes` and `#reader-work-about` from the passage footer and moves them into inactive background tabs (`#panel-view-notes`, `#panel-view-about`) in the companion panel — leaving the user stranded at the bottom of the page with the Dictionary tab active instead of showing the note or About tab they clicked.
  - **Fix**: During `MorcusReaderView.onConnect()`, if `window.location.hash` matches a relocated note (`#note-...`) or `#reader-work-about`, activate the corresponding companion panel tab (`notes` or `about`) and highlight/scroll to the target note.

- [ ] 🟢 **PH7 — Reader mobile dictionary sheet (`#reader-dict:target`) slams shut on hydration** ([`reader.server.ts`](reader/reader.server.ts#L417-L421), [`reader_layout.css`](reader/reader_layout.css#L79-L95))

  - Before `v2.js` loads, `:root:not(.has-js)` is active, so mobile shows `"Open Dictionary Search ↑"` (`<a href="#reader-dict">`).
  - If the user taps it before `v2.js` arrives, `:root:not(.has-js) .reader-dict-panel:target` expands the sheet to `60svh`.
  - As soon as `v2.js` adds `.has-js` to `:root`, that CSS rule stops matching, and because `.reader-dict-panel` still has `.drawer-minimized` from SSR, the drawer immediately collapses back to `40px`.
  - **Fix**: In `MorcusReaderView.onConnect()`, if `window.location.hash === "#reader-dict"`, clear the hash and restore/open the dictionary drawer (`this.restoreDrawer()`).

- [ ] 🟢 **PH8 — Dictionary mobile TOC drawer (`<morcus-dict-toc>`) max-height jump & pre-hydration close desync** ([`dict_toc.server.ts`](dict/dict_toc.server.ts#L482-L484), [`dict_toc.css`](dict/dict_toc.css#L78-L90), [`drawer.client.ts`](core/drawer.client.ts#L178-L192))
  - On mobile (`<= 1079px`), `:root:not(.has-js) .drawer-toc:has(.toc-details[open])` caps the TOC drawer at `max-height: 55svh`. When `v2.js` adds `.has-js`, that rule stops matching and `.drawer` jumps to `max-height: 75svh` ([`drawer.css`](core/drawer.css#L11-L12)).
  - Additionally, if the user tapped `<summary>` to close `<details class="toc-details">` before `v2.js` arrived, `DrawerController.onConnect()` does not check `!this.details.open` on mount to apply `.drawer-minimized` and `--drawer-height: 54px`.

---

### C. Late Focus & Scroll Jumps on Hydration

- [x] 🟢 **PH0 — Dictionary search results scroll yank on hydration** ([`dict_search.client.ts`](dict/dict_search.client.ts#L401-L413), [`dict_search.test.ts`](dict/dict_search.test.ts#L616-L690))

  - **Resolved**: Guarded `this.scrollToResults("instant")` on initial connect with `window.scrollY === 0` both before scheduling `rAF` and inside the `rAF` callback so a user who has already scrolled down is not yanked back to the top of `#dict-results`.

- [ ] 🟢 **PH9 — Dictionary landing page `input.focus()` scroll yank on hydration** ([`dict_search.client.ts`](dict/dict_search.client.ts#L414-L421))

  - On `/v2/dicts` (empty query), `this.inputElement.focus()` only checks `document.activeElement === document.body`.
  - If a user on a slow connection scrolls down to read the dictionary descriptions on the landing page (`window.scrollY > 0`), `document.activeElement` is still `document.body` — so when `v2.js` arrives, `this.inputElement.focus()` yanks the viewport back to the top of the page (and pops up the on-screen keyboard on mobile).
  - **Fix**: Guard the initial `this.inputElement.focus()` with `window.scrollY === 0` (or pass `{ preventScroll: true }` when appropriate).

- [ ] 🟢 **PH10 — Reader `scrollToFirstMatch()` unconditional scroll on mount** ([`reader_view.client.ts`](reader/reader_view.client.ts#L231), [`reader_view.client.ts`](reader/reader_view.client.ts#L1267-L1284))
  - On reader URLs with `?matchText=...`, `.reader-match` spans are created during `enhancePassage()` in `onConnect()`, after which `this.scrollToFirstMatch(window.location.hash)` unconditionally scrolls the first match to the center of the viewport — even if the user has already scrolled since first paint.

---

### D. Post-Paint Typography / Layout Shifts & Dead Controls

- [ ] 🟡 **PH11 — Reader typography, gutter, and splitter preferences missing from `critical_theme.client.ts`** ([`critical_theme.client.ts`](shell/critical_theme.client.ts#L1-L53) vs [`reader_view.client.ts`](reader/reader_view.client.ts#L223-L230), [`reader_layout.client.ts`](reader/reader_layout.client.ts#L124-L133))

  - `critical_theme.client.ts` (synchronous in `<head>`) applies `darkMode`, `highlightStrength`, `readerWidth`, and `dictWidth` before first paint.
  - However, `morcus_reader_settings` (`readerScale`, `fontFamily`, `lineHeight`, `showGutter`) and `morcus_reader_dict_width` (`--dict-width` desktop splitter width) are only applied when `MorcusReaderView.onConnect()` runs in `v2.js`. Users with customized reader font size, font family, line height, or hidden gutters experience a full-passage text reflow when `v2.js` arrives (within the 1 KB `critical.js` budget, setting `--reader-scale`, `--reader-font`, `--reader-line-height`, and `--dict-width` on `:root` in `critical_theme.client.ts` would eliminate the layout shift).

- [ ] 🟢 **PH12 — Reader `Aa` button (`#reader-settings-btn`) is visible and dead before hydration** ([`reader_nav.css`](reader/reader_nav.css#L207-L211))
  - Unlike `<morcus-theme-toggle>` and `<morcus-report-dialog>` (which hide via `:not(:defined)` in [`v2-critical.css`](v2-critical.css#L106-L114)), `.reader-settings-btn` only hides under `@media (scripting: none)`. For a JS-enabled user, `Aa` is visible from first paint, and clicking it before `v2.js` arrives does nothing.
  - **Fix**: Hide `.reader-settings-btn` under `:root:not(.has-js)` (or `morcus-reader-view:not(:defined) .reader-settings-btn`) so it only appears once interactive.
