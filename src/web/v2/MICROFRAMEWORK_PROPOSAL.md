# UI V2 Client Micro-Framework Proposal (`LifetimeScope`, `BaseController`, & Lifecycle Hardening)

This document proposes a focused, dependency-free evolution of UI V2's client-side foundation (`src/web/v2/core/`). It is a companion to [FRONTEND_AUDIT.md](FRONTEND_AUDIT.md) and incorporates findings from two rounds of technical design review and a full inventory of the 41 `*.client.ts` modules (19 in `core/`, 10 registered custom elements).

---

## 1. Executive Summary & Scope Decision

UI V2 is an **SSR-first, Zero-JS Light DOM** architecture where the server (`*.server.ts`) renders the HTML structure, content updates swap server-rendered `SafeHtml` subtrees via `setHtml()` / `replaceWithHtml()` / `fetchAndSwapPartial()`, and client Custom Elements (`BaseElement`) act as behavioral islands.

An empirical survey of our 41 `*.client.ts` modules revealed a clear pattern: **almost every defect in the client codebase today is a lifecycle/ownership, content-swap, or server↔client selector drift bug, whereas only one (`dict_settings.client.ts`) is a state-fan-out bug:**
1. **Three dead client features caused by unverified server↔client selector removal**:
   - `#reader-breadcrumb-btn` ([`reader_toc.client.ts:132-140`](reader/reader_toc.client.ts)), `#reader-toc-back-btn` ([`L154-163`](reader/reader_toc.client.ts)), and `#reader-toc-filter` + `filter()` ([`L166-171`](reader/reader_toc.client.ts)) are bound by `ReaderTocController` and tested against hand-written fixtures in `reader_toc.test.ts`, **but are never rendered by any `*.server.ts` template** (`reader.test.ts:431-432` explicitly asserts the server omits the back button and filter).
   - Because `#reader-breadcrumb-btn` is never rendered, `ReaderTocController.open()`'s missing re-entrancy guard ([`reader_toc.client.ts:284-299`](reader/reader_toc.client.ts), which unconditionally adds `window` `resize` + `scroll` into `openDisposables` when `open()` is called directly) is currently a **latent defect** rather than reachable in production (`toggle()` guards via `isOpen()`).
2. **`MorcusReaderSettings` has a broken TOC mutual-exclusion fallback** ([`reader_settings.client.ts:188-197`](reader/reader_settings.client.ts)) that mutates `[hidden]` directly on `#reader-toc-drawer` instead of calling `tocController.close()` whenever `getTocController()` returns `null`.
3. **`ReaderPanelController.showTranslationError()` leaks retry listeners** ([`reader_panel.client.ts:494-503`](reader/reader_panel.client.ts)), attaching an untracked `click` listener outside `DisposableBag` on every retry.
4. **Constructor-bound controllers lose state on reconnect**: All four DOM sub-controllers (`ReaderTocController`, `ReaderPanelController`, `ReaderLayoutController`, `DrawerController`) register listeners in their `constructor()` and are destroyed and re-instantiated on every reconnect—discarding `_activeTab`, `isTranslationLoaded`, and `preferredDvh` (including across mobile/desktop media-query crossings in [`dict_toc.client.ts:45-72`](dict/dict_toc.client.ts)).
5. **Detached DOM reference bug across partial page swaps**: `ReaderPanelController` caches ~15 DOM references in its constructor ([`L73-94`](reader/reader_panel.client.ts)), including `notesOriginalParent` and `aboutOriginalParent`. After `swapPage()` replaces the `.reader-text-panel` subtree underneath the still-connected `<morcus-reader-view>`, those cached parents are detached, causing `destroy()` to skip reinsertion and `viewsContainer.remove()` to delete the notes/about subtrees outright.

### Architectural Verdict
- **Proceed immediately with Part 1 (`LifetimeScope` / `BaseController` / `addController` / `use`) and Part 2 (`AnchoredPopoverController`, Sink-Driven `onContentSwap`, & Selector Contract Tests).** Part 2's consolidation of the ~185-line popover block in `MorcusReaderSettings` (L176–362 of the 562-line file) and the ~160-line popover block in `ReaderTocController` (L186–345 of the 371-line file, after deleting dead breadcrumb/back/filter handlers) requires **only Part 1**, not a reactive signals engine.
- **Defer Part 3 (Reactive Signals Engine)** until Parts 1 and 2 have landed. A custom ~90-line depth-sorted push scheduler glitches on dynamic conditional dependency graphs (`if (!open) return;`), so if reactivity is still desired after lifecycle hardening, we will choose between a **~25-line depth-1 `Observable<T>` (`this.watch`)** or **`@preact/signals-core`** (1.4 kB gzip).

---

## 2. Part 1: `LifetimeScope`, `BaseController<Lane>`, & Ownership Contracts

### A. Split `addController(c)` (Host-Lifetime) from `use(cleanup)` (Scope-Lifetime)

A child controller owned by an element has a **different lifetime** from a disposable cleanup registered during a single connection or popover-open cycle. We separate them into two explicit primitives (mirroring Lit's `ReactiveController` protocol):

```ts
/**
 * 1. Long-lived sub-controller attached to a BaseElement (or parent BaseController).
 * Registered once (typically as a class field); survives across disconnect/reconnect
 * cycles so controller state (_activeTab, preferredDvh) is preserved while listeners
 * are cleanly torn down and re-registered on each cycle.
 */
export interface Controller {
  connect?(): void;
  dispose(): void;
  /** Optional hook invoked automatically by HTML sinks when a subtree inside the host is swapped. */
  onContentSwap?(swappedRoot: Element): void;
}

/**
 * 2. Single-use cleanup callback or disposable resource tied to a specific LifetimeScope.
 * Dies permanently when that scope is disposed (e.g. on disconnect or popover close).
 */
export type Disposable = (() => void) | { dispose(): void };
```

- **`this.addController<T extends Controller>(controller: T): T`** lives on **`BaseElement` and `BaseController`**. It registers `controller` in the host's permanent controller list. Whenever the host connects, it calls `controller.connect?.()`; whenever the host disconnects, it calls `controller.dispose()`.
- **`scope.use<T extends Disposable>(resource: T): () => void`** (and `this.use(resource)` on the active connect scope) registers a cleanup that runs when the current `LifetimeScope` is disposed, and returns an `unregister()` handle so child scopes can detach themselves cleanly before parent disposal.

> [!IMPORTANT]
> **Unify `.destroy()` $\rightarrow$ `.dispose()` in a single commit.**
> Do not maintain duck-typed `{ dispose(): void } | { destroy(): void }` dual protocols. Rename `.destroy()` to `.dispose()` across `DrawerController`, `ReaderLayoutController`, `ReaderPanelController`, and `ReaderTocController` in one atomic commit.

### B. One-Shot `LifetimeScope` & Bounded Child Scopes (`createScope()`)

`DisposableBag` is reusable after `dispose()`, whereas `AbortController` is one-shot. `LifetimeScope<Lane>` resolves this by being **explicitly one-shot**:
- When `BaseElement.connectedCallback()` (or `BaseController.connect()`) runs, it creates a fresh active `LifetimeScope` (with a fresh `AbortController`).
- When `disconnectedCallback()` (or `dispose()`) runs, it disposes that `LifetimeScope` and drops it. This eliminates the `if (this.lifetime.signal.aborted)` special case in `BaseElement`.

**Preventing Parent-Bag Accumulation in `createScope()`:**
When a controller creates a child scope for transient "while-open" listeners (`const openScope = this.createScope()`):
1. `DisposableBag.add(fn)` returns an `unregister: () => void` function that removes `fn` from the bag.
2. `openScope` registers with its parent scope via `const detach = parentScope.use(() => openScope.dispose())`. When `openScope.dispose()` is called directly on popover close, it immediately invokes `detach()`, removing the dead `openScope` from `parentScope` so repeated open/close cycles are strictly $O(1)$ in memory.

```mermaid
classDiagram
    class Controller {
        <<interface>>
        +connect?() void
        +dispose() void
        +onContentSwap?(swappedRoot: Element) void
    }
    class LifetimeScope~Lane~ {
        +root: ParentNode
        +signal: AbortSignal
        +listen(target, type, fn, opts)
        +delegate(root, type, selector, fn)
        +latest(lane: Lane) AbortSignal
        +cancel(lane: Lane)
        +timeout(fn, ms) number
        +debounce(fn, ms) DebouncedFunction
        +rAF(fn) number
        +use~T extends Disposable~(d: T) () => void
        +createScope() LifetimeScope
        +$(selector) Element
        +$$(selector) Element[]
        +require(selector) Element
        +dispose() void
    }
    class BaseElement~Lane~ {
        +addController~T extends Controller~(c: T) T
        +notifyContentSwap(swappedRoot: Element) void
        #onConnect()
        #onDisconnect()
        #onContentSwap(swappedRoot: Element)
    }
    class BaseController~Lane~ {
        +addController~T extends Controller~(c: T) T
        +connect()
        +dispose()
        +onContentSwap(swappedRoot: Element)
        #onConnect()
        #onDisconnect()
    }
    Controller <|.. BaseController
    LifetimeScope <-- BaseElement : creates per connect
    LifetimeScope <-- BaseController : creates per connect
```

### C. Capabilities Propagated to `BaseController<Lane>` & `BaseElement<Lane>`

| Capability | Design & Guardrails |
| :--- | :--- |
| **1. `this.timeout(fn, ms)`, `this.debounce(fn, ms)`, & `this.rAF(fn)`** | Automatically clears pending `setTimeout`, `requestAnimationFrame`, and debounced functions when the scope disposes. Fixes 7 unmanaged `setTimeout`s and 4 unmanaged `rAF`s across `report_dialog.client.ts`, `dict_search.client.ts`, and `reader_view.client.ts`. |
| **2. `addController(c)` (Instance Reuse Across Reconnects)** | Controllers are instantiated once as fields (`private readonly toc = this.addController(new ReaderTocController(this));`) with inert constructors. Moving an element in the DOM (`reattach_conformance.test.ts`) or crossing a media query preserves controller state (`_activeTab`, `isTranslationLoaded`, `preferredDvh`) while re-binding DOM listeners in `onConnect()`. |
| **3. Nullable `this.listen(el \| null, ...)` + `this.require<T>(selector)` + Declared Selector Inventory Tests** | `this.listen` accepts `EventTarget \| null \| undefined` as a quiet no-op for genuinely conditional SSR controls (such as `#toggle-macra`), while mandatory elements use `this.require<T>(selector)` and **Declared Selector Inventory Contract Tests** (see §3.C) enforce that every selector appears in at least one server scenario. |
| **4. Async Lifetime (`this.signal`, `this.latest(lane)`)** | Sub-controllers gain `AbortSignal` lanes so async operations like `ReaderPanelController`'s translation fetch abort cleanly on disconnect. |

---

## 3. Part 2: `AnchoredPopoverController`, Sink-Driven `onContentSwap`, & Contract Tests

### A. `AnchoredPopoverController` (`core/popover.client.ts`)

Built on `BaseController` with a private `_isOpen: boolean` and a private `sync()` method, `AnchoredPopoverController` consolidates the popover/focus-trap logic across `MorcusReaderSettings` and `ReaderTocController`:

1. **Preserves `bindDismissable` Focus Semantics**:
   - `bindDismissable` (`core/dismissable.client.ts:48-54`) already focuses `triggerEl` **only on `Escape`**, not on outside-click (so clicking a passage word to dismiss the settings popover does not yank focus back to the settings button).
   - `AnchoredPopoverController` passes `container: panel`, `triggerEl: trigger`, `isOpen: () => this._isOpen`, `ignore: (t) => trigger.contains(t)`, and `onDismiss: () => this.close()` directly to `bindDismissable`.
2. **Clean Reset on Disconnect (`this.close()` in `onDisconnect`)**:
   - `onDisconnect()` calls `this.close()` (not just `this._isOpen = false`), ensuring that if an open popover is disconnected and reattached, `panel.hidden`, `backdrop.hidden`, and `aria-expanded="false"` are reset in the DOM rather than reattaching visually open with no listeners.
3. **Grouped Mutual Exclusion via `ownerDocument`**:
   - Dispatches `morcus:popover-will-open` on `this.host.ownerDocument` **before** mutating the DOM, carrying `{ source: this, group: this.group }` (e.g., `group: "reader-chrome"`).
   - Only popovers sharing the same non-empty `group` close when another opens, preserving support for independent or nested popovers (`abbr_popover`).

```ts
export class AnchoredPopoverController extends BaseController {
  private _isOpen = false;
  private openScope: LifetimeScope | null = null;
  private readonly group?: string;

  get isOpen(): boolean {
    return this._isOpen;
  }

  open(): void {
    if (this._isOpen) return;
    const doc = this.host.ownerDocument;
    if (this.group) {
      doc.dispatchEvent(
        new CustomEvent("morcus:popover-will-open", {
          detail: { source: this, group: this.group },
        })
      );
    }
    this._isOpen = true;
    this.sync();
  }

  close(): void {
    if (!this._isOpen) return;
    this._isOpen = false;
    this.sync();
  }

  protected override onDisconnect(): void {
    this.close();
  }

  private sync(): void {
    const panel = this.getPanel();
    const trigger = this.getTrigger();
    const backdrop = this.getBackdrop();
    if (panel) {
      assertConnected(panel);
      panel.hidden = !this._isOpen;
    }
    if (backdrop) {
      assertConnected(backdrop);
      backdrop.hidden = !this._isOpen;
    }
    if (trigger) {
      assertConnected(trigger);
      trigger.setAttribute("aria-expanded", String(this._isOpen));
    }

    this.openScope?.dispose();
    this.openScope = null;
    if (!this._isOpen || !panel || !trigger) return;

    const doc = this.host.ownerDocument;
    this.updatePosition(trigger, panel);
    const scope = (this.openScope = this.createScope());
    scope.listen(window, "resize", () => this.updatePosition(trigger, panel));
    scope.listen(window, "scroll", () => this.updatePosition(trigger, panel), {
      passive: true,
    });
    if (this.group) {
      scope.listen<CustomEvent<{ source: unknown; group?: string }>>(
        doc,
        "morcus:popover-will-open",
        (e) => {
          if (e.detail.group === this.group && e.detail.source !== this) {
            this.close();
          }
        }
      );
    }
    scope.use(
      bindDismissable({
        container: panel,
        triggerEl: trigger,
        isOpen: () => this._isOpen,
        ignore: (target) => trigger.contains(target),
        onDismiss: () => this.close(),
      })
    );
    scope.use(trapFocus(panel));
  }
}
```

### B. Modeling the Third Lifecycle: Sink-Driven `onContentSwap(swappedRoot)` & `assertConnected`

To make stale DOM references across partial page swaps (`swapPage()`, `fetchAndSwapPartial()`) impossible to ignore or forget:

1. **Trigger `notifyContentSwap(swappedRoot)` Inside the HTML Sinks, Not Call Sites**:
   - `setHtml`, `replaceWithHtml`, and `fetchAndSwapPartial` (`core/dom.client.ts` & `core/partial.client.ts`) are already the single ESLint-enforced choke points for HTML updates.
   - Whenever an HTML sink mutates `container`, it automatically walks up `container`'s ancestors and invokes `host.notifyContentSwap(container)` on any enclosing `BaseElement`, which forwards `onContentSwap(container)` to all registered controllers. Callers never have to remember to invoke `notifyContentSwap()` manually.
2. **Pass `swappedRoot: Element` to `onContentSwap(swappedRoot: Element)`**:
   - Controllers inspect `swappedRoot` to see if the swap affected their domain (e.g., `ReaderPanelController` only re-runs notes/about adoption when `swappedRoot` contains or is `.reader-text-panel`).
3. **Delete `notesOriginalParent` / `aboutOriginalParent`**:
   - Restoring adopted DOM nodes to a parent captured at construction cannot be made valid across partial swaps. `ReaderPanelController` will stop caching `notesOriginalParent` / `aboutOriginalParent` and instead re-query the live container if needed or simply discard on swap.
4. **Enforce a Dev-Only `assertConnected(el)` Invariant on DOM Writes**:
   - Rather than relying solely on convention to distinguish "static shell chrome" from "swapped content subtrees" (which breaks if a template later moves a popover inside a swapped container), DOM write helpers (`sync()`, `updatePosition()`) call a dev-only `assertConnected(el)` (`if (!el.isConnected) console.error(...)`). Unlike `listen(null)`, writing to a detached element has **zero false positives**—it is always a bug.

### C. Hardening the Test Safety Net Before Refactoring

1. **Declared Selector Inventory & Zero-Scenario Failure Rule**:
   - Simply asserting `require()` selectors leaves optional/conditional selectors unchecked—which is how `#reader-breadcrumb-btn`, `#reader-toc-back-btn`, and `#reader-toc-filter` became dead code when the server stopped rendering them.
   - Each slice declares an explicit selector inventory enumerating which server scenarios render each selector:
     ```ts
     export const READER_SELECTORS = {
       tocDrawer:   { id: "reader-toc-drawer", requiredIn: ["work-page"] },
       tocBtn:      { id: "reader-toc-btn",    requiredIn: ["work-page"] },
       toggleMacra: { id: "toggle-macra",      optionalIn: ["work-with-macra"] },
     } as const;
     ```
   - **Contract Test Invariant**: Every declared selector must resolve in all its `requiredIn` scenarios AND in all its named `optionalIn` scenarios—and **any selector bound by the client that resolves in zero server scenarios fails the test**.
2. **Expand `reattach_conformance.test.ts` Fixtures & Open-State Reattach**:
   - Add `#reader-toc-drawer`, `#reader-toc-btn`, and `.reader-splitter` to the `"morcus-reader-view"` fixture in [`core/reattach_conformance.test.ts`](core/reattach_conformance.test.ts) (L128–152) so `ReaderTocController` and `ReaderLayoutController` don't early-return.
   - Add an open-popover reattach test that opens `morcus-reader-settings` / `ReaderTocController`, moves the host element in the DOM, and asserts that the popover closes cleanly (`hidden === true`, `aria-expanded === "false"`) and re-binds its trigger listener.
   - Add nested `DisposableBag` / `LifetimeScope` `unregister()` tests in `disposable.test.ts`.

---

## 4. Part 3: Deferred Reactivity Evaluation (Post-Lifecycle Migration)

Once Steps 1–5 below are complete, we will evaluate whether any residual state-synchronization boilerplate justifies a reactive primitive. If it does, we will choose between:
1. **Option A (Preferred if depth-1 watching suffices): ~25-Line `Observable<T>` + `this.watch(obs, fn)`** (no `computed()` nodes $\rightarrow$ depth is always 1, making diamonds and ordering glitches impossible).
2. **Option B (If derived `computed()` graphs are needed): `@preact/signals-core`** (~1.4 kB gzip).

---

## 5. Sequenced Implementation Plan

1. **Step 1 — Managed Timers (`this.timeout`, `this.debounce`, `this.rAF`)** (🟢)
   - Land on `BaseElement` immediately and migrate the 11 unmanaged `setTimeout` / `rAF` call sites (`report_dialog.client.ts`, `dict_search.client.ts`, `reader_view.client.ts`).
2. **Step 2 — Selector Inventory Contract Test & Expanded `reattach_conformance.test.ts`** (🟢)
   - Run the selector inventory across `reader_toc.client.ts` and `reader_settings.client.ts` first to verify all dead vs. live selectors.
   - Expand `reattach_conformance.test.ts` fixtures (`#reader-toc-drawer`, `#reader-toc-btn`, `.reader-splitter`, plus open-before-move popover assertions) and add `unregister()` tests to `disposable.test.ts`.
3. **Step 3 — `LifetimeScope` + `BaseController` + `addController(c)` / `use(cleanup)`** (🟡)
   - Unify `.destroy()` $\rightarrow$ `.dispose()` across `DrawerController`, `ReaderLayoutController`, `ReaderPanelController`, and `ReaderTocController`.
   - Extract one-shot per-connect `LifetimeScope` and `BaseController<Lane>` in `core/base_element.client.ts`.
   - Migrate `ReaderTocController` first as the proof case—**deleting** the dead `#reader-breadcrumb-btn`, `#reader-toc-back-btn`, and `#reader-toc-filter` handlers rather than porting them.
4. **Step 4 — `AnchoredPopoverController` (`core/popover.client.ts`)** (🟡)
   - Extract `AnchoredPopoverController` + `trapFocus` with `bindDismissable` focus semantics, `close()` on disconnect, `assertConnected()`, and grouped `morcus:popover-will-open` mutual exclusion.
   - Refactor `MorcusReaderSettings` and `ReaderTocController` to use `AnchoredPopoverController`, deleting `getTocController()` and the `#reader-toc-drawer[hidden]` DOM-poking fallback.
5. **Step 5 — Sink-Driven `onContentSwap(swappedRoot)` & Remaining Controllers** (🟡)
   - Wire automatic `notifyContentSwap(container)` into `setHtml` / `replaceWithHtml` / `fetchAndSwapPartial`.
   - Update `ReaderPanelController` to implement `onContentSwap(swappedRoot)`, delete `notesOriginalParent` / `aboutOriginalParent`, and fix the retry listener leak in `showTranslationError()`.
   - Migrate `DrawerController` and `ReaderLayoutController` to `BaseController` + `addController()`.
6. **Step 6 — Re-evaluate Reactivity** (🟢)
   - Assess whether any remaining state-sync code warrants a ~25-line `Observable<T>` (`this.watch`) or if `BaseController` + `sync()` methods already resolved the pain.
