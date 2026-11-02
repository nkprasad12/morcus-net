import fs from "fs";
import os from "os";
import path from "path";
import {
  SEED_EXPERIMENTAL_TEXTS_CATALOG_BUNDLE,
  filterExperimentalTextCatalogEntries,
  findExperimentalTextCatalogEntry,
  getExperimentalTextsCatalogBundle,
  groupExperimentalTextEntriesByAuthor,
  loadExperimentalTextsCatalogBundle,
  resetExperimentalTextsCatalogCache,
  setExperimentalTextsCatalogBundleForTest,
} from "@/common/experimental_texts/catalog_loader";
import type { ExperimentalTextCatalogBundle } from "@/common/experimental_texts/catalog_types";

describe("catalog_loader", () => {
  afterEach(() => {
    resetExperimentalTextsCatalogCache();
  });

  it("falls back to SEED_EXPERIMENTAL_TEXTS_CATALOG_BUNDLE with lockfile pins and Sample Author/Work entries when catalog file is absent", () => {
    const missingPath = path.join(
      os.tmpdir(),
      "nonexistent-experimental-texts-catalog-12345.json"
    );
    const bundle = loadExperimentalTextsCatalogBundle(missingPath);
    expect(bundle).toBe(SEED_EXPERIMENTAL_TEXTS_CATALOG_BUNDLE);
    expect(bundle.entries).toHaveLength(2);
    for (const entry of bundle.entries) {
      expect(entry.author).toContain("Sample Author");
      expect(entry.title).toContain("Sample Work");
      expect(entry.title).toContain("./morcus.sh build -b_et");
    }

    const lockRaw: {
      sources: Record<string, { commit: string }>;
    } = JSON.parse(fs.readFileSync("upstream_sources.lock.json", "utf8"));
    expect(bundle.sources.patrologia_latina?.commit).toBe(
      lockRaw.sources["patrologia_latina-dev"].commit
    );
    expect(bundle.sources.thelatinlibrary?.commit).toBe(
      lockRaw.sources["thelatinlibrary"].commit
    );
    expect(bundle.sources.thelatinlibrary?.commit).not.toBe(
      "0000000000000000000000000000000000000000"
    );
  });

  it("loads and initializes seed pins without upstream_sources.lock.json in cwd", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "morcus-nolock-"));
    const prevCwd = process.cwd();
    try {
      process.chdir(tmpDir);
      expect(fs.existsSync("upstream_sources.lock.json")).toBe(false);
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const reloaded: typeof import("@/common/experimental_texts/catalog_loader") = require("@/common/experimental_texts/catalog_loader");
      expect(
        reloaded.SEED_EXPERIMENTAL_TEXTS_CATALOG_BUNDLE.sources
          .patrologia_latina?.commit
      ).toMatch(/^[0-9a-f]{40}$/);
      expect(
        reloaded.SEED_EXPERIMENTAL_TEXTS_CATALOG_BUNDLE.sources.thelatinlibrary
          ?.commit
      ).toMatch(/^[0-9a-f]{40}$/);
      expect(reloaded.loadExperimentalTextsCatalogBundle("missing.json")).toBe(
        reloaded.SEED_EXPERIMENTAL_TEXTS_CATALOG_BUNDLE
      );
    } finally {
      process.chdir(prevCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("loads a valid catalog bundle JSON file when present on disk and rejects malformed bundles", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "morcus-loader-"));
    const customPath = path.join(tmpDir, "catalog.json");
    try {
      const customBundle: ExperimentalTextCatalogBundle = {
        version: 1,
        generatedAt: "2026-10-31T00:00:00.000Z",
        sources: SEED_EXPERIMENTAL_TEXTS_CATALOG_BUNDLE.sources,
        entries: [SEED_EXPERIMENTAL_TEXTS_CATALOG_BUNDLE.entries[0]],
      };
      fs.writeFileSync(customPath, JSON.stringify(customBundle), "utf8");
      const loaded = getExperimentalTextsCatalogBundle({
        catalogPath: customPath,
      });
      expect(loaded.entries).toHaveLength(1);
      expect(loaded.entries[0].id).toBe(
        SEED_EXPERIMENTAL_TEXTS_CATALOG_BUNDLE.entries[0].id
      );

      fs.writeFileSync(
        customPath,
        JSON.stringify({
          version: 2,
          generatedAt: "x",
          sources: {},
          entries: [],
        }),
        "utf8"
      );
      expect(() => loadExperimentalTextsCatalogBundle(customPath)).toThrow(
        /expected version 1/
      );

      fs.writeFileSync(
        customPath,
        JSON.stringify({
          version: 1,
          generatedAt: "x",
          sources: {},
          entries: [{ id: "" }],
        }),
        "utf8"
      );
      expect(() => loadExperimentalTextsCatalogBundle(customPath)).toThrow(
        /Invalid Experimental Texts catalog entry/
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("supports test override via setExperimentalTextsCatalogBundleForTest", () => {
    const customBundle: ExperimentalTextCatalogBundle = {
      version: 1,
      generatedAt: "2026-10-31T00:00:00.000Z",
      sources: SEED_EXPERIMENTAL_TEXTS_CATALOG_BUNDLE.sources,
      entries: SEED_EXPERIMENTAL_TEXTS_CATALOG_BUNDLE.entries.slice(0, 1),
    };
    setExperimentalTextsCatalogBundleForTest(customBundle);
    expect(getExperimentalTextsCatalogBundle().entries).toHaveLength(1);
  });

  it("finds an entry by id along with its sourceMeta", () => {
    const found = findExperimentalTextCatalogEntry(
      "pl/stoa0022.stoa002.opp-lat1",
      SEED_EXPERIMENTAL_TEXTS_CATALOG_BUNDLE
    );
    expect(found).toBeDefined();
    expect(found?.entry.author).toBe("Sample Author (Patrologia Latina)");
    expect(found?.sourceMeta.source).toBe("patrologia_latina");

    expect(
      findExperimentalTextCatalogEntry(
        "pl/does-not-exist",
        SEED_EXPERIMENTAL_TEXTS_CATALOG_BUNDLE
      )
    ).toBeUndefined();
    expect(
      findExperimentalTextCatalogEntry(
        "   ",
        SEED_EXPERIMENTAL_TEXTS_CATALOG_BUNDLE
      )
    ).toBeUndefined();
  });

  it("filters entries by query, source, period, and author", () => {
    const entries = SEED_EXPERIMENTAL_TEXTS_CATALOG_BUNDLE.entries;

    const byQuery = filterExperimentalTextCatalogEntries(entries, {
      q: "patrologia pl 16",
    });
    expect(byQuery.map((e) => e.id)).toEqual(["pl/stoa0022.stoa002.opp-lat1"]);

    const bySource = filterExperimentalTextCatalogEntries(entries, {
      source: "thelatinlibrary",
    });
    expect(bySource.map((e) => e.id)).toEqual([
      "ll/abbo-passio-sancti-edmundi",
    ]);

    const byPeriod = filterExperimentalTextCatalogEntries(entries, {
      period: "medieval",
    });
    expect(byPeriod.map((e) => e.id)).toEqual([
      "ll/abbo-passio-sancti-edmundi",
    ]);

    const byAuthor = filterExperimentalTextCatalogEntries(entries, {
      author: "Sample Author (Patrologia Latina)",
    });
    expect(byAuthor.map((e) => e.id)).toEqual(["pl/stoa0022.stoa002.opp-lat1"]);
  });

  it("matches a query against an author's other names", () => {
    const [first, ...rest] = SEED_EXPERIMENTAL_TEXTS_CATALOG_BUNDLE.entries;
    const entries = [
      { ...first, author: "Jerome", authorAliases: ["Hieronymus"] },
      ...rest,
    ];
    expect(
      filterExperimentalTextCatalogEntries(entries, { q: "hieronymus" }).map(
        (e) => e.id
      )
    ).toEqual([first.id]);
  });

  it("groups entries alphabetically by author with deduplicated slugs", () => {
    const groups = groupExperimentalTextEntriesByAuthor(
      SEED_EXPERIMENTAL_TEXTS_CATALOG_BUNDLE.entries
    );
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.author)).toEqual([
      "Sample Author (Patrologia Latina)",
      "Sample Author (The Latin Library)",
    ]);
    expect(groups[0].slug).toBe("sample-author-patrologia-latina");
  });
});
