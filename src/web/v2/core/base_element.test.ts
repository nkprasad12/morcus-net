/**
 * @jest-environment jsdom
 */
import {
  BaseElement,
  registerElement,
} from "@/web/v2/core/base_element.client";

type Lane = "alpha" | "beta";

class TestElement extends BaseElement<Lane> {
  connectCount = 0;

  protected override onConnect(): void {
    this.connectCount++;
  }

  // Expose the protected surface for testing.
  lifetimeSignal(): AbortSignal {
    return this.signal;
  }

  laneSignal(lane: Lane): AbortSignal {
    return this.latest(lane);
  }

  cancelLane(lane: Lane): void {
    this.cancel(lane);
  }
}

registerElement("morcus-test-base-element", TestElement);

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
});
