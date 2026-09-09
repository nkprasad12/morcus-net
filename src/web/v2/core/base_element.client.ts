import {
  syncQueryParam,
  type QueryParamSync,
  type SyncQueryParamOptions,
} from "@/web/v2/core/router.client";

/**
 * Lightweight base class for UI V2 Light DOM Web Components.
 *
 * Provides automatic cleanup for event listeners, delegation, and subscriptions
 * when disconnected from the DOM, eliminating manual removeEventListener boilerplate.
 */
export abstract class BaseElement extends HTMLElement {
  private disposables: (() => void)[] = [];

  /** Lifecycle hook invoked when the element is inserted into the document. */
  protected onConnect(): void {}

  /** Lifecycle hook invoked when the element is removed from the document. */
  protected onDisconnect(): void {}

  connectedCallback() {
    this.onConnect();
  }

  disconnectedCallback() {
    this.dispose();
    this.onDisconnect();
  }

  /**
   * Registers a cleanup callback to be called when disconnectedCallback executes.
   */
  protected addDisposable(fn: () => void): () => void {
    this.disposables.push(fn);
    return fn;
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
  protected listen(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void;
  protected listen(
    target: EventTarget,
    type: string,
    listener: any,
    options?: boolean | AddEventListenerOptions
  ): void {
    target.addEventListener(type, listener, options);
    this.addDisposable(() => {
      target.removeEventListener(type, listener, options);
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

  private dispose() {
    for (const fn of this.disposables) {
      try {
        fn();
      } catch (e) {
        console.error("Error during BaseElement disposal:", e);
      }
    }
    this.disposables = [];
  }
}

/**
 * Safe Custom Element registration guard.
 */
export function registerElement(
  name: string,
  constructor: CustomElementConstructor
): void {
  if (!customElements.get(name)) {
    customElements.define(name, constructor);
  }
}
