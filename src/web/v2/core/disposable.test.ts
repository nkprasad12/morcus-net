/**
 * @jest-environment jsdom
 */
import { DisposableBag } from "@/web/v2/core/disposable.client";

describe("DisposableBag", () => {
  let bag: DisposableBag;

  beforeEach(() => {
    bag = new DisposableBag();
  });

  test("executes callbacks in insertion (FIFO) order on dispose", () => {
    const order: number[] = [];
    bag.add(() => order.push(1));
    bag.add(() => order.push(2));
    bag.add(() => order.push(3));

    bag.dispose();

    expect(order).toEqual([1, 2, 3]);
  });

  test("add() returns the passed callback for chaining", () => {
    const fn = () => {};
    const returned = bag.add(fn);
    expect(returned).toBe(fn);
  });

  test("isolates errors so subsequent disposables execute", () => {
    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const step1 = jest.fn(() => {
      throw new Error("Boom");
    });
    const step2 = jest.fn();

    bag.add(step1);
    bag.add(step2);

    expect(() => bag.dispose()).not.toThrow();
    expect(step1).toHaveBeenCalledTimes(1);
    expect(step2).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      "Error during disposal:",
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });

  test("is idempotent: calling dispose() multiple times without new additions is a no-op", () => {
    const fn = jest.fn();
    bag.add(fn);

    bag.dispose();
    expect(fn).toHaveBeenCalledTimes(1);

    bag.dispose();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("is reusable after disposal: new callbacks added after dispose() execute on next dispose()", () => {
    const fn1 = jest.fn();
    const fn2 = jest.fn();

    bag.add(fn1);
    bag.dispose();
    expect(fn1).toHaveBeenCalledTimes(1);

    bag.add(fn2);
    bag.dispose();
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  test("handles re-entrant add() during dispose() cleanly", () => {
    const deferred = jest.fn();
    bag.add(() => {
      bag.add(deferred);
    });

    bag.dispose();
    // The re-entrant callback was added after draining, so it survives to next dispose
    expect(deferred).not.toHaveBeenCalled();

    bag.dispose();
    expect(deferred).toHaveBeenCalledTimes(1);
  });
});
