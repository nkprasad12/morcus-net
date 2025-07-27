import {
  AggregateTimer,
  Tally,
  areArraysEqual,
  exhaustiveGuard,
  mergeMaps,
  safeParseInt,
  singletonOf,
  estimateObjectSize,
} from "@/common/misc_utils";

describe("exhaustiveGuard", () => {
  it("raises on all input and raises ts error", () => {
    // @ts-expect-error
    expect(() => exhaustiveGuard("foo")).toThrow();
  });
});

describe("Tally", () => {
  it("counts inputs", () => {
    const tally = new Tally<string>();

    tally.count("a");
    tally.count("b");
    tally.count("a");

    expect(tally.toString()).toBe("Total: 3\n2 <= a\n1 <= b");
  });

  it("counts inputs with threshold", () => {
    const tally = new Tally<string>();

    tally.count("a");
    tally.count("b");
    tally.count("a");

    expect(tally.toString(2)).toBe("Total: 3\n2 <= a");
  });
});

describe("singleton helper", () => {
  it("returns initialized value", () => {
    const fooString = singletonOf(() => "foo");
    expect(fooString.get()).toBe("foo");
  });

  it("returns same instance on repeated calls", () => {
    const someObject = singletonOf(() => ({}));
    expect(someObject.get()).toBe(someObject.get());
  });

  it("is only initialized once", () => {
    const mockInitializer = jest.fn(() => "foo");
    const mockObject = singletonOf(mockInitializer);

    mockObject.get();
    mockObject.get();

    expect(mockInitializer).toHaveBeenCalledTimes(1);
  });
});

describe("safeParseInt", () => {
  it("returns result for positive number", () => {
    expect(safeParseInt("57")).toBe(57);
  });

  it("returns result for negative number", () => {
    expect(safeParseInt("-57")).toBe(-57);
  });

  it("returns undefined on other inputs", () => {
    expect(safeParseInt(undefined)).toBe(undefined);
    expect(safeParseInt("13e7")).toBe(undefined);
    expect(safeParseInt("3.14")).toBe(undefined);
  });
});

describe("mergeMaps", () => {
  it("merges disjoint maps", () => {
    const first = new Map([
      [1, "1"],
      [2, "2"],
    ]);
    const second = new Map([
      [3, "3"],
      [4, "4"],
    ]);

    const merged = mergeMaps(first, second);
    expect(merged.size).toBe(4);
    expect(merged.get(1)).toBe("1");
    expect(merged.get(2)).toBe("2");
    expect(merged.get(3)).toBe("3");
    expect(merged.get(4)).toBe("4");
  });

  it("merges overlapping maps if allowed", () => {
    const first = new Map([
      [1, "1"],
      [2, "2"],
    ]);
    const second = new Map([
      [2, "3"],
      [4, "4"],
    ]);

    const merged = mergeMaps(first, second, true);
    expect(merged.size).toBe(3);
    expect(merged.get(1)).toBe("1");
    expect(merged.get(2)).toBe("3");
    expect(merged.get(4)).toBe("4");
  });

  it("raises error on overlapping maps if not allowed", () => {
    const first = new Map([
      [1, "1"],
      [2, "2"],
    ]);
    const second = new Map([
      [2, "3"],
      [4, "4"],
    ]);

    expect(() => mergeMaps(first, second, false)).toThrow(/Duplicate/);
  });
});

describe("AggregateTimer", () => {
  it("aggregates inputs", () => {
    const timer = new AggregateTimer();

    timer.start("alpha");
    timer.end("alpha");
    timer.start("alpha");
    timer.end("alpha");
    timer.start("beta");
    timer.end("beta");

    const summary = timer.summary();
    expect(summary).toContain("Summary");
    expect(summary).toContain("a");
    expect(summary).toContain("b");
  });

  it("counts inputs with threshold", () => {
    const tally = new Tally<string>();

    tally.count("a");
    tally.count("b");
    tally.count("a");

    expect(tally.toString(2)).toBe("Total: 3\n2 <= a");
  });
});

describe("areArraysEqual", () => {
  test("false on differing lengths", () => {
    expect(areArraysEqual([1, 2, 3], [1, 2])).toBe(false);
  });

  test("false on differing elements", () => {
    expect(areArraysEqual([1, 3], [1, 2])).toBe(false);
  });

  test("true on equal", () => {
    expect(areArraysEqual([1, 3], [1, 3])).toBe(true);
  });
});

describe("estimateObjectSize", () => {
  it("estimates size of primitives", () => {
    expect(estimateObjectSize(42)).toBe(8);
    expect(estimateObjectSize(true)).toBe(4);
    expect(estimateObjectSize("abcd")).toBe(8); // 4 chars * 2 bytes
  });

  it("estimates size of arrays", () => {
    expect(estimateObjectSize([1, 2, 3])).toBe(24);
  });

  it("estimates size of objects", () => {
    expect(estimateObjectSize({ a: 1, b: "x" })).toBeGreaterThan(0);
  });

  it("estimates size of Map and Set", () => {
    const m = new Map();
    m.set("foo", 123);
    m.set("bar", [1, 2]);
    expect(estimateObjectSize(m)).toBeGreaterThan(0);

    const s = new Set(["a", "b", "c"]);
    expect(estimateObjectSize(s)).toBeGreaterThan(0);
  });

  it("handles circular references", () => {
    const obj: any = {};
    obj.self = obj;
    expect(estimateObjectSize(obj)).toBeGreaterThan(0);
  });
});
