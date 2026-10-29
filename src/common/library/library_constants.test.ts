import {
  ALL_SUPPORTED_WORKS,
  LatinWorks,
  WORK_ID_ALIASES,
  resolveWorkIdAlias,
} from "@/common/library/library_constants";

describe("WORK_ID_ALIASES", () => {
  const currentIds = new Set<string>(Object.values(LatinWorks));

  test("every alias points at an onboarded work", () => {
    for (const newId of Object.values(WORK_ID_ALIASES)) {
      expect(currentIds).toContain(newId);
    }
  });

  test("no retired id is still onboarded", () => {
    const paths = ALL_SUPPORTED_WORKS.join("\n");
    for (const oldId of Object.keys(WORK_ID_ALIASES)) {
      expect(currentIds).not.toContain(oldId);
      expect(paths).not.toContain(oldId);
    }
  });

  test("resolveWorkIdAlias follows aliases and passes other ids through", () => {
    expect(resolveWorkIdAlias("phi1351.phi001.perseus-lat1")).toBe(
      LatinWorks.TACITUS_AGRICOLA
    );
    expect(resolveWorkIdAlias(LatinWorks.CAESAR_DBG)).toBe(
      LatinWorks.CAESAR_DBG
    );
  });
});
