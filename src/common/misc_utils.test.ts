import { Tally, exhaustiveGuard } from "@/common/misc_utils";

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
});
