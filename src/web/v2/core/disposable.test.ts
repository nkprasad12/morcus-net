/**
 * @jest-environment jsdom
 */
import {
  type CleanupFn,
  type Unregister,
  DisposableBag,
  createSingletonSetup,
} from "@/web/v2/core/disposable.client";

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

  test("add() returns an unregister function that prevents execution on dispose", () => {
    const fn: CleanupFn = jest.fn();
    const unregister: Unregister = bag.add(fn);
    unregister();
    bag.dispose();
    expect(fn).not.toHaveBeenCalled();
  });

  test("unregister() is idempotent", () => {
    const fn = jest.fn();
    const unregister = bag.add(fn);
    unregister();
    unregister();
    bag.dispose();
    expect(fn).not.toHaveBeenCalled();
  });

  test("unregister() removes only the intended callback and preserves FIFO order of others", () => {
    const order: number[] = [];
    bag.add(() => order.push(1));
    const unregister2 = bag.add(() => order.push(2));
    bag.add(() => order.push(3));

    unregister2();
    bag.dispose();

    expect(order).toEqual([1, 3]);
  });

  test("calling unregister() after dispose() is a safe no-op", () => {
    const fn = jest.fn();
    const unregister = bag.add(fn);
    bag.dispose();
    expect(fn).toHaveBeenCalledTimes(1);

    expect(() => unregister()).not.toThrow();
    bag.dispose();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("supports nested child scopes detaching themselves cleanly before parent disposal", () => {
    const parentBag = new DisposableBag();
    const childCleanup1 = jest.fn();
    const childCleanup2 = jest.fn();

    // Child scope 1 created and registered in parent
    const childBag1 = new DisposableBag();
    childBag1.add(childCleanup1);
    const detach1 = parentBag.add(() => childBag1.dispose());

    // Child scope 1 closes early and detaches from parent
    childBag1.dispose();
    detach1();
    expect(childCleanup1).toHaveBeenCalledTimes(1);

    // Child scope 2 created and registered in parent
    const childBag2 = new DisposableBag();
    childBag2.add(childCleanup2);
    parentBag.add(() => childBag2.dispose());

    // Parent disposes: childBag1 is not disposed again; childBag2 is disposed
    parentBag.dispose();
    expect(childCleanup1).toHaveBeenCalledTimes(1);
    expect(childCleanup2).toHaveBeenCalledTimes(1);
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

describe("createSingletonSetup", () => {
  test("runs setupFn and returns unbind cleanup handle", () => {
    const cleanup = jest.fn();
    const setup = createSingletonSetup(() => cleanup);

    const unbind = setup();
    expect(cleanup).not.toHaveBeenCalled();

    unbind();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  test("disposes previous active instance when setup is invoked again", () => {
    const cleanup1 = jest.fn();
    const cleanup2 = jest.fn();
    let count = 0;
    const setup = createSingletonSetup(() => {
      count++;
      return count === 1 ? cleanup1 : cleanup2;
    });

    setup();
    expect(cleanup1).not.toHaveBeenCalled();

    // Second call should tear down the first instance
    setup();
    expect(cleanup1).toHaveBeenCalledTimes(1);
    expect(cleanup2).not.toHaveBeenCalled();
  });

  test("clears activeCleanup when unbind is called so subsequent unbind is a no-op", () => {
    const cleanup = jest.fn();
    const setup = createSingletonSetup(() => cleanup);

    const unbind = setup();
    unbind();
    expect(cleanup).toHaveBeenCalledTimes(1);

    unbind();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
