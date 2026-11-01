import fs from "fs";
import os from "os";
import path from "path";
import {
  SEED_OPEN_TEXTS_CATALOG_BUNDLE,
  filterOpenTextCatalogEntries,
  findOpenTextCatalogEntry,
  getOpenTextsCatalogBundle,
  groupOpenTextEntriesByAuthor,
  loadOpenTextsCatalogBundle,
  resetOpenTextsCatalogCache,
  setOpenTextsCatalogBundleForTest,
} from "@/common/open_texts/catalog_loader";
import type { OpenTextCatalogBundle } from "@/common/open_texts/catalog_types";

describe("catalog_loader", () => {
  afterEach(() => {
    resetOpenTextsCatalogCache();
  });

  it("falls back to SEED_OPEN_TEXTS_CATALOG_BUNDLE when catalog file is absent", () => {
    const missingPath = path.join(
      os.tmpdir(),
      "nonexistent-open-texts-catalog-12345.json"
    );
    const bundle = loadOpenTextsCatalogBundle(missingPath);
    expect(bundle).toBe(SEED_OPEN_TEXTS_CATALOG_BUNDLE);
    expect(bundle.entries.length).toBeGreaterThanOrEqual(6);
    expect(bundle.entries.some((e) => e.partialCoverage !== undefined)).toBe(
      true
    );
  });

  it("loads a catalog bundle JSON file when present on disk", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "morcus-loader-"));
    const customPath = path.join(tmpDir, "catalog.json");
    try {
      const customBundle: OpenTextCatalogBundle = {
        version: 1,
        generatedAt: "2026-10-31T00:00:00.000Z",
        sources: SEED_OPEN_TEXTS_CATALOG_BUNDLE.sources,
        entries: [SEED_OPEN_TEXTS_CATALOG_BUNDLE.entries[0]],
      };
      fs.writeFileSync(customPath, JSON.stringify(customBundle), "utf8");
      const loaded = getOpenTextsCatalogBundle({ catalogPath: customPath });
      expect(loaded.entries).toHaveLength(1);
      expect(loaded.entries[0].id).toBe(
        SEED_OPEN_TEXTS_CATALOG_BUNDLE.entries[0].id
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("supports test override via setOpenTextsCatalogBundleForTest", () => {
    const customBundle: OpenTextCatalogBundle = {
      version: 1,
      generatedAt: "2026-10-31T00:00:00.000Z",
      sources: SEED_OPEN_TEXTS_CATALOG_BUNDLE.sources,
      entries: SEED_OPEN_TEXTS_CATALOG_BUNDLE.entries.slice(0, 2),
    };
    setOpenTextsCatalogBundleForTest(customBundle);
    expect(getOpenTextsCatalogBundle().entries).toHaveLength(2);
  });

  it("finds an entry by id along with its sourceMeta", () => {
    const found = findOpenTextCatalogEntry(
      "pl/stoa0022.stoa002.opp-lat1",
      SEED_OPEN_TEXTS_CATALOG_BUNDLE
    );
    expect(found).toBeDefined();
    expect(found?.entry.author).toBe("Ambrosius");
    expect(found?.sourceMeta.source).toBe("patrologia_latina");

    expect(
      findOpenTextCatalogEntry(
        "pl/does-not-exist",
        SEED_OPEN_TEXTS_CATALOG_BUNDLE
      )
    ).toBeUndefined();
    expect(
      findOpenTextCatalogEntry("   ", SEED_OPEN_TEXTS_CATALOG_BUNDLE)
    ).toBeUndefined();
  });

  it("filters entries by query, source, period, and author", () => {
    const entries = SEED_OPEN_TEXTS_CATALOG_BUNDLE.entries;

    const byQuery = filterOpenTextCatalogEntries(entries, { q: "ambros fide" });
    expect(byQuery.map((e) => e.id)).toEqual(["pl/stoa0022.stoa002.opp-lat1"]);

    const bySource = filterOpenTextCatalogEntries(entries, {
      source: "thelatinlibrary",
    });
    expect(bySource.every((e) => e.source === "thelatinlibrary")).toBe(true);
    expect(bySource.length).toBeGreaterThan(0);

    const byPeriod = filterOpenTextCatalogEntries(entries, {
      period: "medieval",
    });
    expect(byPeriod.every((e) => e.period === "medieval")).toBe(true);
    expect(byPeriod.length).toBeGreaterThan(0);

    const byAuthor = filterOpenTextCatalogEntries(entries, {
      author: "Ambrosius",
    });
    expect(byAuthor.every((e) => e.author === "Ambrosius")).toBe(true);
    expect(byAuthor).toHaveLength(2);
  });

  it("groups entries alphabetically by author with deduplicated slugs", () => {
    const groups = groupOpenTextEntriesByAuthor(
      SEED_OPEN_TEXTS_CATALOG_BUNDLE.entries
    );
    expect(groups.length).toBeGreaterThanOrEqual(4);
    expect(groups.map((g) => g.author)).toEqual(
      [...groups.map((g) => g.author)].sort((a, b) => a.localeCompare(b))
    );
    const ambrosiusGroup = groups.find((g) => g.author === "Ambrosius");
    expect(ambrosiusGroup?.slug).toBe("ambrosius");
    expect(ambrosiusGroup?.entries).toHaveLength(2);
  });
});
