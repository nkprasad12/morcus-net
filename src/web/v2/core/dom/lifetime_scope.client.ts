import {
  DisposableBag,
  type CleanupFn,
  type Unregister,
} from "@/web/v2/core/dom/disposable.client";
import { canHandleActivation } from "@/web/v2/core/dom/js_gate.client";
import {
  LatestTask,
  type DebouncedFunction,
} from "@/web/v2/core/dom/task.client";
export type { DebouncedFunction } from "@/web/v2/core/dom/task.client";
export type { CleanupFn, Unregister };

/**
 * Single-use cleanup callback or disposable resource tied to a specific LifetimeScope.
 * Dies permanently when that scope is disposed (e.g. on disconnect or popover close).
 */
export type Disposable = CleanupFn | { dispose(): void };

/** Event types that can be native activations, gated in `listen()`. */
const GATED_TYPES: ReadonlySet<string> = new Set([
  "click",
  "submit",
  "keydown",
]);

/**
 * Returns true if a mouse event is a primary (left) click without modifier keys (Ctrl, Meta, Shift, Alt).
 */
export function isPlainLeftClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

/** A `keydown` fired during active IME composition. */
function isComposingKeydown(e: Event): boolean {
  return e.type === "keydown" && e instanceof KeyboardEvent && e.isComposing;
}

/**
 * A modified (Cmd / Ctrl / Shift / Alt) or non-primary click on or inside an
 * `<a href>`: the browser's own action (new tab, new window, download) wins.
 */
function isModifiedLinkClick(e: Event): boolean {
  return (
    e.type === "click" &&
    e instanceof MouseEvent &&
    !isPlainLeftClick(e) &&
    e.target instanceof Element &&
    e.target.closest("a[href]") !== null
  );
}

function requireFromRoot<T extends HTMLElement = HTMLElement>(
  root: ParentNode | null,
  selector: string
): T {
  const el = root?.querySelector<T>(selector);
  if (!el) {
    const hostName =
      root instanceof Element ? `<${root.tagName.toLowerCase()}>` : "root";
    throw new Error(
      `Required element matching selector "${selector}" not found in ${hostName}`
    );
  }
  return el;
}

/**
 * Creates a host-lifetime debounced function that survives disconnect/reconnect
 * cycles. Pending executions are bound to the host's active LifetimeScope and
 * cancel automatically on disconnect, but the function handle remains valid and
 * schedules work on the renewed scope upon reconnect.
 */
export function createDurableDebounce<T extends (...args: never[]) => void>(
  isConnected: () => boolean,
  getScope: () => {
    timeout(fn: () => void, ms: number): number;
    clearTimeout(id: number): void;
  },
  fn: T,
  waitMs: number
): DebouncedFunction<T> {
  let timer: number | null = null;

  const debounced = (...args: Parameters<T>) => {
    if (timer !== null) {
      getScope().clearTimeout(timer);
      timer = null;
    }
    if (!isConnected()) return;
    timer = getScope().timeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };

  debounced.cancel = () => {
    if (timer !== null) {
      getScope().clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
}

/**
 * One-shot lifecycle scope that owns event listeners, delegated listeners,
 * supersession lanes, AbortSignals, managed timers/rAFs, and child scopes
 * for a single connection or open cycle.
 */
export class LifetimeScope<Lane extends string = never> {
  public readonly root: ParentNode | null;
  /**
   * The component whose code registers listeners on this scope, or `null`
   * for standalone scopes (global setups, unattached controllers). The
   * activation gate in {@link listen} checks components below `owner` only;
   * with no owner it checks up to the document.
   */
  public readonly owner: Element | null;
  readonly #disposables = new DisposableBag();
  readonly #lifetime = new AbortController();
  readonly #lanes = new Map<Lane, LatestTask>();
  readonly #timeouts = new Set<number>();
  readonly #rafs = new Set<number>();
  #disposed = false;
  readonly #onDisposeCallback?: Unregister;

  constructor(
    root: ParentNode | null,
    onDisposeCallback?: Unregister,
    owner: Element | null = null
  ) {
    this.root = root;
    this.#onDisposeCallback = onDisposeCallback;
    this.owner = owner;
  }

  public get disposed(): boolean {
    return this.#disposed;
  }

  public get signal(): AbortSignal {
    return this.#lifetime.signal;
  }

  #isScopeActive(): boolean {
    if (this.#disposed || !this.root) return false;
    if (
      this.root instanceof HTMLElement &&
      (this.owner === this.root ||
        customElements.get(this.root.localName) !== undefined) &&
      !this.root.isConnected
    ) {
      return false;
    }
    return true;
  }

  public latest(lane: Lane): AbortSignal {
    if (this.#disposed) {
      return this.#lifetime.signal;
    }
    let task = this.#lanes.get(lane);
    if (task === undefined) {
      task = new LatestTask();
      this.#lanes.set(lane, task);
    }
    return task.start();
  }

  public cancel(lane: Lane): void {
    this.#lanes.get(lane)?.cancel();
  }

  public use(resource: Disposable): void {
    const cleanup: CleanupFn =
      typeof resource === "function" ? resource : () => resource.dispose();
    if (this.#disposed) {
      cleanup();
      return;
    }
    this.#disposables.add(cleanup);
  }

  /**
   * Creates a bounded child scope (e.g., for transient "while-open" popover listeners).
   * Disposing the child scope detaches it from this parent scope immediately so repeated
   * open/close cycles are strictly O(1) in memory.
   */
  public createScope<ChildLane extends string = never>(
    root: ParentNode = this.root ?? document
  ): LifetimeScope<ChildLane> {
    if (this.#disposed) {
      const dead = new LifetimeScope<ChildLane>(root, undefined, this.owner);
      dead.dispose();
      return dead;
    }
    let detach: Unregister | null = null;
    const child = new LifetimeScope<ChildLane>(
      root,
      () => {
        detach?.();
        detach = null;
      },
      this.owner
    );
    detach = this.#disposables.add(() => child.dispose());
    return child;
  }

  /**
   * Adds a listener removed when this scope is disposed.
   *
   * **Activation gate:** for `click`, `submit` and Enter / Space `keydown`,
   * the listener is skipped when the event lands in, or a native control on
   * its path points into, a component that isn't running (see
   * {@link canHandleActivation}). A handler therefore never cancels a native
   * action whose No-JS replacement belongs to a failed or un-upgraded owner.
   * Skips log a `console.warn` outside production.
   *
   * **Pre-guards** (same event types, checked before the gate):
   * - `keydown` during IME composition (`isComposing`) is skipped, so a key
   *   that commits a composition never triggers a shortcut.
   * - A modified (Cmd / Ctrl / Shift / Alt) or non-primary `click` on or
   *   inside an `<a href>` is skipped, so the browser can open the link in a
   *   new tab / window.
   *
   * `defaultPrevented` is deliberately *not* filtered here: `listen` attaches
   * directly to its target and may be a same-element observer (e.g.
   * `ComboboxController` observing a form's `submit` alongside `hijackForm`).
   * {@link delegate} does filter it.
   */
  public listen<K extends keyof HTMLElementEventMap>(
    target: EventTarget | null | undefined,
    type: K,
    listener: (e: HTMLElementEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  public listen<T = unknown>(
    target: EventTarget | null | undefined,
    type: string,
    listener: (e: CustomEvent<T>) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  public listen(
    target: EventTarget | null | undefined,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void;
  public listen(
    target: EventTarget | null | undefined,
    type: string,
    listener: unknown,
    options?: boolean | AddEventListenerOptions
  ): void {
    if (!target || this.#disposed) return;
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const raw = listener as EventListenerOrEventListenerObject;
    const handler: EventListenerOrEventListenerObject = GATED_TYPES.has(type)
      ? (e: Event) => {
          if (isComposingKeydown(e) || isModifiedLinkClick(e)) return;
          if (!canHandleActivation(e, this.owner)) return;
          if (typeof raw === "function") raw.call(target, e);
          else raw.handleEvent(e);
        }
      : raw;
    target.addEventListener(type, handler, options);
    this.use(() => {
      target.removeEventListener(type, handler, options);
    });
  }

  public delegate<T extends HTMLElement = HTMLElement>(
    root: EventTarget | null | undefined,
    type: string,
    selector: string,
    handler: (e: Event, matched: T) => void,
    options?: boolean | AddEventListenerOptions
  ): void {
    if (!root || this.#disposed) return;
    const fn = (e: Event) => {
      // Unlike `listen` (which may be a same-element observer, e.g. a
      // combobox watching form `submit` alongside `hijackForm`), a delegated
      // handler matches bubbling events against a child selector: always
      // action-handler semantics. An event a deeper handler already consumed
      // must not trigger a second action.
      if (e.defaultPrevented) return;
      if (e.target instanceof Element) {
        const match = e.target.closest<T>(selector);
        if (match) {
          handler(e, match);
        }
      }
    };
    this.listen(root, type, fn, options);
  }

  public $<T extends HTMLElement = HTMLElement>(selector: string): T | null {
    return this.root?.querySelector<T>(selector) ?? null;
  }

  public $$<T extends HTMLElement = HTMLElement>(selector: string): T[] {
    return this.root ? Array.from(this.root.querySelectorAll<T>(selector)) : [];
  }

  public require<T extends HTMLElement = HTMLElement>(selector: string): T {
    return requireFromRoot<T>(this.root, selector);
  }

  public timeout(fn: () => void, ms: number): number {
    if (!this.#isScopeActive()) return 0;
    const id = window.setTimeout(() => {
      this.#timeouts.delete(id);
      fn();
    }, ms);
    this.#timeouts.add(id);
    return id;
  }

  public clearTimeout(id: number): void {
    window.clearTimeout(id);
    this.#timeouts.delete(id);
  }

  public rAF(fn: FrameRequestCallback): number {
    if (!this.#isScopeActive()) return 0;
    const id = window.requestAnimationFrame((time) => {
      this.#rafs.delete(id);
      fn(time);
    });
    this.#rafs.add(id);
    return id;
  }

  public cancelRAF(id: number): void {
    window.cancelAnimationFrame(id);
    this.#rafs.delete(id);
  }

  public debounce<T extends (...args: never[]) => void>(
    fn: T,
    waitMs: number
  ): DebouncedFunction<T> {
    return createDurableDebounce(
      () => this.#isScopeActive(),
      () => this,
      fn,
      waitMs
    );
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#onDisposeCallback?.();
    // Cancel in-flight async work first, so listener teardown below cannot be
    // raced by a late response.
    for (const task of this.#lanes.values()) {
      task.cancel();
    }
    this.#lanes.clear();
    for (const id of this.#timeouts) {
      window.clearTimeout(id);
    }
    this.#timeouts.clear();
    for (const id of this.#rafs) {
      window.cancelAnimationFrame(id);
    }
    this.#rafs.clear();
    this.#lifetime.abort();
    this.#disposables.dispose();
  }
}

export const DEAD_SCOPE: LifetimeScope<never> = (() => {
  const dummyRoot =
    typeof document !== "undefined" ? document.createDocumentFragment() : null;
  const dead = new LifetimeScope<never>(dummyRoot);
  dead.dispose();
  return dead;
})();
