import { loadPatches } from "@/common/library/library_patches";

describe("loadPatches", () => {
  it("finds expected patches", () => {
    const patches = loadPatches();

    const juvenalPatches = patches.get("phi1276.phi001.perseus-lat2");
    expect(juvenalPatches).not.toBeUndefined();
    expect(juvenalPatches).not.toHaveLength(0);
    expect(juvenalPatches![0].replacement).toBe("Alcithoen");
  });
});
