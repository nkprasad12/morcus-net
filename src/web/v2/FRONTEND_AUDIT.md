# UI V2 Client JS & CSS Code Smell Audit

Derived from a focused audit of all client-side TypeScript (`*.client.ts`) and stylesheets (`*.css`) under `src/web/v2/` on 2026-09-18. Kept separate from [CODE_HEALTH.md](CODE_HEALTH.md) as a standalone reference and checklist for client/CSS consolidation.

> [!NOTE]
> For the architectural design of **`LifetimeScope`**, **`BaseController`**, **`addController(c)` / `use(cleanup)`**, **`AnchoredPopoverController`**, and the **`onContentSwap()`** lifecycle that addresses the lifecycle bugs in Sections 1 and 2 below, see **[MICROFRAMEWORK_PROPOSAL.md](MICROFRAMEWORK_PROPOSAL.md)**.

**Sizes**: 🟢 < 30 min · 🟡 1–2 hours · 🔴 half a day+

---

## 1. Patterns to Add to `BaseElement` & `BaseController` (`core/base_element.client.ts`)

`BaseElement` already centralizes DOM event cleanup (`this.listen`, `this.delegate`), `AbortSignal` supersession lanes (`this.latest`, `this.signal`), form hijacking (`this.hijackForm`), and URL query sync (`this.syncQueryParam`). However, because those capabilities live exclusively on `BaseElement extends HTMLElement`, **none of our sub-controllers (`ReaderTocController`, `ReaderPanelController`, `ReaderLayoutController`, `DrawerController`) can use them**, forcing sub-controllers to drop down to verbose `addEventListener` + `DisposableBag` boilerplate in their constructors.

### A. Shared `LifetimeScope` + `BaseController`, `addController(c)`, & `use(cleanup)`

- [x] 🟡 **Extract a one-shot per-connect `LifetimeScope` and `BaseController<Lane>` base class, and split host controller registration (`this.addController(c)`) from scope cleanup (`this.scope.use(cleanup)`).** (Completed in Steps 3, 5, 7, 6.1, 6.2, & 6.5)
  - **Smell 1 (Repetitive teardown boilerplate & inconsistent `.destroy()` vs `.dispose()`)**: `this.addDisposable(fn)` originally accepted only `() => void` (and returned no `unregister` handle). Every time a component instantiated a sub-controller (`DrawerController`, `ReaderLayoutController`, `ReaderTocController`, `ReaderPanelController`, `QueryParamSync`), it repeated 4–5 lines of teardown boilerplate (**5 times** across [`reader/reader_view.client.ts`](reader/reader_view.client.ts) and [`dict/dict_toc.client.ts`](dict/dict_toc.client.ts)) and mixed `.dispose()` vs `.destroy()`.
  - **Smell 2 (Sub-controllers register listeners in `constructor()` & lose state on reconnect)**:
    - In [`reader/reader_toc.client.ts`](reader/reader_toc.client.ts) and [`reader/reader_panel.client.ts`](reader/reader_panel.client.ts), every listener took 6 lines of `const btn = ...; btn.addEventListener(...); this.disposables.add(() => btn.removeEventListener(...))`.
    - Because all four DOM sub-controllers registered listeners in `constructor()` instead of an idempotent `onConnect()`, the parent element destroyed and re-instantiated them on every reconnect—discarding controller state (`_activeTab`, `isTranslationLoaded`, `preferredDvh`).
    - Sub-controllers lacked `this.scope.signal` / `this.scope.latest(lane)` (e.g., `ReaderPanelController`'s async translation loader was un-cancellable on disconnect).
  - **Landed Architecture (detailed in [MICROFRAMEWORK_PROPOSAL.md](MICROFRAMEWORK_PROPOSAL.md))**:
    1. **Unified `.destroy()` $\rightarrow$ `.dispose()`**, and split `this.addController(c)` (`Controller = { connect?(): void; dispose(): void; onContentSwap?(): void }`, surviving across reconnects) from `this.scope.use(cleanup)` (`Disposable = CleanupFn | { dispose(): void }`, dying with the current scope and returning `void` per Step 6.5).
    2. **Rich `BaseController<Lane>` (sharing a one-shot per-connect `LifetimeScope` exposed via `this.scope` with `BaseElement<Lane>` per Step 7)**:
       - **Lifecycle**: `onConnect()`, `onDisconnect()`, and sink-driven `onContentSwap(swappedRoot)`.
       - **Scoped DOM**: `this.root`, `this.scope.$<T>(selector)`, `this.scope.$$<T>(selector)`, `this.scope.require<T>(selector)`, and `this.emit(name, detail)`.
       - **Nullable-safe `this.scope.listen(target | null | undefined, ...)` & `this.scope.delegate(...)`**: Accepting `null | undefined` as a no-op eliminates `if (el) { ... }` guards across UI V2, paired with Server↔Client Selector Contract tests.
       - **Async Lifetime**: `this.scope.signal`, `this.scope.latest(lane)`, `this.scope.cancel(lane)`, `this.scope.timeout(fn, ms)`, `this.scope.rAF(fn)`, and host `this.debounce(fn, ms)` (`createDurableDebounce`).
       - **Bounded Nested Sub-Scopes (`this.scope.createScope()`)**: Replaces the second `openDisposables = new DisposableBag()` in [`reader/reader_toc.client.ts`](reader/reader_toc.client.ts) and [`reader/reader_settings.client.ts`](reader/reader_settings.client.ts), automatically detaching itself from its parent scope via `DisposableBag`'s internal `Unregister` handle when disposed on popover close.

### B. Managed Timers (`this.scope.timeout`) & Auto-Disposed Debounce (`this.debounce`)

- [x] 🟢 **Add `this.scope.timeout(fn, ms)`, `this.scope.rAF(fn)`, and `this.debounce(fn, ms)` to `LifetimeScope` / `BaseElement` / `BaseController`.** (Completed in Steps 1 & 7)

  - **Smell**: `BaseElement` cleaned up DOM listeners and `AbortSignal` lanes on disconnect, **but not timers (`setTimeout`), `requestAnimationFrame`, or debounced functions**.
  - **Where it bit (all migrated)**:
    - [`dialog/report_dialog.client.ts`](dialog/report_dialog.client.ts) (`setTimeout(() => this.textareaEl?.focus(), 50)` and `setTimeout(() => { this.closeDialog(); this.resetForm(); }, 1200)`) ran unmanaged timers that could fire after the element was removed.
    - [`dict/dict_search.client.ts`](dict/dict_search.client.ts) (`window.setTimeout(() => this.clearSuggestions(), 200)`) ran an unmanaged blur timer and manually overrode `onDisconnect()` to call `.cancel()` on `this.debouncedFetchPrefixChunk` and `this.debouncedFetchSuffixCompletions`.
    - [`reader/reader_view.client.ts`](reader/reader_view.client.ts) ran unmanaged highlight/toast timers and `requestAnimationFrame` callbacks.

### C. Existing `BaseElement` Primitives Bypassed in Subclasses

- [ ] 🟢 **Use `this.scope.delegate()` instead of manual `e.target.closest(...)` inside `this.scope.listen()`**:
  - [ ] [`library/library_view.client.ts`](library/library_view.client.ts) (L28–36) manually writes `this.scope.listen(this, "click", (e) => { if (!(e.target instanceof Element)) return; const pill = e.target.closest<HTMLButtonElement>(".filter-pill"); ... })` instead of `this.scope.delegate<HTMLButtonElement>(this, "click", ".filter-pill", ...)`. Also remove its empty `protected override onDisconnect() {}` at L47–49.
  - [x] [`dict/dict_settings.client.ts`](dict/dict_settings.client.ts) (L241–270) manually inspected `e.target instanceof HTMLInputElement && target.classList.contains(...)` inside `this.listen(this, "change", ...)`. (Completed in Step 6)
- [x] 🟢 **Use `this.emit()` instead of manual `new CustomEvent(...)` dispatch**: (Completed in Step 6)
  - [`dict/dict_settings.client.ts`](dict/dict_settings.client.ts) (L262–268 and L277–283) manually constructed `this.dispatchEvent(new CustomEvent("dict-...", { bubbles: true, composed: true, detail: ... }))`, which is identical to `this.emit(name, detail)` on `BaseElement`.
- [ ] 🟢 **Add missing `HTMLElementTagNameMap` augmentations**:
  - 8 of the 10 custom elements declare `HTMLElementTagNameMap` at the bottom of their module, but [`dict/dict_toc.client.ts`](dict/dict_toc.client.ts) (`"morcus-dict-toc"`) and [`library/library_view.client.ts`](library/library_view.client.ts) (`"morcus-library-view"`) omit it.

---

## 2. Common Helpers to Extract into `core/` (and Existing `core/` Helpers to Adopt)

### A. Extract an Anchored Popover + Focus Trap Controller (`core/popover.client.ts`)

- [x] 🟡 **Unify `MorcusReaderSettings` and `ReaderTocController` anchored popover & focus-trap logic into `core/popover.client.ts`.** (Completed in Steps 4, 6.6, & 6.7)
  - **High-Impact Duplication**: [`reader/reader_settings.client.ts`](reader/reader_settings.client.ts) (~185 lines) and [`reader/reader_toc.client.ts`](reader/reader_toc.client.ts) (~160 lines) were near-clones of the same anchored dropdown/popover lifecycle (`open()` / `close()` / `toggle()` / `isOpen()`, `updatePosition()`, `Tab` / `Shift+Tab` focus-trap cycling, and `Escape` + outside-click dismissal).
  - **Resolved**: Extracted `AnchoredPopoverController` and `trapFocus` in `core/popover.client.ts`, evaluated and documented why `MorcusDictSettings` (native `<details>` / `<summary>` Zero-JS form baseline) and `abbr_popover.client.ts` (1-to-N delegated top-layer tooltip) remain distinct in Step 6.6, and removed runtime `jsdom` detection and duplicate `document`/`window` keydown listeners in Step 6.7.

### B. Adopt `core/` Helpers That Are Currently Bypassed

Several `core/` utilities were created specifically to standardize browser operations, but feature modules still hand-roll the raw equivalents:

- [ ] 🟢 **Route all `localStorage` reads/writes through `storage` (`core/storage.client.ts`).**
  - Currently **only** `reader/reader_settings.client.ts` uses `storage`.
  - The following 5 modules bypass `storage` with manual `try { localStorage.getItem(...) } catch {}` blocks:
    1. [`core/settings.client.ts`](core/settings.client.ts) (L67–77)
    2. [`dict/dict_preferences.client.ts`](dict/dict_preferences.client.ts) (L18–32)
    3. [`dict/dict_greek.client.ts`](dict/dict_greek.client.ts) (L69–82)
    4. [`reader/reader_layout.client.ts`](reader/reader_layout.client.ts) (L106–165, L255–276)
    5. [`reader/saved_spots.client.ts`](reader/saved_spots.client.ts) (L47–85) — which also re-declares `function isRecord(val: unknown)` (L14–16) identically to `core/settings.client.ts` (L24–26).
- [ ] 🟢 **Replace `MorcusReaderView`'s private toast & clipboard code with `showToast` (`core/toast.client.ts`) and `copyText` (`core/clipboard.client.ts`).**
  - [`shell/toast.css`](shell/toast.css) (L1–4) explicitly notes that `core/toast.client.ts` generalized `.reader-toast` so views do not need SSR toast markup.
  - Yet [`reader/reader_view.client.ts`](reader/reader_view.client.ts) still maintains a private `this.showToast(msg)` (L1124–1132) querying `#reader-toast`, and section permalink copying (L339–341) calls `navigator.clipboard?.writeText(fullUrl).catch(() => {})` directly instead of `copyText(fullUrl)` (missing the fallback and boolean check).
- [ ] 🟢 **Finish adopting `bindDismissable` (`core/dismissable.client.ts`) in `shell/mobile_menu.client.ts` (3 of 4 completed).**
  - Status across the 4 menus/popovers:
  1. [ ] [`shell/mobile_menu.client.ts`](shell/mobile_menu.client.ts) (L15–24) — **still remains**: uses raw `doc.addEventListener("pointerdown", ...)` and lacks `Escape` dismissal and `<summary>` trigger focus restoration.
  2. [x] [`dict/abbr_popover.client.ts`](dict/abbr_popover.client.ts) (L141–153) — migrated to `bindDismissable` + `DisposableBag` in Step 6.6.
  3. [x] [`reader/reader_settings.client.ts`](reader/reader_settings.client.ts) — migrated via `AnchoredPopoverController` in Step 4.
  4. [x] [`reader/reader_toc.client.ts`](reader/reader_toc.client.ts) — migrated via `AnchoredPopoverController` in Step 4.
- [ ] 🟢 **Return `{ open, close, dispose }` (or attach `.open` / `.close` to `CleanupFn`) from `setupModalDialog` (`core/dialog.client.ts`).**
  - Because `setupModalDialog` returns only an `unbind` function (`CleanupFn`), [`dialog/report_dialog.client.ts`](dialog/report_dialog.client.ts) (L93–113) had to re-implement `openDialog()` and `closeDialog()` (`typeof dialog.showModal === "function"`, `setAttribute("open", "")`, `clearStatus()`, `focus()`), duplicating `setupModalDialog`'s internal open/close handlers.

### C. Small Duplicated Helpers to Move to `core/dom.client.ts`

- [ ] 🟢 **Consolidate `escapeCss` / `escapeId` into `core/dom.client.ts`**:
  - Duplicated verbatim between [`reader/reader_view.client.ts`](reader/reader_view.client.ts) (L70–75) and [`reader/reader_panel.client.ts`](reader/reader_panel.client.ts) (L38–43).
- [ ] 🟢 **Consolidate one-shot keyframe flash (`flashElement`)**:
  - [`core/anchor_scroll.client.ts`](core/anchor_scroll.client.ts) (`triggerAnchorHighlight`, L5–20) and [`dict/dict_permalink.client.ts`](dict/dict_permalink.client.ts) (`flashSection`, L65–78) implement identical reflow-triggered CSS keyframe restart (`classList.remove("target-active"); void el.offsetWidth; classList.add("target-active"); addEventListener("animationend", ..., { once: true })`).
- [ ] 🟢 **Extract `isPlainLeftClick(e: MouseEvent)`**:
  - Checking `e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey` is repeated in [`dict/dict_search.client.ts`](dict/dict_search.client.ts) (L210–218) and [`reader/reader_view.client.ts`](reader/reader_view.client.ts) (L400–409).
- [ ] 🟢 **Extract `syncIframeTheme(iframe, theme?)`**:
  - Duplicated between [`shell/theme_toggle.client.ts`](shell/theme_toggle.client.ts) (`syncIframesTheme`, L55–69) and [`reader/reader_view.client.ts`](reader/reader_view.client.ts) (`initIframeThemeSync`, L275–297).
- [ ] 🟢 **Extract a `createSingletonSetup(setupFn)` wrapper for global enhancers**:
  - All 5 global enhancers ([`core/anchor_scroll.client.ts`](core/anchor_scroll.client.ts), [`core/back_to_top.client.ts`](core/back_to_top.client.ts), [`core/deferred_iframe.client.ts`](core/deferred_iframe.client.ts), [`shell/mobile_menu.client.ts`](shell/mobile_menu.client.ts), [`dict/abbr_popover.client.ts`](dict/abbr_popover.client.ts)) repeat the exact same `let activeCleanup: CleanupFn | null = null` re-initialization guard and teardown check.

---

## 3. Client-Side JS Code Smells & Correctness Traps

- [ ] 🟢 **Move inline `style="min-height: 200px;"` in `reader/reader_panel.client.ts` to `reader/reader_panel.css` (`.innerHTML` writes already migrated to `setHtml`).**
  - [x] Both raw `this.translationView.innerHTML = ...` assignments in [`reader/reader_panel.client.ts`](reader/reader_panel.client.ts) (L577–582 and L609–620) were converted to `setHtml(this.translationView, html`...`)` in Step 5.
  - [ ] Move the remaining inline `style="min-height: 200px;"` attribute out of those two `html` templates into `.reader-translation-loading, .reader-translation-error` in [`reader/reader_panel.css`](reader/reader_panel.css).
- [ ] 🟡 **Fix remaining drawer state split-brain in `MorcusReaderView.dismissDictionary()` (`reader/reader_view.client.ts`).**
  - [x] The 15-line `else` fallbacks in `minimizeDrawer()` (L674–676) and `restoreDrawer()` (L678–680) were deleted in Step 5 when `DrawerController` migrated to `addController()`.
  - [ ] In `dismissDictionary()` (L785–804), `MorcusReaderView` still bypasses `this.drawerController` and directly calls `dictPanel.style.removeProperty("--drawer-height")` and `splitLayout?.style.removeProperty("--drawer-height")`, **forgetting `document.documentElement`** (which is where `DrawerController` writes `--drawer-height` via `layoutElement: () => document.documentElement`). As a result, `document.documentElement` retains a stale `--drawer-height` after closing the dictionary. Add a `reset()` method to `DrawerController` and remove the dead `if (this.layoutController) ... else` branches in `dismissDictionary()` (L788–793) and `lookupWord()` (L855–865).
- [ ] 🟢 **De-duplicate mobile scroll-past-drawer calculation in `MorcusReaderView`.**
  - `openNote()` (L719–736) and `lookupWord()` (L871–890) in [`reader/reader_view.client.ts`](reader/reader_view.client.ts) contain identical 18-line `this.scope.rAF` blocks computing `drawerTop` and calling `window.scrollBy({ top: scrollNeeded, left: 0, behavior: "smooth" })` when `window.innerWidth <= 640`. Extract a private `scrollTargetAboveDrawer(targetEl: HTMLElement)` helper.

---

## 4. CSS Code Smells, Bugs & Duplication

### A. Live CSS Bugs & Global Cascade Collisions

- [ ] 🟢 **Define or replace the undefined `--pill-bg` design token.**
  - Referenced in [`core/components.css`](core/components.css) (L67: `.btn-secondary:hover { background-color: var(--pill-bg); }`) and [`dialog/dialog.css`](dialog/dialog.css) (L88: `.dialog-close-btn:hover { background: var(--pill-bg); }`), **but `--pill-bg` is never defined in `shell/variables.css` or `shell/critical_variables.css`**. Both hover states silently evaluate to transparent in light and dark mode. Replace with `var(--tag-bg)` (or define `--pill-bg` in `variables.css`).
- [ ] 🟡 **Eliminate 4× theme block duplication in `shell/variables.css` (and fix missing `--border-mid`).**
  - [`shell/variables.css`](shell/variables.css) repeats the entire ~95-token palette across 4 blocks: `:root` (L20–117), `@media (prefers-color-scheme: dark)` (L119–195), `:root[data-theme="dark"]` (L197–268), and `:root[data-theme="light"]` (L270–342).
  - **Bug caused by this duplication**: `--border-mid` is defined in `:root` (`#b7bac1` at L49) and `@media (prefers-color-scheme: dark)` (`#4d525c` at L126), **but is missing from both `[data-theme="dark"]` and `[data-theme="light"]`**. When a user manually toggles the theme opposite to their OS preference, `--border-mid` stays stuck on the OS theme color.
  - **Fix**: Combine `:root, :root[data-theme="light"], [data-theme="light"]` into a single selector block (saving ~75 lines in `variables.css` and `critical_variables.css`), and ensure dark tokens are defined in one shared place or kept in strict parity.
- [ ] 🟡 **Scope `.lat-word`, `.section-anchor`, and `.badge` so Reader/Library rules do not clobber Dictionary styles.**
  - Because [`v2.css`](v2.css) imports `reader/*.css` and `library/*.css` _after_ `dict/*.css`, unscoped selectors in the later files overwrite earlier rules globally:
    1. **`.lat-word` collision**: [`reader/reader_text.css`](reader/reader_text.css) (L246–285) styles bare `a.lat-word:hover` (`background-color: var(--word-hover-bg); color: inherit; text-decoration: none;`), which **globally clobbers** [`dict/dict_typography.css`](dict/dict_typography.css) (L233–240: `.lat-word:hover { color: var(--primary); text-decoration: underline; background-color: var(--tag-bg); }`) even on Dictionary pages. Scope the reader rules under `.reader-view` / `.reader-passage`.
    2. **`.section-anchor` collision**: Defined globally in [`dict/dict_typography.css`](dict/dict_typography.css) (L248–260: `:hover, :focus-visible { background-color: var(--primary); color: var(--on-accent); }`) and redefined globally in [`reader/reader_text.css`](reader/reader_text.css) (L308–323), which overrides `:hover` (`color: var(--primary); opacity: 1`) **without overriding `:focus-visible`**. Keyboard-focusing a `.section-anchor` in the Reader therefore renders the Dictionary's solid blue background box.
    3. **`.badge` collision**: Defined globally in [`dict/dict_typography.css`](dict/dict_typography.css) (L214–221: `font-size: 0.8rem; border-radius: var(--radius-xl); background: var(--border);`) and redefined globally in [`library/library.css`](library/library.css) (L153–163: `font-size: 0.72rem; border-radius: var(--radius-sm);`). Move `.badge` to `core/components.css` with explicit modifiers.

### B. Duplicated CSS Component Blocks to Consolidate

- [ ] 🟢 **Delete `.reader-toast` from `reader/reader_dialogs.css` (L63–84)**:
  - Exact duplicate of `.toast` in [`shell/toast.css`](shell/toast.css) (L6–28) (and lacks `.toast`'s `@media (prefers-reduced-motion: reduce)` rule). Remove once `MorcusReaderView` calls `showToast()`.
- [ ] 🟢 **Reuse `.drawer` (`core/drawer.css`) on `.reader-dict-panel` instead of duplicating mobile sheet rules in `reader/reader_dict.css` (L55–79)**:
  - `reader_dict.css` (L55–79) copies the 22-line `position: fixed; bottom: 0; border-top: 2px solid var(--border-strong); transition: ...` block from `core/drawer.css` (L20–45) (and uses raw `16px` instead of `var(--radius-2xl)`).
- [ ] 🟡 **Extract shared `.anchored-popover` CSS shell (`core/components.css` or `core/settings.css`)**:
  - `.reader-settings-popover` ([`core/settings.css`](core/settings.css) L77–129) and `.reader-toc-drawer` ([`reader/reader_toc.css`](reader/reader_toc.css) L33–63) duplicate the fixed card shell, slide-down `@keyframes` (`settingsPopoverSlide` vs `tocDropdownSlide`), header/close button row, and the rotated `10px × 10px` `--caret-left` `::before` diamond.
- [ ] 🟢 **Consolidate 3× duplicated language badge color rules (`-la`, `-en`, `-de`, `-es`)**:
  - The 4-language token mapping (`--chip-la-bg`/`text`, `--chip-en-bg`/`text`, `--chip-de-bg`/`text`, `--chip-es-bg`/`text`) is written three separate times across `.lang-chip-*` ([`dict/search.css`](dict/search.css) L176–194), `.toc-badge-*` ([`dict/dict_toc.css`](dict/dict_toc.css) L208–226), and `.dict-badge-*` ([`dict/dict_entry.css`](dict/dict_entry.css) L50–68).
- [ ] 🟢 **Deduplicate `@keyframes spin`**:
  - Defined identically in [`dialog/dialog.css`](dialog/dialog.css) (L233–237) and [`reader/reader_panel.css`](reader/reader_panel.css) (L234–238); move once to `core/components.css`.
