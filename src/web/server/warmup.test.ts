import { Warmup } from "@/web/server/warmup";

/** Lets every pending `setImmediate` chain run to completion. */
async function drainImmediates(turns = 10): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe("Warmup", () => {
  test("lazy values are created once, on first get", () => {
    const warmup = new Warmup(() => {});
    const create = jest.fn(() => ({ id: 1 }));
    const lazy = warmup.lazy("thing", create);

    expect(create).not.toHaveBeenCalled();
    const first = lazy.get();
    expect(lazy.get()).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
  });

  test("an undefined result is cached", () => {
    const warmup = new Warmup(() => {});
    const create = jest.fn((): string | undefined => undefined);
    const lazy = warmup.lazy("absent", create);

    expect(lazy.get()).toBeUndefined();
    expect(lazy.get()).toBeUndefined();
    expect(create).toHaveBeenCalledTimes(1);
  });

  test("logs creation time under the given name", () => {
    const log = jest.fn();
    const warmup = new Warmup(log);
    warmup.lazy("Gesner", () => 1).get();

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatch(/^Gesner init: \d+\.\d{2} ms$/);
  });

  test("start runs tasks in order, one per turn, without re-creating", async () => {
    const warmup = new Warmup(() => {});
    const order: string[] = [];
    const a = warmup.lazy("a", () => order.push("a"));
    warmup.add(() => order.push("b"));
    warmup.lazy("c", () => order.push("c"));
    // Created on demand before warm-up reaches it.
    a.get();

    warmup.start();
    // Nothing runs synchronously.
    expect(order).toEqual(["a"]);
    await drainImmediates();
    expect(order).toEqual(["a", "b", "c"]);
  });

  test("stop skips the tasks that haven't run", async () => {
    const warmup = new Warmup(() => {});
    const order: string[] = [];
    warmup.add(() => {
      order.push("first");
      warmup.stop();
    });
    warmup.add(() => order.push("second"));

    warmup.start();
    await drainImmediates();
    expect(order).toEqual(["first"]);
  });
});
