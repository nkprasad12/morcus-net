/**
 * @jest-environment jsdom
 */
import {
  BaseController,
  BaseElement,
  registerElement,
} from "@/web/v2/core/base_element.client";

const clicks: string[] = [];

class ListeningController extends BaseController {
  readonly #label: string;

  constructor(root: ParentNode, label: string) {
    super(root);
    this.#label = label;
  }

  protected override onConnect(): void {
    this.scope.listen(this.root, "click", () => clicks.push(this.#label));
  }
}

class ThrowingController extends BaseController {
  protected override onConnect(): void {
    throw new Error("broken child");
  }
}

/** Registers a listener, then throws. */
class PartialConnectElement extends BaseElement {
  protected override onConnect(): void {
    this.scope.listen(this, "click", () => clicks.push("host"));
    throw new Error("broken after listen");
  }
}
registerElement("test-partial-connect-element", PartialConnectElement);

/** Host whose first child controller connects and second throws. */
class ThrowingChildElement extends BaseElement {
  readonly good = this.addController(new ListeningController(this, "child"));
  readonly bad = this.addController(new ThrowingController(this));

  protected override onConnect(): void {
    this.scope.listen(this, "click", () => clicks.push("host"));
  }
}
registerElement("test-throwing-child-element", ThrowingChildElement);

/** Controller that registers a listener, connects a child, then throws. */
class PartialController extends BaseController {
  readonly child = this.addController(new ListeningController(this.root, "c"));
  shouldThrow = true;

  protected override onConnect(): void {
    this.scope.listen(this.root, "click", () => clicks.push("controller"));
    if (this.shouldThrow) throw new Error("broken controller");
  }
}

beforeEach(() => {
  clicks.length = 0;
  document.body.innerHTML = "";
});

describe("failed connect tears down listeners", () => {
  test("BaseElement: listener registered before the throw never fires", () => {
    const el = new PartialConnectElement();
    expect(() => el.connectedCallback()).toThrow("broken after listen");
    expect(el.hasAttribute("data-js-failed")).toBe(true);

    el.click();
    expect(clicks).toEqual([]);
  });

  test("BaseElement: earlier child controllers are disposed when a later one throws", () => {
    const el = new ThrowingChildElement();
    expect(() => el.connectedCallback()).toThrow("broken child");
    expect(el.hasAttribute("data-js-failed")).toBe(true);
    expect(el.good.isConnected).toBe(false);

    el.click();
    expect(clicks).toEqual([]);
  });

  test("BaseController: own listener is disposed and the failed mark stays", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const controller = new PartialController(root);

    expect(() => controller.connect()).toThrow("broken controller");
    expect(controller.isConnected).toBe(false);
    expect(root.hasAttribute("data-js-failed")).toBe(true);

    root.click();
    expect(clicks).toEqual([]);
  });

  test("BaseController: a successful reconnect clears the stale failed mark", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const controller = new PartialController(root);
    expect(() => controller.connect()).toThrow("broken controller");

    controller.shouldThrow = false;
    controller.connect();
    expect(root.hasAttribute("data-js-failed")).toBe(false);

    root.click();
    expect(clicks.sort()).toEqual(["c", "controller"]);
    controller.dispose();
  });
});

const lifecycle: string[] = [];

/** Registers a scope cleanup, throws, and records onDisconnect calls. */
class CleanupThenThrowElement extends BaseElement {
  shouldThrow = true;

  protected override onConnect(): void {
    this.scope.use(() => lifecycle.push("scope cleanup"));
    if (this.shouldThrow) throw new Error("broken after use");
  }

  protected override onDisconnect(): void {
    lifecycle.push("onDisconnect");
  }
}
registerElement("test-cleanup-then-throw-element", CleanupThenThrowElement);

describe("failed connect and onDisconnect", () => {
  beforeEach(() => {
    lifecycle.length = 0;
  });

  test("scope cleanups run at the moment onConnect throws", () => {
    const el = new CleanupThenThrowElement();
    expect(() => el.connectedCallback()).toThrow("broken after use");
    expect(lifecycle).toEqual(["scope cleanup"]);
  });

  test("onDisconnect doesn't run on removal after a failed connect", () => {
    const el = new CleanupThenThrowElement();
    expect(() => el.connectedCallback()).toThrow("broken after use");
    lifecycle.length = 0;
    el.disconnectedCallback();
    expect(lifecycle).toEqual([]);
    // Removal still clears the failed mark, so a re-attach starts clean.
    expect(el.hasAttribute("data-js-failed")).toBe(false);
  });

  test("onDisconnect still runs after a successful connect", () => {
    const el = new CleanupThenThrowElement();
    el.shouldThrow = false;
    el.connectedCallback();
    el.disconnectedCallback();
    expect(lifecycle).toEqual(["onDisconnect", "scope cleanup"]);
  });
});
