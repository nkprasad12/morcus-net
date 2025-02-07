import { getBuildDate, getCommitHash, tryOr } from "@/web/client/define_vars";

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

  it("falls back to undefined for hash", () => {
    expect(getCommitHash()).toBe(undefined);
  });

  it("falls back to undefined for build date", () => {
    expect(getBuildDate()).toBe("undefined");
  });
});
