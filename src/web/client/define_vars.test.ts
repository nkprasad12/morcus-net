import { getCommitHash, tryOr } from "./define_vars";

describe("define_vars", () => {
  test("tryOr returns expected", () => {
    // @ts-ignore
    expect(
      tryOr(() => {
        throw "Error";
      }, "fallback")
    ).toBe("fallback");
    expect(tryOr(() => "result", "fallback")).toBe("result");
  });

  it("falls back to undefined", () => {
    expect(getCommitHash()).toBe("undefined");
  });
});
