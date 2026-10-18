import { clearFailed, markFailed } from "@/web/v2/core/dom/js_gate.client";
import {
  createDurableDebounce,
  DEAD_SCOPE,
  LifetimeScope,
  type DebouncedFunction,
} from "@/web/v2/core/dom/lifetime_scope.client";

/**
 * Long-lived sub-controller attached to a BaseElement (or parent BaseController).
 * Registered once (typically as a class field); survives across disconnect/reconnect
 * cycles so controller state (e.g. the active panel tab, the drawer's preferred height) is preserved while listeners
 * are cleanly torn down and re-registered on each cycle.
 */
export interface Controller {
  connect?(): void;
  dispose(): void;
  /** Optional hook invoked automatically by HTML sinks when a subtree inside the host is swapped. */
  onContentSwap?(swappedRoot: Element): void;
}

interface ContentSwapHost {
  notifyContentSwap(swappedRoot: Element, notified?: Set<Controller>): void;
}

function isContentSwapHost(node: Node): node is Node & ContentSwapHost {
  return (
    "notifyContentSwap" in node &&
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    typeof (node as Partial<ContentSwapHost>).notifyContentSwap === "function"
  );
}

const ACTIVE_CONTROLLERS_BY_ROOT = new WeakMap<ParentNode, Set<Controller>>();

/** Disposes each controller, logging (not rethrowing) individual failures. */
export function disposeControllers(controllers: readonly Controller[]): void {
  for (const controller of controllers) {
    try {
      controller.dispose();
    } catch (err) {
      console.error("Error during controller disposal:", err);
    }
  }
}

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
    if (isContentSwapHost(current)) {
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
  #scope: LifetimeScope<Lane> | null = null;
  readonly #controllers: Controller[] = [];
  /** Whether this controller set `data-js-failed` on its root. */
  #markedFailed = false;
  /** The owning component, set by `addController`; `null` if standalone. */
  protected owner: Element | null = null;

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
    return this.#scope !== null && !this.#scope.disposed;
  }

  protected get scope(): LifetimeScope<Lane> {
    return this.#scope ?? DEAD_SCOPE;
  }

  protected onConnect(): void {}

  /**
   * Runs on `dispose()`, only if `onConnect` completed. Undo side effects
   * that must also be undone on a failed connect with `this.scope.use()`.
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

  public addController<T extends Controller>(controller: T): T {
    if (!this.#controllers.includes(controller)) {
      if (controller instanceof BaseController) {
        controller.adoptOwner(this.owner);
      }
      this.#controllers.push(controller);
      if (this.#scope && !this.#scope.disposed) {
        controller.connect?.();
      }
    }
    return controller;
  }

  /**
   * Sets the component this controller's scopes belong to (see
   * {@link LifetimeScope.owner}). Called by `addController`; applies from the
   * next `connect()`.
   */
  public adoptOwner(owner: Element | null): void {
    this.owner = owner;
    for (const controller of this.#controllers) {
      if (controller instanceof BaseController) controller.adoptOwner(owner);
    }
  }

  public connect(): void {
    if (this.#scope && !this.#scope.disposed) {
      this.dispose();
    }
    if (this.#markedFailed && this.root instanceof Element) {
      clearFailed(this.root);
      this.#markedFailed = false;
    }
    this.#scope = new LifetimeScope<Lane>(this.root, undefined, this.owner);
    let set = ACTIVE_CONTROLLERS_BY_ROOT.get(this.root);
    if (!set) {
      set = new Set<Controller>();
      ACTIVE_CONTROLLERS_BY_ROOT.set(this.root, set);
    }
    set.add(this);
    const existingControllers = [...this.#controllers];
    try {
      this.onConnect();
      if (!this.#scope || this.#scope.disposed) return;
      for (const controller of existingControllers) {
        controller.connect?.();
      }
    } catch (err) {
      // Tear down anything registered before the throw. This skips
      // `dispose()`, which would also run `onDisconnect` and clear our mark.
      ACTIVE_CONTROLLERS_BY_ROOT.get(this.root)?.delete(this);
      disposeControllers(this.#controllers);
      this.#scope?.dispose();
      this.#scope = null;
      // Bring back the No-JS fallbacks in this controller's subtree (see
      // `core/dom/js_gate.client.ts`). A document-level controller doesn't mark
      // <html>: that would revert every component on the page. Marked after
      // the teardown above, since disposing a failed child controller that
      // shares this root clears the mark.
      const root = this.root;
      if (
        root instanceof Element &&
        root !== root.ownerDocument.documentElement
      ) {
        markFailed(root);
        this.#markedFailed = true;
      }
      throw err;
    }
  }

  public dispose(): void {
    const wasConnected = this.#scope !== null && !this.#scope.disposed;
    ACTIVE_CONTROLLERS_BY_ROOT.get(this.root)?.delete(this);
    if (this.#markedFailed && this.root instanceof Element) {
      clearFailed(this.root);
      this.#markedFailed = false;
    }
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

  public onContentSwap(swappedRoot: Element): void {
    for (const controller of this.#controllers) {
      controller.onContentSwap?.(swappedRoot);
    }
  }
}
