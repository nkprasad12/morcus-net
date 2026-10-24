import { Timer } from "@/web/telemetry/timer";

describe("Timer", () => {
  test("numbers repeated events from _2", () => {
    const timer = new Timer();
    timer.event("a");
    timer.event("b");
    timer.event("a");
    timer.event("a");

    expect(Object.keys(timer.getEvents())).toEqual(["a", "b", "a_2", "a_3"]);
  });

  test("records non-decreasing elapsed times rounded to 0.01 ms", () => {
    const timer = new Timer();
    const first = timer.event("first");
    const second = timer.event("second");

    expect(second).toBeGreaterThanOrEqual(first);
    expect(timer.getEvents()).toEqual({ first, second });
    for (const value of [first, second]) {
      expect(Math.round(value * 100) / 100).toBe(value);
    }
  });

  test("starts empty", () => {
    expect(new Timer().getEvents()).toEqual({});
  });
});
