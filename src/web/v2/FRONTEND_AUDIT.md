# UI V2 Client JS & CSS Code Smell Audit

Derived from a focused audit of all client-side TypeScript (`*.client.ts`) and stylesheets (`*.css`) under `src/web/v2/` on 2026-09-18. Kept separate from [CODE_HEALTH.md](CODE_HEALTH.md) as a standalone reference and checklist for client/CSS consolidation.

**Sizes**: 🟢 < 30 min · 🟡 1–2 hours · 🔴 half a day+

---

## 1. Patterns to Add to `BaseElement` (`core/base_element.client.ts`)

`BaseElement` already centralizes DOM event cleanup (`this.listen`, `this.delegate`), `AbortSignal` supersession lanes (`this.latest`, `this.signal`), form hijacking (`this.hijackForm`), and URL query sync (`this.syncQueryParam`). The following recurring patterns in feature components should be promoted into `BaseElement` (or adopted where `BaseElement` already provides them).

### A. Managed Timers (`this.timeout`) & Auto-Disposed Debounce (`this.debounce`)

- [ ] 🟢 **Add `this.timeout(fn, ms)` and `this.debounce(fn, ms)` to `BaseElement`.**
  - **Smell**: `BaseElement` cleans up DOM listeners and `AbortSignal` lanes on disconnect, **but not timers (`setTimeout`) or debounced functions**.
  - **Where it bites**:
    - [`dialog/report_dialog.client.ts`](dialog/report_dialog.client.ts) (`setTimeout(() => this.textareaEl?.focus(), 50)` at L43 & L96; `setTimeout(() => { this.closeDialog(); this.resetForm(); }, 1200)` at L157–160) runs unmanaged timers that can fire after the element is removed.
    - [`dict/dict_search.client.ts`](dict/dict_search.client.ts) (`window.setTimeout(() => this.clearSuggestions(), 200)` at L516–518) runs an unmanaged blur timer.
    - [`reader/reader_view.client.ts`](reader/reader_view.client.ts) (`setTimeout` at L335, L1129, L1271) runs unmanaged highlight/toast timers.
    - [`dict/dict_search.client.ts`](dict/dict_search.client.ts) (L178–182) only overrides `onDisconnect()` to call `.cancel()` on `this.debouncedFetchPrefixChunk` and `this.debouncedFetchSuffixCompletions`.
  - **Proposed API**:
    ```ts
    protected timeout(fn: () => void, ms: number): number {
      const id = window.setTimeout(fn, ms);
      this.addDisposable(() => window.clearTimeout(id));
      return id;
    }

    protected debounce<T extends (...args: never[]) => void>(
      fn: T,
      waitMs: number
    ): DebouncedFunction<T> {
      const debounced = debounce(fn, waitMs);
      this.addDisposable(() => debounced.cancel());
      return debounced;
    }
    ```

### B. Sub-Controller Ownership (`this.own(controller)`) & Unified `Disposable` Interface

- [ ] 🟢 **Unify controller teardown (`dispose()`) and add `this.own(controller)` to `BaseElement`.**
  - **Smell**: `this.addDisposable(fn)` currently accepts only `() => void`. Every time a component instantiates a sub-controller (`DrawerController`, `ReaderLayoutController`, `ReaderTocController`, `ReaderPanelController`, `QueryParamSync`), it repeats 4–5 lines of teardown boilerplate:
    ```ts
    this.layoutController = new ReaderLayoutController({ root: this });
    this.addDisposable(() => {
      this.layoutController?.destroy();
      this.layoutController = null;
    });
    ```
    This boilerplate appears **5 times** across [`reader/reader_view.client.ts`](reader/reader_view.client.ts) (L204–208, L211–223, L224–237, L1005–1042) and [`dict/dict_toc.client.ts`](dict/dict_toc.client.ts) (L32–43).
  - **Inconsistent teardown naming**:
    - `QueryParamSync` (`core/router.client.ts`) uses `.dispose()`
    - `DrawerController` (`core/drawer.client.ts`), `ReaderLayoutController` (`reader/reader_layout.client.ts`), and `ReaderPanelController` (`reader/reader_panel.client.ts`) use `.destroy()`
    - `ReaderTocController` (`reader/reader_toc.client.ts` L362–370) defines *both* `destroy()` and `dispose()`
  - **Proposed API**: Accept `Disposable = (() => void) | { dispose(): void } | { destroy(): void }` in `DisposableBag.add()`, and add `protected own<T extends Disposable>(resource: T): T` on `BaseElement`:
    ```ts
    this.layoutController = this.own(new ReaderLayoutController({ root: this }));
    ```

### C. Existing `BaseElement` Primitives Bypassed in Subclasses

- [ ] 🟢 **Use `this.delegate()` instead of manual `e.target.closest(...)` inside `this.listen()`**:
  - [`library/library_view.client.ts`](library/library_view.client.ts) (L28–36) manually writes `this.listen(this, "click", (e) => { if (!(e.target instanceof Element)) return; const pill = e.target.closest<HTMLButtonElement>(".filter-pill"); ... })` instead of `this.delegate<HTMLButtonElement>(this, "click", ".filter-pill", ...)`. Also remove its empty `protected override onDisconnect() {}` at L47–49.
  - [`dict/dict_settings.client.ts`](dict/dict_settings.client.ts) (L241–270) manually inspects `e.target instanceof HTMLInputElement && target.classList.contains(...)` inside `this.listen(this, "change", ...)`.
- [ ] 🟢 **Use `this.emit()` instead of manual `new CustomEvent(...)` dispatch**:
  - [`dict/dict_settings.client.ts`](dict/dict_settings.client.ts) (L262–268 and L277–283) manually constructs `this.dispatchEvent(new CustomEvent("dict-...", { bubbles: true, composed: true, detail: ... }))`, which is identical to `this.emit(name, detail)` on `BaseElement` (`core/base_element.client.ts` L254–267).
- [ ] 🟢 **Add missing `HTMLElementTagNameMap` augmentations**:
  - 8 of the 10 custom elements declare `HTMLElementTagNameMap` at the bottom of their module, but [`dict/dict_toc.client.ts`](dict/dict_toc.client.ts) (`"morcus-dict-toc"`) and [`library/library_view.client.ts`](library/library_view.client.ts) (`"morcus-library-view"`) omit it.

---

## 2. Common Helpers to Extract into `core/` (and Existing `core/` Helpers to Adopt)

### A. Extract an Anchored Popover + Focus Trap Controller (`core/popover.client.ts`)

- [ ] 🟡 **Unify `MorcusReaderSettings` and `ReaderTocController` anchored popover & focus-trap logic into `core/popover.client.ts`.**
  - **High-Impact Duplication**: [`reader/reader_settings.client.ts`](reader/reader_settings.client.ts) (L176–362, ~185 lines) and [`reader/reader_toc.client.ts`](reader/reader_toc.client.ts) (L186–345, ~160 lines) are near-clones of the same anchored dropdown/popover lifecycle:
    1. **`open()` / `close()` / `toggle()` / `isOpen()`**: Toggling `[hidden]` on the popover and backdrop, toggling `aria-expanded="true" | "false"` on trigger buttons, and managing transient open-state listeners via `openDisposables = new DisposableBag()`.
    2. **`updatePosition()`**: Measuring `triggerBtn.getBoundingClientRect()`, setting `top = Math.round(rect.bottom + 8)`, clamping horizontal position within `[12, viewportWidth - width - 12]`, computing the diamond caret offset `--caret-left` clamped to `[16, width - 16]`, and attaching `resize` + passive `scroll` listeners while open. ([`dict/abbr_popover.client.ts`](dict/abbr_popover.client.ts) L35–60 implements a 3rd viewport-clamped anchor positioner.)
    3. **Keyboard `Tab` / `Shift+Tab` focus-trap cycling** (~45 lines each) and `Escape` + outside-click dismissal.
  - **Bug caused by divergence**: `MorcusReaderSettings` (L256–272) includes `select:not([disabled])`, `!el.hasAttribute("hidden") && !el.closest("[hidden]")`, and a `jsdom` visibility fallback (`isJsdom`) in its focus-trap query; `ReaderTocController` (L215–222) omits all three, meaning hidden elements in the TOC drawer can steal focus and `Tab` cycling fails in `jsdom` unit tests.

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
  - Yet [`reader/reader_view.client.ts`](reader/reader_view.client.ts) still maintains a private `this.showToast(msg)` (L1124–1132) querying `#reader-toast`, and section permalink copying (L322–324) calls `navigator.clipboard?.writeText(fullUrl).catch(() => {})` directly instead of `copyText(fullUrl)` (missing the fallback and boolean check).
- [ ] 🟢 **Use `bindDismissable` (`core/dismissable.client.ts`) across all popovers and menus.**
  - Hand-rolled outside-click / `pointerdown` / `Escape` dismissal listeners remain in:
    1. [`shell/mobile_menu.client.ts`](shell/mobile_menu.client.ts) (L13–22)
    2. [`dict/abbr_popover.client.ts`](dict/abbr_popover.client.ts) (L93–130)
    3. [`reader/reader_settings.client.ts`](reader/reader_settings.client.ts) (L227–254)
    4. [`reader/reader_toc.client.ts`](reader/reader_toc.client.ts) (L188–212)
- [ ] 🟢 **Return a controller `{ open, close, dispose }` from `setupModalDialog` (`core/dialog.client.ts`).**
  - Because `setupModalDialog` returns only an `unbind` function, [`dialog/report_dialog.client.ts`](dialog/report_dialog.client.ts) (L89–109) had to re-implement `openDialog()` and `closeDialog()` (`typeof dialog.showModal === "function"`, `setAttribute("open", "")`, `clearStatus()`, `focus()`), duplicating `setupModalDialog`'s internal open/close handlers.

### C. Small Duplicated Helpers to Move to `core/dom.client.ts`

- [ ] 🟢 **Consolidate `escapeCss` / `escapeId` into `core/dom.client.ts`**:
  - Duplicated verbatim between [`reader/reader_view.client.ts`](reader/reader_view.client.ts) (L70–75) and [`reader/reader_panel.client.ts`](reader/reader_panel.client.ts) (L36–41).
- [ ] 🟢 **Consolidate one-shot keyframe flash (`flashElement`)**:
  - [`core/anchor_scroll.client.ts`](core/anchor_scroll.client.ts) (`triggerAnchorHighlight`, L5–20) and [`dict/dict_permalink.client.ts`](dict/dict_permalink.client.ts) (`flashSection`, L65–78) implement identical reflow-triggered CSS keyframe restart (`classList.remove("target-active"); void el.offsetWidth; classList.add("target-active"); addEventListener("animationend", ..., { once: true })`).
- [ ] 🟢 **Extract `isPlainLeftClick(e: MouseEvent)`**:
  - Checking `e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey` is repeated in [`dict/dict_search.client.ts`](dict/dict_search.client.ts) (L210–218) and [`reader/reader_view.client.ts`](reader/reader_view.client.ts) (L400–409).
- [ ] 🟢 **Extract `syncIframeTheme(iframe, theme?)`**:
  - Duplicated between [`shell/theme_toggle.client.ts`](shell/theme_toggle.client.ts) (`syncIframesTheme`, L55–69) and [`reader/reader_view.client.ts`](reader/reader_view.client.ts) (`initIframeThemeSync`, L258–280).
- [ ] 🟢 **Extract a `createSingletonSetup(setupFn)` wrapper for global enhancers**:
  - All 5 global enhancers ([`core/anchor_scroll.client.ts`](core/anchor_scroll.client.ts), [`core/back_to_top.client.ts`](core/back_to_top.client.ts), [`core/deferred_iframe.client.ts`](core/deferred_iframe.client.ts), [`shell/mobile_menu.client.ts`](shell/mobile_menu.client.ts), [`dict/abbr_popover.client.ts`](dict/abbr_popover.client.ts)) repeat the exact same `let activeCleanup: (() => void) | null = null` re-initialization guard and teardown check.

---

## 3. Client-Side JS Code Smells & Correctness Traps

- [ ] 🟢 **Replace the 2 raw `.innerHTML` writes in `reader/reader_panel.client.ts` with `setHtml` + `html`.**
  - [`reader/reader_panel.client.ts`](reader/reader_panel.client.ts) at L462 and L494 assigns directly to `this.translationView.innerHTML = ...` with inline `style="min-height: 200px;"`:
    ```ts
    this.translationView.innerHTML = `<div class="reader-translation-loading" style="min-height: 200px;"><span class="loading-spinner"></span></div>`;
    ```
    These are the **only** two places in `src/web/v2/` that bypass `setHtml` from `core/dom.client.ts` (they slipped past `eslint-plugin-no-unsanitized` only because the template literals have zero interpolations). Move `min-height: 200px` to `.reader-translation-loading, .reader-translation-error` in `reader/reader_panel.css` and route both writes through `setHtml(this.translationView, html`...`)`.
- [ ] 🟡 **Fix drawer state split-brain in `MorcusReaderView` (`reader/reader_view.client.ts`).**
  - `minimizeDrawer()` (L654–668) and `restoreDrawer()` (L670–697) each contain a 15-line `else` fallback that manually mutates `.drawer-minimized`, `--drawer-height`, and `aria-valuenow` in parallel with `DrawerController`.
  - In `dismissDictionary()` (L823–831), `MorcusReaderView` bypasses `this.drawerController` and directly calls `dictPanel.style.removeProperty("--drawer-height")` and `splitLayout?.style.removeProperty("--drawer-height")`, **forgetting `document.documentElement`** (which is where `DrawerController` writes `--drawer-height` via `layoutElement: document.documentElement` at L1008). As a result, `document.documentElement` retains a stale `--drawer-height` after closing the dictionary.
- [ ] 🟢 **De-duplicate mobile scroll-past-drawer calculation in `MorcusReaderView`.**
  - `openNote()` (L746–763) and `lookupWord()` (L898–917) in [`reader/reader_view.client.ts`](reader/reader_view.client.ts) contain identical 18-line `requestAnimationFrame` blocks computing `drawerTop` and calling `window.scrollBy({ top: scrollNeeded, left: 0, behavior: "smooth" })` when `window.innerWidth <= 640`. Extract a private `scrollTargetAboveDrawer(targetEl: HTMLElement)` helper.

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
  - Because [`v2.css`](v2.css) imports `reader/*.css` and `library/*.css` *after* `dict/*.css`, unscoped selectors in the later files overwrite earlier rules globally:
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
