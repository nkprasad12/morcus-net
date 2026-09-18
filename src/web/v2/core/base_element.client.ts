import { DisposableBag } from "@/web/v2/core/disposable.client";
import {
  syncQueryParam,
  type QueryParamSync,
  type SyncQueryParamOptions,
} from "@/web/v2/core/router.client";
import { LatestTask, type DebouncedFunction } from "@/web/v2/core/task.client";

/**
 * Lightweight base class for UI V2 Light DOM Web Components.
 *
 * Provides automatic cleanup for event listeners, delegation, subscriptions,
 * timers, and in-flight async work when disconnected from the DOM, eliminating
 * manual removeEventListener / AbortController boilerplate.
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
  private readonly disposables = new DisposableBag();
  private lifetime = new AbortController();
  private readonly lanes = new Map<Lane, LatestTask>();
  private readonly timeouts = new Set<number>();
  private readonly rafs = new Set<number>();

  /**
   * Lifecycle hook invoked when the element is inserted into the document.
   *
   * **Must be idempotent, and must re-register every listener it needs each
   * time it runs.** Moving an element in the DOM disconnects and reconnects it,
   * and `disconnectedCallback` calls `dispose()` — so by the time this runs
   * again, everything registered through {@link listen}, {@link delegate} or
   * {@link addDisposable} is already gone.
   *
   * The trap is a "do this only once" guard with a registration inside it. The
   * guard is still satisfied on the second connect, so the listener is never
   * restored and the element goes silently half-dead. This has been gotten
   * wrong three times here, in three disguises: registering in the constructor,
   * guarding on a cached field, and guarding on a `data-` marker that outlives
   * the disconnect entirely. Keep one-time DOM work inside the guard and
   * registration outside it:
   *
   * ```ts
   * protected override onConnect() {
   *   if (!this.child) {                    // once: build the DOM
   *     this.child = document.createElement("x-child");
   *     this.append(this.child);
   *   }
   *   this.listen(this.child, "evt", ...);  // every time: re-subscribe
   * }
   * ```
   *
   * `core/reattach_conformance.test.ts` enforces this for every registered
   * element. Note there is deliberately no `hasConnected` re-entry guard in
   * {@link connectedCallback}: a second `onConnect()` re-registering from a
   * clean slate is the intended behaviour, and suppressing it would break the
   * move-and-reconnect path rather than protect it.
   */
  protected onConnect(): void {}

  /** Lifecycle hook invoked when the element is removed from the document. */
  protected onDisconnect(): void {}

  connectedCallback() {
    // An element moved within the DOM is disconnected and reconnected, which
    // would otherwise leave it permanently aborted.
    if (this.lifetime.signal.aborted) {
      this.lifetime = new AbortController();
    }
    this.onConnect();
  }

  disconnectedCallback() {
    this.dispose();
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
    return this.lifetime.signal;
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
    let task = this.lanes.get(lane);
    if (task === undefined) {
      task = new LatestTask();
      this.lanes.set(lane, task);
    }
    return task.start();
  }

  /**
   * Aborts whatever is in flight in `lane` without starting anything new.
   *
   * Use when the result stops being wanted for a reason other than being
   * superseded, e.g. the UI that would display it has been dismissed.
   */
  protected cancel(lane: Lane): void {
    this.lanes.get(lane)?.cancel();
  }

  /**
   * Registers a cleanup callback to be called when disconnectedCallback executes.
   */
  protected addDisposable(fn: () => void): () => void {
    return this.disposables.add(fn);
  }

  /**
   * Attaches an event listener that is automatically unregistered on disconnect.
   */
  protected listen<K extends keyof HTMLElementEventMap>(
    target: EventTarget,
    type: K,
    listener: (e: HTMLElementEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  protected listen<T = unknown>(
    target: EventTarget,
    type: string,
    listener: (e: CustomEvent<T>) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  protected listen(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void;
  // Implementation signature: callers see the typed overloads above, never
  // this one. It cannot be given a concrete type -- no signature satisfies the
  // generic `CustomEvent<T>` overload above, which TypeScript rejects with
  // TS2394 against `EventListener`, `EventListenerOrEventListenerObject` and
  // every union of them.
  //
  // That leaves `any` or `unknown`, and both cost exactly one lint exemption.
  // `unknown` is preferred because `any` would switch off checking for the
  // whole body, whereas this confines the single unsafe step to one line.
  protected listen(
    target: EventTarget,
    type: string,
    listener: unknown,
    options?: boolean | AddEventListenerOptions
  ): void {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const handler = listener as EventListenerOrEventListenerObject;
    target.addEventListener(type, handler, options);
    this.addDisposable(() => {
      target.removeEventListener(type, handler, options);
    });
  }

  /**
   * Attaches a delegated event listener that fires only when matching the selector.
   * Automatically cleaned up on disconnect.
   */
  protected delegate<T extends HTMLElement = HTMLElement>(
    root: EventTarget,
    type: string,
    selector: string,
    handler: (e: Event, matched: T) => void,
    options?: boolean | AddEventListenerOptions
  ): void {
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
    this.addDisposable(() => sync.dispose());
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
    if (!this.isConnected) return 0;
    const id = window.setTimeout(() => {
      this.timeouts.delete(id);
      fn();
    }, ms);
    this.timeouts.add(id);
    return id;
  }

  /**
   * Cancels a pending timer previously scheduled with {@link timeout}.
   */
  protected clearTimeout(id: number): void {
    window.clearTimeout(id);
    this.timeouts.delete(id);
  }

  /**
   * Schedules an animation frame callback that is automatically cancelled on disconnect.
   * If called when the element is disconnected from the DOM, does nothing and returns 0.
   */
  protected rAF(fn: FrameRequestCallback): number {
    if (!this.isConnected) return 0;
    const id = window.requestAnimationFrame((time) => {
      this.rafs.delete(id);
      fn(time);
    });
    this.rafs.add(id);
    return id;
  }

  /**
   * Cancels a pending animation frame callback previously scheduled with {@link rAF}.
   */
  protected cancelRAF(id: number): void {
    window.cancelAnimationFrame(id);
    this.rafs.delete(id);
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

  private dispose() {
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
