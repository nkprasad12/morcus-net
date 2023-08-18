import { exhaustiveGuard } from "@/common/misc_utils";

describe("exhaustiveGuard", () => {
  it("raises on all input and raises ts error", () => {
    // @ts-expect-error
    expect(() => exhaustiveGuard("foo")).toThrowError();
  });
});
