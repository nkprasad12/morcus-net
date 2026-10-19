import {
  BaseController,
  disposeControllers,
  type Controller,
} from "@/web/ui/core/dom/base_controller.client";
import {
  clearFailed,
  clearUpgraded,
  markFailed,
  markUpgraded,
} from "@/web/ui/core/dom/js_gate.client";
import {
  createDurableDebounce,
  DEAD_SCOPE,
  LifetimeScope,
  type DebouncedFunction,
} from "@/web/ui/core/dom/lifetime_scope.client";
import {
  syncQueryParam,
  type QueryParamSync,
  type SyncQueryParamOptions,
} from "@/web/ui/core/nav/router.client";

/**
 * Lightweight base class for UI V2 Light DOM Web Components.
 *
 * Provides automatic cleanup for event listeners, delegation, subscriptions,
 * timers, child controllers, and in-flight async work when disconnected from
 * the DOM, eliminating manual removeEventListener / AbortController boilerplate.
 *
 * `Lane` names the supersession lanes this component uses with {@link LifetimeScope.latest}.
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
  #scope: LifetimeScope<Lane> | null = null;
  readonly #controllers: Controller[] = [];

  /**
   * Active connection scope. Backed by DEAD_SCOPE when disconnected.
   */
  protected get scope(): LifetimeScope<Lane> {
    return this.#scope ?? DEAD_SCOPE;
  }

  /**
   * Lifecycle hook invoked when the element is inserted into the document.
   *
   * **Must be idempotent, and must re-register every listener it needs each
   * time it runs.** Moving an element in the DOM disconnects and reconnects it,
   * and `disconnectedCallback` disposes the active {@link LifetimeScope} — so
   * by the time this runs again, everything registered through `this.scope.listen`,
   * `this.scope.delegate` or `this.scope.use` is already gone.
   */
  protected onConnect(): void {}

  /**
   * Lifecycle hook invoked when the element is removed from the document,
   * only if `onConnect` completed. To undo a side effect even when
   * `onConnect` throws partway (global state, attributes on elements outside
   * this one), register the undo with `this.scope.use()` right after making
   * the change: the scope is disposed as soon as `onConnect` fails.
   */
  protected onDisconnect(): void {}

  protected debounce<T extends (...args: never[]) => void>(
    fn: T,
    waitMs: number
  ): DebouncedFunction<T> {
    return createDurableDebounce(
      () => this.isConnected,
      () => this.scope,
      fn,
      waitMs
    );
  }

  /** Optional hook invoked automatically by HTML sinks when a subtree inside the host is swapped. */
  protected onContentSwap(swappedRoot: Element): void {
    void swappedRoot;
  }

  /**
   * Registers a long-lived child controller that connects and disposes in
   * lockstep with this host element while preserving its instance across reconnects.
   */
  public addController<T extends Controller>(controller: T): T {
    if (!this.#controllers.includes(controller)) {
      if (controller instanceof BaseController) controller.adoptOwner(this);
      this.#controllers.push(controller);
      if (this.#scope && !this.#scope.disposed) {
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
    for (const controller of this.#controllers) {
      if (notified?.has(controller)) continue;
      notified?.add(controller);
      controller.onContentSwap?.(swappedRoot);
    }
  }

  connectedCallback() {
    if (this.#scope && !this.#scope.disposed) {
      this.#scope.dispose();
    }
    clearFailed(this);
    this.#scope = new LifetimeScope<Lane>(this, undefined, this);
    const existingControllers = [...this.#controllers];
    try {
      this.onConnect();
      if (!this.#scope || this.#scope.disposed) return;
      for (const controller of existingControllers) {
        controller.connect?.();
      }
    } catch (err) {
      // Tear down anything registered before the throw, so no handler stays
      // live on a component that has reverted to its No-JS fallback.
      disposeControllers(this.#controllers);
      this.#scope?.dispose();
      this.#scope = null;
      // A broken component drops its `data-js-only` controls and paints its
      // No-JS fallbacks again (see `core/dom/js_gate.client.ts`). Marked after
      // the teardown, since disposing a failed child controller rooted at
      // this element clears the mark.
      markFailed(this);
      throw err;
    }
    // Reveal this element's `data-js-only` UI. Only reached if nothing above
    // threw, so a broken component never shows dead controls.
    markUpgraded(this);
  }

  disconnectedCallback() {
    // After a failed connect the `catch` above has already disposed and
    // nulled the scope, so `onDisconnect` (which may assume `onConnect` ran
    // to completion) is skipped, as `BaseController.dispose` does. Undo
    // anything that must also be undone on failure with `this.scope.use()`.
    const wasConnected = this.#scope !== null && !this.#scope.disposed;
    clearUpgraded(this);
    clearFailed(this);
    try {
      for (const controller of this.#controllers) {
        try {
          controller.dispose();
        } catch (err) {
          console.error("Error during controller disposal:", err);
        }
      }
      if (wasConnected) {
        this.onDisconnect();
      }
    } finally {
      this.#scope?.dispose();
      this.#scope = null;
    }
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
        ? this.scope.$<HTMLFormElement>(formOrSelector)
        : formOrSelector;
    if (!form) return null;

    this.scope.listen(form, "submit", (e: Event) => {
      // hijackForm replaces this form's native submit with the caller's
      // onSubmit handler
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
    this.scope.use(sync);
    return sync;
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
