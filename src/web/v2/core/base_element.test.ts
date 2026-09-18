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

  scheduleTimeout(fn: () => void, ms: number): number {
    return this.timeout(fn, ms);
  }

  scheduleRaf(fn: FrameRequestCallback): number {
    return this.rAF(fn);
  }

  cancelTimeout(id: number): void {
    this.clearTimeout(id);
  }

  cancelRaf(id: number): void {
    this.cancelRAF(id);
  }

  createDebounce<T extends (...args: never[]) => void>(fn: T, ms: number) {
    return this.debounce(fn, ms);
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
});
