import {
  pageFileStem,
  parseWorkList,
  selectWorkPaths,
  workIdOfPath,
} from "@/scripts/library/render";
import {
  ALL_SUPPORTED_WORKS,
  EnglishTranslations,
  LatinWorks,
} from "@/common/library/library_constants";

describe("selectWorkPaths", () => {
  it("defaults to every onboarded work", () => {
    expect(selectWorkPaths()).toEqual(ALL_SUPPORTED_WORKS);
  });

  it("adds the English translation of a requested work", () => {
    const ids = selectWorkPaths([LatinWorks.SALLUST_CATALINA1]).map(
      workIdOfPath
    );
    expect(ids.sort()).toEqual(
      [
        LatinWorks.SALLUST_CATALINA1,
        EnglishTranslations[LatinWorks.SALLUST_CATALINA1],
      ].sort()
    );
  });

  it("rejects works that are not onboarded", () => {
    expect(() => selectWorkPaths(["phi9999.phi001.perseus-lat1"])).toThrow(
      /Not onboarded/
    );
  });
});

describe("pageFileStem", () => {
  it("keeps ordinary ids and escapes unsafe characters", () => {
    expect(pageFileStem("1.pr")).toBe("1.pr");
    expect(pageFileStem("a/b c")).toBe("a%2fb%20c");
    expect(pageFileStem("")).toBe("_root");
  });
});

describe("parseWorkList", () => {
  it("splits and trims", () => {
    expect(parseWorkList(" a, b ,,")).toEqual(["a", "b"]);
    expect(parseWorkList(undefined)).toBeUndefined();
    expect(parseWorkList(",")).toBeUndefined();
  });
});
