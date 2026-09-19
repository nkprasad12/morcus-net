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

- [x] 🟢 **Use `this.scope.delegate()` instead of manual `e.target.closest(...)` inside `this.scope.listen()`**: (Completed in Batch 1)
  - [x] [`library/library_view.client.ts`](library/library_view.client.ts) (L28–36) adopted `this.scope.delegate<HTMLButtonElement>(this, "click", ".filter-pill", ...)` and removed its empty `protected override onDisconnect() {}`.
  - [x] [`dict/dict_settings.client.ts`](dict/dict_settings.client.ts) (L241–270) manually inspected `e.target instanceof HTMLInputElement && target.classList.contains(...)` inside `this.listen(this, "change", ...)`. (Completed in Step 6)
- [x] 🟢 **Use `this.emit()` instead of manual `new CustomEvent(...)` dispatch**: (Completed in Step 6)
  - [`dict/dict_settings.client.ts`](dict/dict_settings.client.ts) (L262–268 and L277–283) manually constructed `this.dispatchEvent(new CustomEvent("dict-...", { bubbles: true, composed: true, detail: ... }))`, which is identical to `this.emit(name, detail)` on `BaseElement`.
- [x] 🟢 **Add missing `HTMLElementTagNameMap` augmentations**: (Completed in Batch 1)
  - Added `HTMLElementTagNameMap` declarations to [`dict/dict_toc.client.ts`](dict/dict_toc.client.ts) (`"morcus-dict-toc"`) and [`library/library_view.client.ts`](library/library_view.client.ts) (`"morcus-library-view"`).

---

## 2. Common Helpers to Extract into `core/` (and Existing `core/` Helpers to Adopt)

### A. Extract an Anchored Popover + Focus Trap Controller (`core/popover.client.ts`)

- [x] 🟡 **Unify `MorcusReaderSettings` and `ReaderTocController` anchored popover & focus-trap logic into `core/popover.client.ts`.** (Completed in Steps 4, 6.6, & 6.7)
  - **High-Impact Duplication**: [`reader/reader_settings.client.ts`](reader/reader_settings.client.ts) (~185 lines) and [`reader/reader_toc.client.ts`](reader/reader_toc.client.ts) (~160 lines) were near-clones of the same anchored dropdown/popover lifecycle (`open()` / `close()` / `toggle()` / `isOpen()`, `updatePosition()`, `Tab` / `Shift+Tab` focus-trap cycling, and `Escape` + outside-click dismissal).
  - **Resolved**: Extracted `AnchoredPopoverController` and `trapFocus` in `core/popover.client.ts`, evaluated and documented why `MorcusDictSettings` (native `<details>` / `<summary>` Zero-JS form baseline) and `abbr_popover.client.ts` (1-to-N delegated top-layer tooltip) remain distinct in Step 6.6, and removed runtime `jsdom` detection and duplicate `document`/`window` keydown listeners in Step 6.7.

### B. Adopt `core/` Helpers That Are Currently Bypassed

Several `core/` utilities were created specifically to standardize browser operations, but feature modules still hand-roll the raw equivalents:

- [x] 🟢 **Route all `localStorage` reads/writes through `storage` (`core/storage.client.ts`).** (Completed in Batch 1)
  - Routed all 5 callers through `storage` with safe private browsing/disabled localStorage fallbacks:
    1. [`core/settings.client.ts`](core/settings.client.ts)
    2. [`dict/dict_preferences.client.ts`](dict/dict_preferences.client.ts)
    3. [`dict/dict_greek.client.ts`](dict/dict_greek.client.ts)
    4. [`reader/reader_layout.client.ts`](reader/reader_layout.client.ts)
    5. [`reader/saved_spots.client.ts`](reader/saved_spots.client.ts) — and consolidated `isRecord(val: unknown)` into `core/settings.client.ts`.
- [x] 🟢 **Replace `MorcusReaderView`'s private toast & clipboard code with `showToast` (`core/toast.client.ts`) and `copyText` (`core/clipboard.client.ts`).** (Completed in Batch 1)
  - Removed private `showToast` and `toastTimer` from [`reader/reader_view.client.ts`](reader/reader_view.client.ts), migrated to `showToast` and `copyText` with multi-toast/fallback support.
- [x] 🟢 **Finish adopting `bindDismissable` (`core/dismissable.client.ts`) in `shell/mobile_menu.client.ts` (4 of 4 completed).** (Completed in Batch 1)
  - Migrated [`shell/mobile_menu.client.ts`](shell/mobile_menu.client.ts) to `bindDismissable` with outside-pointerdown and Escape key dismissal.
- [x] 🟢 **Return `{ open, close, dispose }` (or attach `.open` / `.close` to `CleanupFn`) from `setupModalDialog` (`core/dialog.client.ts`).** (Completed in Batch 1)
  - Extended `setupModalDialog` to return a callable `ModalDialogHandle` (`{ open, close, dispose }`), eliminated duplicate open/close DOM logic in [`dialog/report_dialog.client.ts`](dialog/report_dialog.client.ts).

### C. Small Duplicated Helpers to Move to `core/dom.client.ts`

- [x] 🟢 **Consolidate `escapeCss` / `escapeId` into `core/dom.client.ts`**: (Completed in Batch 1)
  - Extracted `escapeId` in `core/dom.client.ts`, adopted across `reader_view.client.ts` and `reader_panel.client.ts`.
- [x] 🟢 **Consolidate one-shot keyframe flash (`flashElement`)**: (Completed in Batch 1)
  - Extracted `flashElement` in `core/dom.client.ts`, adopted in [`core/anchor_scroll.client.ts`](core/anchor_scroll.client.ts) and [`dict/dict_permalink.client.ts`](dict/dict_permalink.client.ts).
- [x] 🟢 **Extract `isPlainLeftClick(e: MouseEvent)`**: (Completed in Batch 1)
  - Extracted `isPlainLeftClick` in `core/dom.client.ts`, adopted in [`dict/dict_search.client.ts`](dict/dict_search.client.ts) and [`reader/reader_view.client.ts`](reader/reader_view.client.ts).
- [x] 🟢 **Extract `syncIframeTheme(iframe, theme?)`**: (Completed in Batch 1)
  - Extracted `syncIframeTheme` in `core/dom.client.ts`, adopted in [`shell/theme_toggle.client.ts`](shell/theme_toggle.client.ts) and [`reader/reader_view.client.ts`](reader/reader_view.client.ts).
- [x] 🟢 **Extract a `createSingletonSetup(setupFn)` wrapper for global enhancers**: (Completed in Batch 1)
  - Extracted `createSingletonSetup` in `core/disposable.client.ts`, adopted across [`core/anchor_scroll.client.ts`](core/anchor_scroll.client.ts), [`core/back_to_top.client.ts`](core/back_to_top.client.ts), [`core/deferred_iframe.client.ts`](core/deferred_iframe.client.ts), [`shell/mobile_menu.client.ts`](shell/mobile_menu.client.ts), and [`dict/abbr_popover.client.ts`](dict/abbr_popover.client.ts).

---

## 3. Client-Side JS Code Smells & Correctness Traps

- [x] 🟢 **Move inline `style="min-height: 200px;"` in `reader/reader_panel.client.ts` to `reader/reader_panel.css` (`.innerHTML` writes already migrated to `setHtml`).** (Completed in Batch 1)
  - Moved `min-height: 200px;` to `.reader-translation-loading, .reader-translation-error` in [`reader/reader_panel.css`](reader/reader_panel.css) and dropped inline style attributes from `reader_panel.client.ts`.
- [x] 🟡 **Fix remaining drawer state split-brain in `MorcusReaderView.dismissDictionary()` (`reader/reader_view.client.ts`).** (Completed in Batch 1)
  - Added `reset()` to `DrawerController` clearing `drawer-minimized`, custom height on drawer and `documentElement`, and ARIA state. Routed `MorcusReaderView.dismissDictionary()` to `this.drawerController.reset()` and removed dead `if (this.layoutController) ... else` fallbacks.
- [x] 🟢 **De-duplicate mobile scroll-past-drawer calculation in `MorcusReaderView`.** (Completed in Batch 1)
  - Extracted `scrollTargetAboveDrawer(targetEl: HTMLElement)` in [`reader/reader_view.client.ts`](reader/reader_view.client.ts) called from both `openNote()` and `lookupWord()`.

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

- [x] 🟢 **Delete `.reader-toast` from `reader/reader_dialogs.css` (L63–84) and `#reader-toast` SSR markup**: (Completed)
  - Removed `.reader-toast` and `.reader-toast.visible` from [`reader/reader_dialogs.css`](reader/reader_dialogs.css), removed `<div id="reader-toast" ...>` from [`reader/reader.server.ts`](reader/reader.server.ts), dropped the temporary fallback from `ensureToastElement()` in [`core/toast.client.ts`](core/toast.client.ts), and updated [`reader/reader_view.test.ts`](reader/reader_view.test.ts) to query `#toast`.
- [x] 🟢 **Reuse `.drawer` (`core/drawer.css`) on `.reader-dict-panel` instead of duplicating mobile sheet rules in `reader/reader_dict.css` (L55–79)**: (Completed)
  - Added `.drawer` class to `<aside class="reader-dict-panel drawer">` in [`reader/reader.server.ts`](reader/reader.server.ts), deleted the duplicate 22-line `.reader-dict-panel` mobile fixed dock block from [`reader/reader_dict.css`](reader/reader_dict.css), ensured desktop reset specificity with `.drawer.reader-dict-panel`, and scoped drawer back-to-top queries in [`shell/app_bar.css`](shell/app_bar.css) to exclude the desktop reader sidebar between 641px and 1080px.
- [x] 🟡 **Extract shared `.anchored-popover` CSS shell (`core/components.css` or `core/settings.css`)**: (Completed)
  - Extracted `.anchored-popover` shell, slide-down `@keyframes anchoredPopoverSlide` / `anchoredPopoverSlideCentered`, caret indicator diamond (`::before`), header row, and title/close button styles into [`core/components.css`](core/components.css). Deduplicated fixed card properties, `@keyframes`, and header/close buttons across [`.reader-settings-popover`](core/settings.css) and [`.reader-toc-drawer`](reader/reader_toc.css).
- [x] 🟢 **Consolidate 3× duplicated language badge color rules (`-la`, `-en`, `-de`, `-es`)**: (Completed)
  - Consolidated the 4-language token mapping (`--chip-la-bg`/`text`, `--chip-en-bg`/`text`, `--chip-de-bg`/`text`, `--chip-es-bg`/`text`) into a single multi-selector rule in [`core/components.css`](core/components.css) and removed duplicate rules from [`dict/search.css`](dict/search.css), [`dict/dict_toc.css`](dict/dict_toc.css), and [`dict/dict_entry.css`](dict/dict_entry.css).
- [x] 🟢 **Deduplicate `@keyframes spin`**: (Completed)
  - Centralized `@keyframes spin` and shared spinner animations once in [`core/components.css`](core/components.css); removed duplicate keyframe definitions from [`dialog/dialog.css`](dialog/dialog.css) and [`reader/reader_panel.css`](reader/reader_panel.css).
