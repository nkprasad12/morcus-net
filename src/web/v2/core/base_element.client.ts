import { DisposableBag } from "@/web/v2/core/disposable.client";
import {
  syncQueryParam,
  type QueryParamSync,
  type SyncQueryParamOptions,
} from "@/web/v2/core/router.client";
import { LatestTask, type DebouncedFunction } from "@/web/v2/core/task.client";

/**
 * Long-lived sub-controller attached to a BaseElement (or parent BaseController).
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
 * Single-use cleanup callback or disposable resource tied to a specific LifetimeScope.
 * Dies permanently when that scope is disposed (e.g. on disconnect or popover close).
 */
export type Disposable = (() => void) | { dispose(): void };

const ABORTED_SIGNAL: AbortSignal = (() => {
  const controller = new AbortController();
  controller.abort();
  return controller.signal;
})();

function requireFromRoot<T extends HTMLElement = HTMLElement>(
  root: ParentNode,
  selector: string
): T {
  const el = root.querySelector<T>(selector);
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
 * One-shot lifecycle scope that owns event listeners, delegated listeners,
 * supersession lanes, AbortSignals, managed timers/rAFs, and child scopes
 * for a single connection or open cycle.
 */
export class LifetimeScope<Lane extends string = never> {
  public readonly root: ParentNode;
  private readonly disposables = new DisposableBag();
  private readonly lifetime = new AbortController();
  private readonly lanes = new Map<Lane, LatestTask>();
  private readonly timeouts = new Set<number>();
  private readonly rafs = new Set<number>();
  private _disposed = false;
  private readonly onDisposeCallback?: () => void;

  constructor(root: ParentNode, onDisposeCallback?: () => void) {
    this.root = root;
    this.onDisposeCallback = onDisposeCallback;
  }

  public get disposed(): boolean {
    return this._disposed;
  }

  public get signal(): AbortSignal {
    return this.lifetime.signal;
  }

  private isScopeActive(): boolean {
    if (this._disposed) return false;
    if (this.root instanceof BaseElement && !this.root.isConnected) {
      return false;
    }
    return true;
  }

  public latest(lane: Lane): AbortSignal {
    if (this._disposed) {
      return this.lifetime.signal;
    }
    let task = this.lanes.get(lane);
    if (task === undefined) {
      task = new LatestTask();
      this.lanes.set(lane, task);
    }
    return task.start();
  }

  public cancel(lane: Lane): void {
    this.lanes.get(lane)?.cancel();
  }

  public use(resource: Disposable): () => void {
    const cleanup: () => void =
      typeof resource === "function" ? resource : () => resource.dispose();
    if (this._disposed) {
      cleanup();
      return () => {};
    }
    return this.disposables.add(cleanup);
  }

  /**
   * Creates a bounded child scope (e.g., for transient "while-open" popover listeners).
   * Disposing the child scope detaches it from this parent scope immediately so repeated
   * open/close cycles are strictly O(1) in memory.
   */
  public createScope<ChildLane extends string = never>(
    root: ParentNode = this.root
  ): LifetimeScope<ChildLane> {
    if (this._disposed) {
      const dead = new LifetimeScope<ChildLane>(root);
      dead.dispose();
      return dead;
    }
    let detach: (() => void) | null = null;
    const child = new LifetimeScope<ChildLane>(root, () => {
      detach?.();
      detach = null;
    });
    detach = this.use(() => child.dispose());
    return child;
  }

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
    if (!target || this._disposed) return;
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const handler = listener as EventListenerOrEventListenerObject;
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
    if (!root || this._disposed) return;
    const fn = (e: Event) => {
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
    return this.root.querySelector<T>(selector);
  }

  public $$<T extends HTMLElement = HTMLElement>(selector: string): T[] {
    return Array.from(this.root.querySelectorAll<T>(selector));
  }

  public require<T extends HTMLElement = HTMLElement>(selector: string): T {
    return requireFromRoot<T>(this.root, selector);
  }

  public timeout(fn: () => void, ms: number): number {
    if (!this.isScopeActive()) return 0;
    const id = window.setTimeout(() => {
      this.timeouts.delete(id);
      fn();
    }, ms);
    this.timeouts.add(id);
    return id;
  }

  public clearTimeout(id: number): void {
    window.clearTimeout(id);
    this.timeouts.delete(id);
  }

  public rAF(fn: FrameRequestCallback): number {
    if (!this.isScopeActive()) return 0;
    const id = window.requestAnimationFrame((time) => {
      this.rafs.delete(id);
      fn(time);
    });
    this.rafs.add(id);
    return id;
  }

  public cancelRAF(id: number): void {
    window.cancelAnimationFrame(id);
    this.rafs.delete(id);
  }

  public debounce<T extends (...args: never[]) => void>(
    fn: T,
    waitMs: number
  ): DebouncedFunction<T> {
    let timer: number | null = null;

    const debounced = (...args: Parameters<T>) => {
      if (timer !== null) {
        this.clearTimeout(timer);
        timer = null;
      }
      if (!this.isScopeActive()) return;
      timer = this.timeout(() => {
        timer = null;
        fn(...args);
      }, waitMs);
    };

    debounced.cancel = () => {
      if (timer !== null) {
        this.clearTimeout(timer);
        timer = null;
      }
    };

    return debounced;
  }

  public dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this.onDisposeCallback?.();
    // Cancel in-flight async work first, so listener teardown below cannot be
    // raced by a late response.
    for (const task of this.lanes.values()) {
      task.cancel();
    }
    this.lanes.clear();
    for (const id of this.timeouts) {
      window.clearTimeout(id);
    }
    this.timeouts.clear();
    for (const id of this.rafs) {
      window.cancelAnimationFrame(id);
    }
    this.rafs.clear();
    this.lifetime.abort();
    this.disposables.dispose();
  }
}

const ACTIVE_CONTROLLERS_BY_ROOT = new WeakMap<ParentNode, Set<Controller>>();

/**
 * Propagates a content-swap notification from an HTML sink (`setHtml`,
 * `replaceWithHtml`, `swapElementContent`, `fetchAndSwapPartial`) up the
 * ancestor chain of `swappedRoot`, invoking `notifyContentSwap(swappedRoot)`
 * on any enclosing `BaseElement` and `onContentSwap(swappedRoot)` on any
 * connected standalone `BaseController` whose root contains `swappedRoot`.
 */
export function notifyContentSwap(swappedRoot: Element): void {
  const notified = new Set<Controller>();
  let current: Node | null = swappedRoot;

  while (current) {
    if (current instanceof BaseElement) {
      current.notifyContentSwap(swappedRoot, notified);
    }
    if (
      current instanceof Element ||
      current instanceof Document ||
      current instanceof DocumentFragment
    ) {
      const rootControllers = ACTIVE_CONTROLLERS_BY_ROOT.get(current);
      if (rootControllers) {
        for (const controller of rootControllers) {
          if (!notified.has(controller)) {
            notified.add(controller);
            controller.onContentSwap?.(swappedRoot);
          }
        }
      }
    }
    current = current.parentNode;
  }
}

/**
 * Base class for reusable DOM sub-controllers with automatic per-connect
 * LifetimeScope management and instance preservation across host reconnects.
 */
export abstract class BaseController<Lane extends string = never>
  implements Controller
{
  public readonly root: ParentNode;
  private scope: LifetimeScope<Lane> | null = null;
  private readonly controllers: Controller[] = [];

  constructor(root: ParentNode = document) {
    this.root = root;
  }

  protected get host(): HTMLElement | null {
    return this.root instanceof HTMLElement ? this.root : null;
  }

  protected get ownerDocument(): Document {
    return this.root instanceof Node
      ? this.root.ownerDocument ?? document
      : document;
  }

  public get isConnected(): boolean {
    return this.scope !== null && !this.scope.disposed;
  }

  protected onConnect(): void {}

  protected onDisconnect(): void {}

  public addController<T extends Controller>(controller: T): T {
    if (!this.controllers.includes(controller)) {
      this.controllers.push(controller);
      if (this.scope && !this.scope.disposed) {
        controller.connect?.();
      }
    }
    return controller;
  }

  public connect(): void {
    if (this.scope && !this.scope.disposed) {
      this.dispose();
    }
    this.scope = new LifetimeScope<Lane>(this.root);
    let set = ACTIVE_CONTROLLERS_BY_ROOT.get(this.root);
    if (!set) {
      set = new Set<Controller>();
      ACTIVE_CONTROLLERS_BY_ROOT.set(this.root, set);
    }
    set.add(this);
    for (const controller of this.controllers) {
      controller.connect?.();
    }
    this.onConnect();
  }

  public dispose(): void {
    const wasConnected = this.scope !== null && !this.scope.disposed;
    ACTIVE_CONTROLLERS_BY_ROOT.get(this.root)?.delete(this);
    for (const controller of this.controllers) {
      controller.dispose();
    }
    if (wasConnected) {
      this.onDisconnect();
    }
    this.scope?.dispose();
    this.scope = null;
  }

  public onContentSwap(swappedRoot: Element): void {
    for (const controller of this.controllers) {
      controller.onContentSwap?.(swappedRoot);
    }
  }

  protected get signal(): AbortSignal {
    return this.scope?.signal ?? ABORTED_SIGNAL;
  }

  protected latest(lane: Lane): AbortSignal {
    return this.scope ? this.scope.latest(lane) : ABORTED_SIGNAL;
  }

  protected cancel(lane: Lane): void {
    this.scope?.cancel(lane);
  }

  protected use(resource: Disposable): () => void {
    if (!this.scope) {
      return () => {};
    }
    return this.scope.use(resource);
  }

  protected createScope<ChildLane extends string = never>(
    root: ParentNode = this.root
  ): LifetimeScope<ChildLane> {
    if (!this.scope) {
      const dead = new LifetimeScope<ChildLane>(root);
      dead.dispose();
      return dead;
    }
    return this.scope.createScope<ChildLane>(root);
  }

  protected listen<K extends keyof HTMLElementEventMap>(
    target: EventTarget | null | undefined,
    type: K,
    listener: (e: HTMLElementEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  protected listen<T = unknown>(
    target: EventTarget | null | undefined,
    type: string,
    listener: (e: CustomEvent<T>) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  protected listen(
    target: EventTarget | null | undefined,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void;
  protected listen(
    target: EventTarget | null | undefined,
    type: string,
    listener: unknown,
    options?: boolean | AddEventListenerOptions
  ): void {
    if (!this.scope || !target) return;
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const handler = listener as EventListenerOrEventListenerObject;
    this.scope.listen(target, type, handler, options);
  }

  protected delegate<T extends HTMLElement = HTMLElement>(
    root: EventTarget | null | undefined,
    type: string,
    selector: string,
    handler: (e: Event, matched: T) => void,
    options?: boolean | AddEventListenerOptions
  ): void {
    this.scope?.delegate(root, type, selector, handler, options);
  }

  protected $<T extends HTMLElement = HTMLElement>(selector: string): T | null {
    return this.root.querySelector<T>(selector);
  }

  protected $$<T extends HTMLElement = HTMLElement>(selector: string): T[] {
    return Array.from(this.root.querySelectorAll<T>(selector));
  }

  protected require<T extends HTMLElement = HTMLElement>(selector: string): T {
    return requireFromRoot<T>(this.root, selector);
  }

  protected timeout(fn: () => void, ms: number): number {
    return this.scope ? this.scope.timeout(fn, ms) : 0;
  }

  protected clearTimeout(id: number): void {
    this.scope?.clearTimeout(id);
  }

  protected rAF(fn: FrameRequestCallback): number {
    return this.scope ? this.scope.rAF(fn) : 0;
  }

  protected cancelRAF(id: number): void {
    this.scope?.cancelRAF(id);
  }

  protected debounce<T extends (...args: never[]) => void>(
    fn: T,
    waitMs: number
  ): DebouncedFunction<T> {
    let timer: number | null = null;

    const debounced = (...args: Parameters<T>) => {
      if (timer !== null) {
        this.clearTimeout(timer);
        timer = null;
      }
      if (!this.isConnected) return;
      timer = this.timeout(() => {
        timer = null;
        fn(...args);
      }, waitMs);
    };

    debounced.cancel = () => {
      if (timer !== null) {
        this.clearTimeout(timer);
        timer = null;
      }
    };

    return debounced;
  }
}

/**
 * Lightweight base class for UI V2 Light DOM Web Components.
 *
 * Provides automatic cleanup for event listeners, delegation, subscriptions,
 * timers, child controllers, and in-flight async work when disconnected from
 * the DOM, eliminating manual removeEventListener / AbortController boilerplate.
 *
 * `Lane` names the supersession lanes this component uses with {@link latest}.
 * It defaults to `never`, so calling `latest()` without declaring lanes is a
 * compile error rather than a silently-created lane:
 *
 * ```ts
 * class MorcusDictSearch extends BaseElement<"completions" | "results"> {}
 * ```
 */
export abstract class BaseElement<
  Lane extends string = never
> extends HTMLElement {
  private scope: LifetimeScope<Lane> | null = null;
  private readonly controllers: Controller[] = [];

  /**
   * Lifecycle hook invoked when the element is inserted into the document.
   *
   * **Must be idempotent, and must re-register every listener it needs each
   * time it runs.** Moving an element in the DOM disconnects and reconnects it,
   * and `disconnectedCallback` disposes the active {@link LifetimeScope} — so
   * by the time this runs again, everything registered through {@link listen},
   * {@link delegate} or {@link use} is already gone.
   */
  protected onConnect(): void {}

  /** Lifecycle hook invoked when the element is removed from the document. */
  protected onDisconnect(): void {}

  /** Optional hook invoked automatically by HTML sinks when a subtree inside the host is swapped. */
  protected onContentSwap(swappedRoot: Element): void {
    void swappedRoot;
  }

  /**
   * Registers a long-lived child controller that connects and disposes in
   * lockstep with this host element while preserving its instance across reconnects.
   */
  public addController<T extends Controller>(controller: T): T {
    if (!this.controllers.includes(controller)) {
      this.controllers.push(controller);
      if (this.scope && !this.scope.disposed) {
        controller.connect?.();
      }
    }
    return controller;
  }

  /**
   * Notifies this element and all registered controllers that a DOM subtree
   * within this element was swapped via an HTML sink.
   */
  public notifyContentSwap(
    swappedRoot: Element,
    notified?: Set<Controller>
  ): void {
    this.onContentSwap(swappedRoot);
    for (const controller of this.controllers) {
      if (notified?.has(controller)) continue;
      notified?.add(controller);
      controller.onContentSwap?.(swappedRoot);
    }
  }

  connectedCallback() {
    if (this.scope && !this.scope.disposed) {
      this.scope.dispose();
    }
    this.scope = new LifetimeScope<Lane>(this);
    for (const controller of this.controllers) {
      controller.connect?.();
    }
    this.onConnect();
  }

  disconnectedCallback() {
    for (const controller of this.controllers) {
      controller.dispose();
    }
    this.scope?.dispose();
    this.scope = null;
    this.onDisconnect();
  }

  /**
   * An AbortSignal aborted when this element disconnects.
   *
   * Use for one-shot async work that should simply stop if the element goes
   * away. For work where a newer request should supersede an older one, use
   * {@link latest} instead.
   */
  protected get signal(): AbortSignal {
    return this.scope?.signal ?? ABORTED_SIGNAL;
  }

  /**
   * Returns an AbortSignal for a named supersession lane, aborting whatever
   * was previously in flight *in that lane only*.
   *
   * Lanes are independent: starting `latest("results")` does not disturb
   * `latest("completions")`. This matters because a single component can run
   * genuinely concurrent requests whose results are both still wanted.
   *
   * All lanes are also aborted when the element disconnects.
   */
  protected latest(lane: Lane): AbortSignal {
    return this.scope ? this.scope.latest(lane) : ABORTED_SIGNAL;
  }

  /**
   * Aborts whatever is in flight in `lane` without starting anything new.
   *
   * Use when the result stops being wanted for a reason other than being
   * superseded, e.g. the UI that would display it has been dismissed.
   */
  protected cancel(lane: Lane): void {
    this.scope?.cancel(lane);
  }

  /**
   * Registers a cleanup callback or disposable resource to be disposed when
   * the current connection scope ends, returning an unregister handle.
   */
  protected use(resource: Disposable): () => void {
    if (!this.scope) {
      return () => {};
    }
    return this.scope.use(resource);
  }

  /**
   * Registers a cleanup callback to be called when disconnectedCallback executes.
   */
  protected addDisposable(fn: () => void): () => void {
    return this.use(fn);
  }

  /**
   * Creates a bounded child scope tied to the current connection scope.
   */
  protected createScope<ChildLane extends string = never>(
    root: ParentNode = this
  ): LifetimeScope<ChildLane> {
    if (!this.scope) {
      const dead = new LifetimeScope<ChildLane>(root);
      dead.dispose();
      return dead;
    }
    return this.scope.createScope<ChildLane>(root);
  }

  /**
   * Attaches an event listener that is automatically unregistered on disconnect.
   * Quietly no-ops if target is null or undefined.
   */
  protected listen<K extends keyof HTMLElementEventMap>(
    target: EventTarget | null | undefined,
    type: K,
    listener: (e: HTMLElementEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  protected listen<T = unknown>(
    target: EventTarget | null | undefined,
    type: string,
    listener: (e: CustomEvent<T>) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  protected listen(
    target: EventTarget | null | undefined,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void;
  protected listen(
    target: EventTarget | null | undefined,
    type: string,
    listener: unknown,
    options?: boolean | AddEventListenerOptions
  ): void {
    if (!this.scope || !target) return;
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const handler = listener as EventListenerOrEventListenerObject;
    this.scope.listen(target, type, handler, options);
  }

  /**
   * Attaches a delegated event listener that fires only when matching the selector.
   * Automatically cleaned up on disconnect.
   */
  protected delegate<T extends HTMLElement = HTMLElement>(
    root: EventTarget | null | undefined,
    type: string,
    selector: string,
    handler: (e: Event, matched: T) => void,
    options?: boolean | AddEventListenerOptions
  ): void {
    this.scope?.delegate(root, type, selector, handler, options);
  }

  /**
   * Progressively intercepts a native <form> submission.
   * Calls preventDefault(), extracts trimmed field values,
   * and automatically cleans up the listener on disconnect.
   */
  protected hijackForm(
    formOrSelector: HTMLFormElement | string,
    onSubmit: (
      data: Record<string, string>,
      formData: FormData,
      e: Event
    ) => void
  ): HTMLFormElement | null {
    const form =
      typeof formOrSelector === "string"
        ? this.$<HTMLFormElement>(formOrSelector)
        : formOrSelector;
    if (!form) return null;

    this.listen(form, "submit", (e: Event) => {
      e.preventDefault();
      const formData = new FormData(form);
      const data: Record<string, string> = {};
      formData.forEach((value, key) => {
        if (typeof value === "string") {
          data[key] = value.trim();
        }
      });
      onSubmit(data, formData, e);
    });

    return form;
  }

  /**
   * Synchronizes a URL query parameter with browser history (pushState/popstate)
   * and automatically tears down the popstate listener on disconnect.
   */
  protected syncQueryParam(
    paramName: string,
    options: SyncQueryParamOptions
  ): QueryParamSync {
    const sync = syncQueryParam(paramName, options);
    this.use(sync);
    return sync;
  }

  /** Scoped querySelector returning typed element or null. */
  protected $<T extends HTMLElement = HTMLElement>(selector: string): T | null {
    return this.querySelector<T>(selector);
  }

  /** Scoped querySelectorAll returning typed array of elements. */
  protected $$<T extends HTMLElement = HTMLElement>(selector: string): T[] {
    return Array.from(this.querySelectorAll<T>(selector));
  }

  /** Scoped querySelector that throws a descriptive error if the element is missing. */
  protected require<T extends HTMLElement = HTMLElement>(selector: string): T {
    return requireFromRoot<T>(this, selector);
  }

  /** Dispatches a bubbling, composed custom event. */
  protected emit<T = unknown>(
    name: string,
    detail?: T,
    options?: CustomEventInit
  ): boolean {
    return this.dispatchEvent(
      new CustomEvent(name, {
        bubbles: true,
        composed: true,
        detail,
        ...options,
      })
    );
  }

  /**
   * Schedules a one-shot timer that is automatically cancelled on disconnect.
   * If called when the element is disconnected from the DOM, does nothing and returns 0.
   */
  protected timeout(fn: () => void, ms: number): number {
    if (!this.isConnected || !this.scope) return 0;
    return this.scope.timeout(fn, ms);
  }

  /**
   * Cancels a pending timer previously scheduled with {@link timeout}.
   */
  protected clearTimeout(id: number): void {
    this.scope?.clearTimeout(id);
  }

  /**
   * Schedules an animation frame callback that is automatically cancelled on disconnect.
   * If called when the element is disconnected from the DOM, does nothing and returns 0.
   */
  protected rAF(fn: FrameRequestCallback): number {
    if (!this.isConnected || !this.scope) return 0;
    return this.scope.rAF(fn);
  }

  /**
   * Cancels a pending animation frame callback previously scheduled with {@link rAF}.
   */
  protected cancelRAF(id: number): void {
    this.scope?.cancelRAF(id);
  }

  /**
   * Returns a debounced version of `fn` whose pending timer is automatically
   * managed through {@link timeout} and cancelled on disconnect.
   *
   * Reusable across reconnect cycles with zero memory retention across disconnects.
   */
  protected debounce<T extends (...args: never[]) => void>(
    fn: T,
    waitMs: number
  ): DebouncedFunction<T> {
    let timer: number | null = null;

    const debounced = (...args: Parameters<T>) => {
      if (timer !== null) {
        this.clearTimeout(timer);
        timer = null;
      }
      if (!this.isConnected) return;
      timer = this.timeout(() => {
        timer = null;
        fn(...args);
      }, waitMs);
    };

    debounced.cancel = () => {
      if (timer !== null) {
        this.clearTimeout(timer);
        timer = null;
      }
    };

    return debounced;
  }
}

const REGISTERED_TAGS = new Set<string>();

/**
 * Safe Custom Element registration guard.
 */
export function registerElement(
  name: string,
  constructor: CustomElementConstructor
): void {
  REGISTERED_TAGS.add(name);
  if (!customElements.get(name)) {
    customElements.define(name, constructor);
  }
}

/**
 * Testing-only helper to inspect all custom element tags registered via
 * {@link registerElement}.
 */
export function getRegisteredElementTags(): ReadonlySet<string> {
  return REGISTERED_TAGS;
}
