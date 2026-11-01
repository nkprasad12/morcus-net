import fs from "fs";
import os from "os";
import path from "path";
import {
  PATROLOGIA_LATINA_DEFAULT_REPO,
  PATROLOGIA_LATINA_LICENSE,
  buildOpenTextsCatalog,
  buildPatrologiaLatinaOpenTextEntries,
  buildPatrologiaLatinaSourceMeta,
  extractGithubOwnerRepo,
  resolveDefaultTheLatinLibraryOptions,
  sortOpenTextCatalogEntries,
} from "@/common/open_texts/catalog_builder";
import type { OpenTextCatalogEntry } from "@/common/open_texts/catalog_types";

const SAMPLE_COMMIT = "8c651f859f821f0868755596f1a513946ca25350";

function createMockPlRepo(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "morcus-pl-test-"));
  const dataDir = path.join(tmpDir, "data");

  // 1. Standard patristic author/work (PL 16)
  const ambrosiusWorkDir = path.join(dataDir, "stoa0022", "stoa002");
  fs.mkdirSync(ambrosiusWorkDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, "stoa0022", "__cts__.xml"),
    `<ti:textgroup xmlns:ti="http://chs.harvard.edu/xmlns/cts" urn="urn:cts:latinLit:stoa0022">
      <ti:groupname xml:lang="eng">Ambrosius</ti:groupname>
    </ti:textgroup>`
  );
  fs.writeFileSync(
    path.join(ambrosiusWorkDir, "__cts__.xml"),
    `<ti:work xmlns:ti="http://chs.harvard.edu/xmlns/cts" groupUrn="urn:cts:latinLit:stoa0022" xml:lang="lat" urn="urn:cts:latinLit:stoa0022.stoa002">
      <ti:title xml:lang="eng">De Fide</ti:title>
      <ti:edition urn="urn:cts:latinLit:stoa0022.stoa002.opp-lat1" workUrn="urn:cts:latinLit:stoa0022.stoa002">
        <ti:label xml:lang="eng">De Fide Ad Gratianum Augustum Libri Quinque</ti:label>
      </ti:edition>
    </ti:work>`
  );
  fs.writeFileSync(
    path.join(ambrosiusWorkDir, "stoa0022.stoa002.opp-lat1.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>
    <TEI xmlns="http://www.tei-c.org/ns/1.0">
      <teiHeader>
        <fileDesc>
          <publicationStmt><idno type="filename">PL16.xml</idno></publicationStmt>
          <sourceDesc>
            <listBibl><biblStruct><monogr>
              <author>Ambrosius</author>
              <imprint><publisher>Garnier</publisher><pubPlace>Paris</pubPlace><date>1880</date></imprint>
              <biblScope unit="volume">16</biblScope>
            </monogr></biblStruct></listBibl>
          </sourceDesc>
        </fileDesc>
      </teiHeader>
      <text><body><p>Regina Austri</p></body></text>
    </TEI>`
  );

  // 2. Medieval work via tmp<k> fallback to edition_metadata_sorted.csv (PL 83 > 73)
  const tmpWorkDir = path.join(dataDir, "tmp1", "tmp1");
  fs.mkdirSync(tmpWorkDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, "tmp1", "__cts__.xml"),
    `<ti:textgroup xmlns:ti="http://chs.harvard.edu/xmlns/cts" urn="urn:cts:latinLit:tmp1">
      <ti:groupname xml:lang="eng"></ti:groupname>
    </ti:textgroup>`
  );
  fs.writeFileSync(
    path.join(tmpWorkDir, "__cts__.xml"),
    `<ti:work xmlns:ti="http://chs.harvard.edu/xmlns/cts" groupUrn="urn:cts:latinLit:tmp1" xml:lang="lat" urn="urn:cts:latinLit:tmp1.tmp1">
      <ti:title xml:lang="eng">Sententiarum &gt; Libri Tres</ti:title>
    </ti:work>`
  );
  fs.writeFileSync(
    path.join(tmpWorkDir, "tmp1.tmp1.opp-lat1.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>
    <TEI xmlns="http://www.tei-c.org/ns/1.0">
      <teiHeader>
        <fileDesc>
          <publicationStmt>
            <authority>University of Leipzig</authority>
            <idno type="filename">TO BE ADDED BY LEIPZIG</idno>
            <availability><licence>Available under a Creative Commons Attribution-ShareAlike 4.0 International License</licence></availability>
          </publicationStmt>
          <sourceDesc>
            <listBibl><biblStruct><monogr>
              <author>Isidorus Hispaliensis</author>
              <imprint><publisher/><pubPlace/><date/></imprint>
            </monogr></biblStruct></listBibl>
          </sourceDesc>
        </fileDesc>
      </teiHeader>
      <text><body><p>Summum bonum Deus est</p></body></text>
    </TEI>`
  );
  fs.writeFileSync(
    path.join(tmpDir, "edition_metadata_sorted.csv"),
    [
      "PL3_0_PASS.xml\t\tNone\tNone\tNone\tNone\tNone\tsection, p",
      "PL83_1_SENT.xml\t\tNone\tNone\tNone\tNone\tNone\tsection, p",
    ].join("\n") + "\n"
  );

  return tmpDir;
}

describe("catalog_builder", () => {
  it("normalizes GitHub repository URLs and slugs", () => {
    expect(
      extractGithubOwnerRepo(
        "https://github.com/nkprasad12/patrologia_latina-dev.git"
      )
    ).toBe("nkprasad12/patrologia_latina-dev");
    expect(
      extractGithubOwnerRepo(
        "git@github.com:nkprasad12/patrologia_latina-dev.git"
      )
    ).toBe("nkprasad12/patrologia_latina-dev");
    expect(extractGithubOwnerRepo("nkprasad12/patrologia_latina-dev")).toBe(
      "nkprasad12/patrologia_latina-dev"
    );
  });

  it("builds Patrologia Latina source metadata with raw GitHub and jsDelivr URLs", () => {
    const meta = buildPatrologiaLatinaSourceMeta(SAMPLE_COMMIT);
    expect(meta).toEqual({
      source: "patrologia_latina",
      label: "Patrologia Latina",
      repo: PATROLOGIA_LATINA_DEFAULT_REPO,
      commit: SAMPLE_COMMIT,
      rawBaseUrl: `https://raw.githubusercontent.com/${PATROLOGIA_LATINA_DEFAULT_REPO}/${SAMPLE_COMMIT}/`,
      fallbackBaseUrl: `https://cdn.jsdelivr.net/gh/${PATROLOGIA_LATINA_DEFAULT_REPO}@${SAMPLE_COMMIT}/`,
      license: PATROLOGIA_LATINA_LICENSE,
    });
  });

  it("scans CTS XML and TEI headers into sorted OpenTextCatalogEntry items", () => {
    const tmpDir = createMockPlRepo();
    try {
      const { sourceMeta, entries } = buildPatrologiaLatinaOpenTextEntries({
        rootDir: tmpDir,
        commit: SAMPLE_COMMIT,
      });
      expect(sourceMeta.commit).toBe(SAMPLE_COMMIT);
      expect(entries).toHaveLength(2);

      expect(entries[0]).toEqual({
        id: "pl/stoa0022.stoa002.opp-lat1",
        source: "patrologia_latina",
        format: "tei",
        author: "Ambrosius",
        title: "De Fide Ad Gratianum Augustum Libri Quinque",
        period: "patristic",
        urn: "urn:cts:latinLit:stoa0022.stoa002.opp-lat1",
        volumeLabel: "PL 16",
        files: ["data/stoa0022/stoa002/stoa0022.stoa002.opp-lat1.xml"],
        sourceUrl: `https://github.com/${PATROLOGIA_LATINA_DEFAULT_REPO}/blob/${SAMPLE_COMMIT}/data/stoa0022/stoa002/stoa0022.stoa002.opp-lat1.xml`,
        license: "CC BY-SA 4.0",
        statedEdition:
          "J.-P. Migne, Patrologia Latina, vol. 16 (Garnier, Paris, 1880)",
      });

      expect(entries[1]).toEqual({
        id: "pl/tmp1.tmp1.opp-lat1",
        source: "patrologia_latina",
        format: "tei",
        author: "Isidorus Hispaliensis",
        title: "Sententiarum > Libri Tres",
        period: "medieval",
        urn: "urn:cts:latinLit:tmp1.tmp1.opp-lat1",
        volumeLabel: "PL 83",
        files: ["data/tmp1/tmp1/tmp1.tmp1.opp-lat1.xml"],
        sourceUrl: `https://github.com/${PATROLOGIA_LATINA_DEFAULT_REPO}/blob/${SAMPLE_COMMIT}/data/tmp1/tmp1/tmp1.tmp1.opp-lat1.xml`,
        license: "CC BY-SA 4.0",
        statedEdition: "J.-P. Migne, Patrologia Latina, vol. 83",
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("builds and writes a complete OpenTextCatalogBundle to disk", () => {
    const tmpDir = createMockPlRepo();
    const outPath = path.join(tmpDir, "out", "open_texts_catalog.json");
    try {
      const extraEntry: OpenTextCatalogEntry = {
        id: "ll/abbo-passio",
        source: "thelatinlibrary",
        format: "thelatinlibrary_html",
        author: "Abbo of Fleury",
        title: "Passio Sancti Edmundi",
        period: "medieval",
        files: ["raw/abbo.html"],
        sourceUrl: "https://www.thelatinlibrary.com/abbo.html",
        license: "Public domain",
      };
      const bundle = buildOpenTextsCatalog(outPath, {
        patrologiaLatina: { rootDir: tmpDir, commit: SAMPLE_COMMIT },
        additionalEntries: [extraEntry],
        generatedAt: "2026-10-31T12:00:00.000Z",
      });
      expect(bundle.version).toBe(1);
      expect(bundle.generatedAt).toBe("2026-10-31T12:00:00.000Z");
      expect(bundle.entries.map((e) => e.id)).toEqual([
        "ll/abbo-passio",
        "pl/stoa0022.stoa002.opp-lat1",
        "pl/tmp1.tmp1.opp-lat1",
      ]);

      const onDisk = JSON.parse(fs.readFileSync(outPath, "utf8"));
      expect(onDisk).toEqual(bundle);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("sorts entries by author, then title, then id", () => {
    const base: OpenTextCatalogEntry = {
      id: "pl/b",
      source: "patrologia_latina",
      format: "tei",
      author: "Tertullianus",
      title: "Apologeticus",
      period: "patristic",
      files: ["data/b.xml"],
      sourceUrl: "https://example.com/b",
      license: "CC BY-SA 4.0",
    };
    const sorted = sortOpenTextCatalogEntries([
      base,
      { ...base, id: "pl/a", title: "Apologeticus" },
      { ...base, id: "pl/c", author: "Ambrosius", title: "De Fide" },
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["pl/c", "pl/a", "pl/b"]);
  });

  it("resolves ./TheLatinLibrary when THELATINLIBRARY_ROOT is unset", () => {
    const prevEnv = process.env.THELATINLIBRARY_ROOT;
    delete process.env.THELATINLIBRARY_ROOT;
    const origCwd = process.cwd();
    const cwdTmp = fs.mkdtempSync(path.join(os.tmpdir(), "ot-cwd-"));
    try {
      fs.mkdirSync(path.join(cwdTmp, "TheLatinLibrary"), { recursive: true });
      process.chdir(cwdTmp);
      const opts = resolveDefaultTheLatinLibraryOptions();
      expect(opts.rootDir).toBe("TheLatinLibrary");
    } finally {
      process.chdir(origCwd);
      if (prevEnv !== undefined) {
        process.env.THELATINLIBRARY_ROOT = prevEnv;
      }
      fs.rmSync(cwdTmp, { recursive: true, force: true });
    }
  });
});
