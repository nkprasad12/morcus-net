import { Tally, exhaustiveGuard, singletonOf } from "@/common/misc_utils";

describe("exhaustiveGuard", () => {
  it("raises on all input and raises ts error", () => {
    // @ts-expect-error
    expect(() => exhaustiveGuard("foo")).toThrowError();
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
    const someObject = singletonOf(() => {});
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
