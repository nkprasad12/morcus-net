/**
 * @jest-environment jsdom
 */
import {
  BaseController,
  BaseElement,
  DEAD_SCOPE,
  LifetimeScope,
  registerElement,
  type CleanupFn,
} from "@/web/v2/core/base_element.client";

type Lane = "alpha" | "beta";

class TestSubController extends BaseController<"sub"> {
  connectCount = 0;
  disconnectCount = 0;
  swapCount = 0;
  lastSwappedRoot: Element | null = null;
  customState = "initial";

  protected override onConnect(): void {
    this.connectCount++;
    const btn = this.scope.$<HTMLButtonElement>(".sub-btn");
    this.scope.listen(btn, "click", () => {
      this.customState = "clicked";
    });
  }

  protected override onDisconnect(): void {
    this.disconnectCount++;
  }

  public override onContentSwap(swappedRoot: Element): void {
    super.onContentSwap(swappedRoot);
    this.swapCount++;
    this.lastSwappedRoot = swappedRoot;
  }

  openTransientScope(): LifetimeScope {
    return this.scope.createScope();
  }

  startSubLane(): AbortSignal {
    return this.scope.latest("sub");
  }

  getScope(): LifetimeScope<"sub"> {
    return this.scope;
  }
}

class TestElement extends BaseElement<Lane> {
  connectCount = 0;
  readonly sub = this.addController(new TestSubController(this));

  protected override onConnect(): void {
    this.connectCount++;
  }

  // Expose the protected surface for testing.
  getScope(): LifetimeScope<Lane> {
    return this.scope;
  }

  lifetimeSignal(): AbortSignal {
    return this.scope.signal;
  }

  laneSignal(lane: Lane): AbortSignal {
    return this.scope.latest(lane);
  }

  cancelLane(lane: Lane): void {
    this.scope.cancel(lane);
  }

  scheduleTimeout(fn: () => void, ms: number): number {
    return this.scope.timeout(fn, ms);
  }

  scheduleRaf(fn: FrameRequestCallback): number {
    return this.scope.rAF(fn);
  }

  cancelTimeout(id: number): void {
    this.scope.clearTimeout(id);
  }

  cancelRaf(id: number): void {
    this.scope.cancelRAF(id);
  }

  createDebounce<T extends (...args: never[]) => void>(fn: T, ms: number) {
    return this.debounce(fn, ms);
  }

  requireEl<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.scope.require<T>(selector);
  }

  listenNullable(
    target: EventTarget | null | undefined,
    type: string,
    fn: EventListener
  ): void {
    this.scope.listen(target, type, fn);
  }
}

registerElement("morcus-test-base-element", TestElement);

class TestDisconnectOrderElement extends BaseElement {
  public observedDuringDisconnect: HTMLElement | null = null;
  public scopeWasActive = false;

  public getScope(): LifetimeScope {
    return this.scope;
  }

  protected override onDisconnect(): void {
    this.observedDuringDisconnect = this.scope.$<HTMLElement>(".child");
    this.scopeWasActive = !this.scope.disposed;
  }
}

registerElement("test-disconnect-order-element", TestDisconnectOrderElement);

class TestDisconnectOrderController extends BaseController {
  public observedDuringDisconnect: HTMLElement | null = null;
  public scopeWasActive = false;

  protected override onDisconnect(): void {
    this.observedDuringDisconnect = this.scope.$<HTMLElement>(".ctrl-child");
    this.scopeWasActive = !this.scope.disposed;
  }
}

class TestThrowingDisconnectElement extends BaseElement {
  public onDisconnectRan = false;

  public getScope(): LifetimeScope {
    return this.scope;
  }

  protected override onDisconnect(): void {
    this.onDisconnectRan = true;
    throw new Error("Element onDisconnect failure");
  }
}

registerElement(
  "test-throwing-disconnect-element",
  TestThrowingDisconnectElement
);

class TestThrowingDisconnectController extends BaseController {
  public onDisconnectRan = false;

  public getScope(): LifetimeScope {
    return this.scope;
  }

  protected override onDisconnect(): void {
    this.onDisconnectRan = true;
    throw new Error("Controller onDisconnect failure");
  }
}

class TestFaultyChildController extends BaseController {
  public disposed = false;
  constructor(root: ParentNode = document, public shouldThrow = false) {
    super(root);
  }

  public getScope(): LifetimeScope {
    return this.scope;
  }

  protected override onDisconnect(): void {
    this.disposed = true;
    if (this.shouldThrow) {
      throw new Error("Faulty child onDisconnect failure");
    }
  }
}

class TestControllerIsolationElement extends BaseElement {
  public readonly child1: TestFaultyChildController;
  public readonly child2: TestFaultyChildController;
  public onDisconnectRan = false;

  constructor() {
    super();
    this.child1 = this.addController(new TestFaultyChildController(this, true));
    this.child2 = this.addController(
      new TestFaultyChildController(this, false)
    );
  }

  public getScope(): LifetimeScope {
    return this.scope;
  }

  protected override onDisconnect(): void {
    this.onDisconnectRan = true;
  }
}

registerElement(
  "test-controller-isolation-element",
  TestControllerIsolationElement
);

class TestConnectOrderChildController extends BaseController {
  public parentHeaderSeenAtConnect: HTMLElement | null = null;

  constructor(
    root: ParentNode,
    private readonly tracker: {
      resolvedHeader: HTMLElement | null;
      executionLog: string[];
    }
  ) {
    super(root);
  }

  protected override onConnect(): void {
    this.tracker.executionLog.push("child:connect");
    this.parentHeaderSeenAtConnect = this.tracker.resolvedHeader;
  }
}

class TestConnectOrderElement extends BaseElement {
  public executionLog: string[] = [];
  public resolvedHeader: HTMLElement | null = null;
  public readonly child = this.addController(
    new TestConnectOrderChildController(this, this)
  );

  protected override onConnect(): void {
    this.executionLog.push("host:connect");
    this.resolvedHeader = this.scope.$<HTMLElement>(".header");
  }
}

registerElement("test-connect-order-element", TestConnectOrderElement);

class TestConnectOrderParentController extends BaseController {
  public executionLog: string[] = [];
  public resolvedHeader: HTMLElement | null = null;
  public readonly child = this.addController(
    new TestConnectOrderChildController(this.root, this)
  );

  protected override onConnect(): void {
    this.executionLog.push("parent:connect");
    this.resolvedHeader = this.scope.$<HTMLElement>(".ctrl-header");
  }
}

class TestDynamicChildController extends BaseController {
  public connectCount = 0;

  protected override onConnect(): void {
    this.connectCount++;
  }
}

class TestDynamicControllerHostElement extends BaseElement {
  public dynamicChild = new TestDynamicChildController(this);

  protected override onConnect(): void {
    this.addController(this.dynamicChild);
  }
}

registerElement(
  "test-dynamic-controller-element",
  TestDynamicControllerHostElement
);

class TestDynamicControllerHostController extends BaseController {
  public dynamicChild = new TestDynamicChildController(this.root);

  protected override onConnect(): void {
    this.addController(this.dynamicChild);
  }
}

describe("BaseElement async cancellation", () => {
  let el: TestElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    el = document.createElement("morcus-test-base-element") as TestElement;
    document.body.appendChild(el);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  describe("lifetime signal", () => {
    test("is live while connected and aborts on disconnect", () => {
      const signal = el.lifetimeSignal();
      expect(signal.aborted).toBe(false);

      el.remove();

      expect(signal.aborted).toBe(true);
    });

    test("is renewed when the element is moved within the DOM", () => {
      const first = el.lifetimeSignal();
      const container = document.createElement("div");
      document.body.appendChild(container);

      // Moving an element disconnects and reconnects it. Without renewal the
      // component would stay permanently aborted and never fetch again.
      container.appendChild(el);

      expect(first.aborted).toBe(true);
      expect(el.connectCount).toBe(2);
      expect(el.lifetimeSignal().aborted).toBe(false);
    });
  });

  describe("supersession lanes", () => {
    test("a new request aborts the previous one in the same lane", () => {
      const first = el.laneSignal("alpha");
      const second = el.laneSignal("alpha");

      expect(first.aborted).toBe(true);
      expect(second.aborted).toBe(false);
    });

    test("lanes are independent of one another", () => {
      const alpha = el.laneSignal("alpha");
      const beta = el.laneSignal("beta");

      // This is the whole reason lanes exist: a component may run genuinely
      // concurrent requests whose results are both still wanted.
      expect(alpha.aborted).toBe(false);
      expect(beta.aborted).toBe(false);

      el.laneSignal("beta");

      expect(alpha.aborted).toBe(false);
    });

    test("all lanes abort on disconnect", () => {
      const alpha = el.laneSignal("alpha");
      const beta = el.laneSignal("beta");

      el.remove();

      expect(alpha.aborted).toBe(true);
      expect(beta.aborted).toBe(true);
    });

    test("lanes still work after the element is reconnected", () => {
      el.laneSignal("alpha");
      el.remove();
      document.body.appendChild(el);

      const revived = el.laneSignal("alpha");

      expect(revived.aborted).toBe(false);
    });

    test("cancel aborts only the named lane", () => {
      const alpha = el.laneSignal("alpha");
      const beta = el.laneSignal("beta");

      el.cancelLane("alpha");

      expect(alpha.aborted).toBe(true);
      expect(beta.aborted).toBe(false);
    });

    test("cancel is a no-op for a lane that was never started", () => {
      expect(() => el.cancelLane("alpha")).not.toThrow();
      expect(el.laneSignal("alpha").aborted).toBe(false);
    });
  });

  describe("managed timers", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test("timeout fires when connected and cancels on disconnect", () => {
      const fired = jest.fn();
      const cancelled = jest.fn();

      el.scheduleTimeout(fired, 50);
      jest.advanceTimersByTime(50);
      expect(fired).toHaveBeenCalledTimes(1);

      el.scheduleTimeout(cancelled, 50);
      el.remove();
      jest.advanceTimersByTime(50);
      expect(cancelled).not.toHaveBeenCalled();
    });

    test("rAF fires when connected and cancels on disconnect", () => {
      const fired = jest.fn();
      const cancelled = jest.fn();

      el.scheduleRaf(fired);
      jest.runAllTimers();
      expect(fired).toHaveBeenCalledTimes(1);

      el.scheduleRaf(cancelled);
      el.remove();
      jest.runAllTimers();
      expect(cancelled).not.toHaveBeenCalled();
    });

    test("debounce cancels pending calls on every disconnect across reconnect cycles", () => {
      const fn = jest.fn();
      const debounced = el.createDebounce(fn, 100);

      // Disconnect before first debounce elapses
      debounced();
      el.remove();
      jest.advanceTimersByTime(100);
      expect(fn).not.toHaveBeenCalled();

      // Reconnect and allow debounce to fire
      document.body.appendChild(el);
      debounced();
      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);

      // Disconnect a second time before pending debounce elapses
      debounced();
      el.remove();
      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test("does not schedule timeout or rAF if called while disconnected", () => {
      el.remove();

      const timerCb = jest.fn();
      const rafCb = jest.fn();
      const debounceCb = jest.fn();
      const debounced = el.createDebounce(debounceCb, 50);

      const timerId = el.scheduleTimeout(timerCb, 50);
      const rafId = el.scheduleRaf(rafCb);
      debounced();

      expect(timerId).toBe(0);
      expect(rafId).toBe(0);

      jest.advanceTimersByTime(100);
      jest.runAllTimers();

      expect(timerCb).not.toHaveBeenCalled();
      expect(rafCb).not.toHaveBeenCalled();
      expect(debounceCb).not.toHaveBeenCalled();
    });

    test("clearTimeout and cancelRAF manually cancel pending work", () => {
      const timerCb = jest.fn();
      const rafCb = jest.fn();

      const timerId = el.scheduleTimeout(timerCb, 50);
      el.cancelTimeout(timerId);
      jest.advanceTimersByTime(50);
      expect(timerCb).not.toHaveBeenCalled();

      const rafId = el.scheduleRaf(rafCb);
      el.cancelRaf(rafId);
      jest.runAllTimers();
      expect(rafCb).not.toHaveBeenCalled();
    });

    test("debounced.cancel() manually cancels pending invocation", () => {
      const fn = jest.fn();
      const debounced = el.createDebounce(fn, 100);

      debounced();
      debounced.cancel();
      jest.advanceTimersByTime(100);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe("BaseController, addController, and LifetimeScope", () => {
    test("preserves controller instance and state across disconnect/reconnect cycles while rebinding listeners", () => {
      el.remove();
      el.innerHTML = `<button class="sub-btn">Click</button>`;
      document.body.appendChild(el);

      const subInstance = el.sub;
      expect(subInstance.connectCount).toBe(2);
      expect(subInstance.disconnectCount).toBe(1);

      const btn = el.requireEl<HTMLButtonElement>(".sub-btn");
      btn.click();
      expect(subInstance.customState).toBe("clicked");

      // Mutate state, move element in DOM, and verify state survives while listeners rebind
      subInstance.customState = "preserved-across-move";
      const wrapper = document.createElement("div");
      document.body.appendChild(wrapper);
      wrapper.appendChild(el);

      expect(el.sub).toBe(subInstance);
      expect(subInstance.connectCount).toBe(3);
      expect(subInstance.disconnectCount).toBe(2);
      expect(subInstance.customState).toBe("preserved-across-move");

      btn.click();
      expect(subInstance.customState).toBe("clicked");
    });

    test("child scopes detach cleanly on early dispose and also dispose when parent disconnects", () => {
      const child1 = el.sub.openTransientScope();
      const child1Cleanup = jest.fn();
      child1.use(child1Cleanup);

      // Early dispose runs cleanup immediately and detaches from parent
      child1.dispose();
      expect(child1Cleanup).toHaveBeenCalledTimes(1);

      // Active child scope disposes automatically when host element disconnects
      const child2 = el.sub.openTransientScope();
      const child2Cleanup = jest.fn();
      child2.use(child2Cleanup);
      const subLaneSignal = el.sub.startSubLane();
      expect(subLaneSignal.aborted).toBe(false);

      el.remove();

      expect(child1Cleanup).toHaveBeenCalledTimes(1);
      expect(child2Cleanup).toHaveBeenCalledTimes(1);
      expect(subLaneSignal.aborted).toBe(true);
    });

    test("use() supports function and object Disposables and executes immediately if already disposed", () => {
      const scope = el.sub.openTransientScope();
      const fnCleanup: CleanupFn = jest.fn();
      const objCleanup = { dispose: jest.fn() };

      scope.use(fnCleanup);
      scope.use(objCleanup);

      expect(fnCleanup).not.toHaveBeenCalled();
      expect(objCleanup.dispose).not.toHaveBeenCalled();

      scope.dispose();
      expect(fnCleanup).toHaveBeenCalledTimes(1);
      expect(objCleanup.dispose).toHaveBeenCalledTimes(1);

      // Registering against an already-disposed scope runs cleanup synchronously
      const postDisposeCleanup: CleanupFn = jest.fn();
      scope.use(postDisposeCleanup);
      expect(postDisposeCleanup).toHaveBeenCalledTimes(1);
    });

    test("require() throws descriptive error when selector is missing and listen(null) is a no-op", () => {
      expect(() => el.requireEl("#missing-node")).toThrow(
        /Required element matching selector "#missing-node" not found in <morcus-test-base-element>/
      );
      expect(() => el.listenNullable(null, "click", jest.fn())).not.toThrow();
    });

    test("notifyContentSwap forwards swappedRoot to registered controllers", () => {
      const swapped = document.createElement("section");
      el.notifyContentSwap(swapped);

      expect(el.sub.swapCount).toBe(1);
      expect(el.sub.lastSwappedRoot).toBe(swapped);
    });
  });

  describe("DEAD_SCOPE fallback when disconnected", () => {
    test("returns DEAD_SCOPE singleton with aborted signal, no-op timers, immediate use() cleanup, and safe queries", () => {
      el.remove();

      const scope = el.getScope();
      expect(scope).toBe(DEAD_SCOPE);
      expect(scope.signal.aborted).toBe(true);
      expect(scope.latest("alpha").aborted).toBe(true);
      expect(scope.timeout(jest.fn(), 100)).toBe(0);
      expect(scope.rAF(jest.fn())).toBe(0);
      expect(scope.$(".any")).toBeNull();
      expect(scope.$$(".any")).toEqual([]);
      expect(() => scope.require(".any")).toThrow(
        /Required element matching selector ".any" not found/
      );
      expect(() => scope.listen(null, "click", jest.fn())).not.toThrow();

      const deadCleanup = jest.fn();
      scope.use(deadCleanup);
      expect(deadCleanup).toHaveBeenCalledTimes(1);

      // Sub-controller also falls back to DEAD_SCOPE when host is disconnected
      const subScope = el.sub.getScope();
      expect(subScope).toBe(DEAD_SCOPE);
      expect(subScope.signal.aborted).toBe(true);
      expect(subScope.latest("sub").aborted).toBe(true);
    });
  });

  describe("onDisconnect ordering and ungated DOM queries", () => {
    test("LifetimeScope $ and $$ query DOM even after scope disposal", () => {
      const container = document.createElement("div");
      container.innerHTML = `<span class="item">one</span><span class="item">two</span>`;
      const scope = new LifetimeScope(container);

      expect(scope.$(".item")?.textContent).toBe("one");
      expect(scope.$$(".item")).toHaveLength(2);

      scope.dispose();

      // DOM reads remain ungated after disposal
      expect(scope.$(".item")?.textContent).toBe("one");
      expect(scope.$$(".item")).toHaveLength(2);
      // While async/timer facilities ARE disabled upon disposal
      expect(scope.signal.aborted).toBe(true);
      expect(scope.timeout(jest.fn(), 50)).toBe(0);
    });

    test("BaseElement onDisconnect runs before scope is disposed and can query DOM via this.scope.$", () => {
      const testEl = document.createElement(
        "test-disconnect-order-element"
      ) as TestDisconnectOrderElement;
      testEl.innerHTML = `<span class="child">hello</span>`;
      document.body.appendChild(testEl);

      testEl.remove();

      expect(testEl.observedDuringDisconnect).not.toBeNull();
      expect(testEl.observedDuringDisconnect?.textContent).toBe("hello");
      expect(testEl.scopeWasActive).toBe(true);
      expect(testEl.getScope()).toBe(DEAD_SCOPE);
    });

    test("BaseController onDisconnect runs before scope is disposed and can query DOM via this.scope.$", () => {
      const container = document.createElement("div");
      container.innerHTML = `<span class="ctrl-child">world</span>`;
      document.body.appendChild(container);

      const ctrl = new TestDisconnectOrderController(container);
      ctrl.connect();

      ctrl.dispose();

      expect(ctrl.observedDuringDisconnect).not.toBeNull();
      expect(ctrl.observedDuringDisconnect?.textContent).toBe("world");
      expect(ctrl.scopeWasActive).toBe(true);
    });
  });

  describe("Teardown exception safety and controller error isolation (Item 6.1)", () => {
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    test("BaseElement disposes scope even when onDisconnect throws", () => {
      const el = document.createElement(
        "test-throwing-disconnect-element"
      ) as TestThrowingDisconnectElement;
      el.connectedCallback();

      const activeScope = el.getScope();
      expect(activeScope.disposed).toBe(false);
      expect(activeScope.signal.aborted).toBe(false);

      expect(() => {
        el.disconnectedCallback();
      }).toThrow("Element onDisconnect failure");

      expect(el.onDisconnectRan).toBe(true);
      expect(activeScope.disposed).toBe(true);
      expect(activeScope.signal.aborted).toBe(true);
      expect(el.getScope()).toBe(DEAD_SCOPE);
    });

    test("BaseElement isolates child controller disposal errors so siblings dispose, onDisconnect runs, and scope disposes", () => {
      const el = document.createElement(
        "test-controller-isolation-element"
      ) as TestControllerIsolationElement;
      document.body.appendChild(el);

      const activeScope = el.getScope();
      const child1Scope = el.child1.getScope();
      const child2Scope = el.child2.getScope();
      expect(activeScope.disposed).toBe(false);
      expect(child1Scope.disposed).toBe(false);
      expect(child2Scope.disposed).toBe(false);

      expect(() => {
        el.remove();
      }).not.toThrow();

      expect(el.child1.disposed).toBe(true);
      expect(el.child2.disposed).toBe(true);
      expect(child1Scope.disposed).toBe(true);
      expect(child2Scope.disposed).toBe(true);
      expect(el.child1.isConnected).toBe(false);
      expect(el.child2.isConnected).toBe(false);
      expect(el.onDisconnectRan).toBe(true);
      expect(activeScope.disposed).toBe(true);
      expect(el.getScope()).toBe(DEAD_SCOPE);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error during controller disposal:",
        expect.any(Error)
      );

      // Reconnecting recovers cleanly with fresh scopes on host and both children
      el.child1.shouldThrow = false;
      document.body.appendChild(el);
      expect(el.getScope().disposed).toBe(false);
      expect(el.child1.isConnected).toBe(true);
      expect(el.child2.isConnected).toBe(true);
      el.remove();
    });

    test("BaseController disposes scope even when onDisconnect throws", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const ctrl = new TestThrowingDisconnectController(container);
      ctrl.connect();

      const activeScope = ctrl.getScope();
      expect(activeScope.disposed).toBe(false);
      expect(activeScope.signal.aborted).toBe(false);
      expect(ctrl.isConnected).toBe(true);

      expect(() => {
        ctrl.dispose();
      }).toThrow("Controller onDisconnect failure");

      expect(ctrl.onDisconnectRan).toBe(true);
      expect(activeScope.disposed).toBe(true);
      expect(activeScope.signal.aborted).toBe(true);
      expect(ctrl.isConnected).toBe(false);
      expect(ctrl.getScope()).toBe(DEAD_SCOPE);
    });

    test("BaseController isolates child controller disposal errors so siblings dispose, onDisconnect runs, and scope disposes", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      class ParentController extends BaseController {
        public readonly child1 = this.addController(
          new TestFaultyChildController(container, true)
        );
        public readonly child2 = this.addController(
          new TestFaultyChildController(container, false)
        );
        public onDisconnectRan = false;

        public getScope(): LifetimeScope {
          return this.scope;
        }

        protected override onDisconnect(): void {
          this.onDisconnectRan = true;
        }
      }

      const parent = new ParentController(container);
      parent.connect();

      const activeScope = parent.getScope();
      const child1Scope = parent.child1.getScope();
      const child2Scope = parent.child2.getScope();
      expect(activeScope.disposed).toBe(false);
      expect(child1Scope.disposed).toBe(false);
      expect(child2Scope.disposed).toBe(false);

      expect(() => {
        parent.dispose();
      }).not.toThrow();

      expect(parent.child1.disposed).toBe(true);
      expect(parent.child2.disposed).toBe(true);
      expect(child1Scope.disposed).toBe(true);
      expect(child2Scope.disposed).toBe(true);
      expect(parent.child1.isConnected).toBe(false);
      expect(parent.child2.isConnected).toBe(false);
      expect(parent.onDisconnectRan).toBe(true);
      expect(activeScope.disposed).toBe(true);
      expect(parent.isConnected).toBe(false);
      expect(parent.getScope()).toBe(DEAD_SCOPE);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error during controller disposal:",
        expect.any(Error)
      );
    });
  });

  describe("Host and child controller connection ordering (Item 6.2)", () => {
    test("BaseElement onConnect runs before child controller connect(), allowing children to access host-resolved elements", () => {
      const testEl = document.createElement(
        "test-connect-order-element"
      ) as TestConnectOrderElement;
      testEl.innerHTML = `<div class="header">App Header</div>`;

      // Before connect, neither has run
      expect(testEl.executionLog).toEqual([]);
      expect(testEl.resolvedHeader).toBeNull();
      expect(testEl.child.parentHeaderSeenAtConnect).toBeNull();

      document.body.appendChild(testEl);

      // Host onConnect must execute before child onConnect
      expect(testEl.executionLog).toEqual(["host:connect", "child:connect"]);
      expect(testEl.resolvedHeader).not.toBeNull();
      expect(testEl.resolvedHeader?.textContent).toBe("App Header");
      expect(testEl.child.parentHeaderSeenAtConnect).toBe(
        testEl.resolvedHeader
      );
    });

    test("BaseController onConnect runs before child controller connect(), allowing children to access host-resolved elements", () => {
      const container = document.createElement("div");
      container.innerHTML = `<div class="ctrl-header">Controller Header</div>`;
      document.body.appendChild(container);

      const parent = new TestConnectOrderParentController(container);

      // Before connect, neither has run
      expect(parent.executionLog).toEqual([]);
      expect(parent.resolvedHeader).toBeNull();
      expect(parent.child.parentHeaderSeenAtConnect).toBeNull();

      parent.connect();

      // Parent onConnect must execute before child onConnect
      expect(parent.executionLog).toEqual(["parent:connect", "child:connect"]);
      expect(parent.resolvedHeader).not.toBeNull();
      expect(parent.resolvedHeader?.textContent).toBe("Controller Header");
      expect(parent.child.parentHeaderSeenAtConnect).toBe(
        parent.resolvedHeader
      );
    });

    test("BaseElement does not double-connect controllers dynamically registered in onConnect", () => {
      const testEl = document.createElement(
        "test-dynamic-controller-element"
      ) as TestDynamicControllerHostElement;

      expect(testEl.dynamicChild.connectCount).toBe(0);

      document.body.appendChild(testEl);

      expect(testEl.dynamicChild.connectCount).toBe(1);
    });

    test("BaseController does not double-connect controllers dynamically registered in onConnect", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);

      const host = new TestDynamicControllerHostController(container);

      expect(host.dynamicChild.connectCount).toBe(0);

      host.connect();

      expect(host.dynamicChild.connectCount).toBe(1);
    });
  });
});
