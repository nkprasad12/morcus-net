import fs from "fs";
import os from "os";
import path from "path";
import type {
  SnapshotManifest,
  SnapshotPageEntry,
  SnapshotWorkEntry,
} from "@/common/thelatinlibrary/snapshot_types";
import {
  buildWorkIndex,
  comparePagePaths,
  slugify,
} from "@/scripts/thelatinlibrary/crawl/build_work_index";
import {
  buildManifestFromRaw,
  computeSha256,
  crawlLatinLibrary,
} from "@/scripts/thelatinlibrary/crawl/crawler";

function page(
  pagePath: string,
  extra: Partial<SnapshotPageEntry> = {}
): SnapshotPageEntry {
  return {
    url: `https://www.thelatinlibrary.com/${pagePath}`,
    retrieved: "2026-10-30",
    sha256: "0",
    provenance: "noStatement",
    provenanceStatements: [],
    ...extra,
  };
}

function previousWork(
  workId: string,
  pages: string[],
  extra: Partial<SnapshotWorkEntry> = {}
): SnapshotWorkEntry {
  return {
    workId,
    author: "x",
    title: "x",
    period: "classical",
    pages,
    status: "candidate",
    ...extra,
  };
}

describe("build_work_index", () => {
  it("slugifies author and title deterministically", () => {
    expect(slugify("Abbo of Fleury")).toBe("abbo-of-fleury");
    expect(slugify("Apicius (M. Gavius Apicius)")).toBe("apicius");
    expect(slugify("De Re Coquinaria (Books I-V)")).toBe("de-re-coquinaria");
  });

  it("orders pages naturally with praefatio first and numeric book order", () => {
    const pages = [
      "justin/10.html",
      "justin/2.html",
      "justin/praefatio.html",
      "justin/1.html",
    ];
    expect([...pages].sort(comparePagePaths)).toEqual([
      "justin/praefatio.html",
      "justin/1.html",
      "justin/2.html",
      "justin/10.html",
    ]);
  });

  it("classifies in_library, partial, excluded, and candidate works and strips duplicates", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ll-work-index-"));
    try {
      // Create a promoted work JSON in works/
      fs.mkdirSync(path.join(tmpRoot, "works"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpRoot, "works", "thelatinlibrary-augustus-resgestae.json"),
        JSON.stringify({
          workId: "thelatinlibrary-augustus-resgestae",
          author: "Augustus",
          title: "Res Gestae Divi Augusti",
          source: { url: "https://www.thelatinlibrary.com/resgestae.html" },
        })
      );

      const manifest: SnapshotManifest = {
        "resgestae.html": {
          url: "https://www.thelatinlibrary.com/resgestae.html",
          retrieved: "2026-10-30",
          sha256: "abc",
          workId: "thelatinlibrary-augustus-resgestae",
          provenance: "noStatement",
          provenanceStatements: [],
        },
        "apicius.html": {
          url: "https://www.thelatinlibrary.com/apicius.html",
          retrieved: "2026-10-30",
          sha256: "def",
          provenance: "noStatement",
          provenanceStatements: [],
        },
        "jfkhonor.html": {
          url: "https://www.thelatinlibrary.com/jfkhonor.html",
          retrieved: "2026-10-30",
          sha256: "ghi",
          provenance: "statementFound",
          provenanceClassification: "post1930_or_copyright",
          provenanceStatements: ["1963"],
          excluded: true,
          exclusionReason: "1963 diploma",
        },
        "solinus1a.html": {
          url: "https://www.thelatinlibrary.com/solinus1a.html",
          retrieved: "2026-10-30",
          sha256: "jkl",
          provenance: "noStatement",
          provenanceStatements: [],
        },
        "solinus5.html": {
          url: "https://www.thelatinlibrary.com/solinus5.html",
          retrieved: "2026-10-30",
          sha256: "mno",
          provenance: "noStatement",
          provenanceStatements: [],
        },
      };

      const libraryUrlMap = new Map<string, string>([
        ["phi2003.phi001.perseus-lat1", "/work/apicius/de_re_coquinaria"],
      ]);

      const index = buildWorkIndex({
        rootDir: tmpRoot,
        manifest,
        libraryUrlMap,
        duplicates: [
          {
            smaller: "solinus1a.txt",
            larger: "solinus5.txt",
            same_audit_entry: true,
          },
        ],
        audit: {
          classical_and_late_antique_missing: [
            {
              ll_author: "Augustus",
              ll_title: "Res Gestae Divi Augusti",
              ll_paths: ["resgestae.txt"],
              era: "classical",
            },
            {
              ll_author: "C. Iulius Solinus",
              ll_title: "Collectanea Rerum Memorabilium",
              ll_paths: ["solinus1a.txt", "solinus5.txt"],
              era: "late_antique",
            },
          ],
          partial_coverage_works: [
            {
              ll_author: "Apicius",
              ll_title: "De Re Coquinaria",
              ll_paths: ["apicius.txt"],
              perseus_id: "phi2003.phi001.perseus-lat1",
              perseus_author: "Apicius",
              perseus_title: "De Re Coquinaria",
              era: "classical",
              notes: "Perseus has Books I-X; LL has Books I-V.",
            },
          ],
          neolatin_works: [
            {
              ll_author: "Free University of Berlin",
              ll_title: "JFK Honor",
              ll_paths: ["jfkhonor.txt"],
              era: "neolatin",
            },
          ],
        },
      });

      expect(index.version).toBe(1);
      expect(index.works).toHaveLength(4);

      const augustus = index.works.find(
        (w) => w.workId === "thelatinlibrary-augustus-resgestae"
      )!;
      expect(augustus.status).toBe("in_library");
      expect(augustus.libraryWorkIds).toContain(
        "thelatinlibrary-augustus-resgestae"
      );

      const apicius = index.works.find((w) => w.author === "Apicius")!;
      expect(apicius.status).toBe("partial");
      expect(apicius.partialCoverage).toEqual({
        libraryWorkId: "phi2003.phi001.perseus-lat1",
        libraryAuthor: "Apicius",
        libraryTitle: "De Re Coquinaria",
        libraryUrl: "/work/apicius/de_re_coquinaria",
        note: "Perseus has Books I-X; LL has Books I-V.",
      });

      const jfk = index.works.find((w) => w.pages.includes("jfkhonor.html"))!;
      expect(jfk.status).toBe("excluded");
      expect(jfk.exclusionReason).toContain("1963");

      const solinus = index.works.find(
        (w) => w.author === "C. Iulius Solinus"
      )!;
      expect(solinus.status).toBe("candidate");
      expect(solinus.period).toBe("late_antique");
      expect(solinus.pages).toEqual(["solinus5.html"]);
      expect(solinus.redundantOrAlternatePages).toEqual(["solinus1a.html"]);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("keeps previous work ids and never reuses retired ones", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ll-work-ids-"));
    try {
      const manifest: SnapshotManifest = {
        "comp.html": page("comp.html"),
        "aetna.html": page("aetna.html"),
        "new.html": page("new.html"),
      };
      const index = buildWorkIndex({
        rootDir: tmpRoot,
        manifest,
        previousIndex: {
          version: 1,
          generatedAt: "2026-01-01",
          works: [
            previousWork("ll/appendix-aetna", ["aetna.html", "comp.html"]),
            previousWork("ll/appendix-copa", ["comp.html"]),
            previousWork("ll/anon-novum", ["gone.html"]),
          ],
        },
        audit: {
          medieval_works: [
            // Processed first, but must not take Aetna's id via comp.html.
            { ll_author: "Appendix", ll_title: "Copa", ll_paths: ["comp.txt"] },
            {
              ll_author: "Appendix",
              ll_title: "Aetna Carmen",
              ll_paths: ["aetna.txt", "comp.txt"],
            },
            // Would slugify to the retired id of a different work.
            { ll_author: "Anon", ll_title: "Novum", ll_paths: ["new.txt"] },
          ],
        },
      });
      const idOf = (title: string) =>
        index.works.find((w) => w.title === title)!.workId;
      expect(idOf("Copa")).toBe("ll/appendix-copa");
      expect(idOf("Aetna Carmen")).toBe("ll/appendix-aetna");
      expect(idOf("Novum")).toBe("ll/anon-novum-2");
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("never gives in_library works an exclusionReason, and dates the index from its inputs", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ll-work-inlib-"));
    try {
      const manifest: SnapshotManifest = {
        "sen/herc.html": page("sen/herc.html", {
          retrieved: "2026-10-31",
          excluded: true,
          provenanceClassification: "post1930_or_copyright",
          exclusionReason: "modern edition",
        }),
      };
      const index = buildWorkIndex({
        rootDir: tmpRoot,
        manifest,
        audit: {
          present_same_works: [
            {
              ll_author: "Seneca",
              ll_title: "Hercules",
              ll_paths: ["sen/herc.txt"],
            },
          ],
        },
      });
      expect(index.works[0].status).toBe("in_library");
      expect(index.works[0].exclusionReason).toBeUndefined();
      expect(index.generatedAt).toBe("2026-10-31");
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("applies the overrides file", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ll-work-ovr-"));
    try {
      const manifest: SnapshotManifest = {
        "victor/victor.origio.html": page("victor/victor.origio.html"),
        "gellius/gellius1.shtml": page("gellius/gellius1.shtml"),
        "gellius/gellius12.shtml": page("gellius/gellius12.shtml"),
        "festus.shtml": page("festus.shtml"),
      };
      const index = buildWorkIndex({
        rootDir: tmpRoot,
        manifest,
        overrides: {
          auditPathAliases: {
            "victor.origio.txt": "victor/victor.origio.html",
          },
          extraAuditPages: [
            { llAuthor: "Aulus Gellius", page: "gellius/gellius12.shtml" },
          ],
          unauditedWorks: {
            "festus.shtml": {
              author: "Sextus Pompeius Festus",
              title: "De Verborum Significatu",
              period: "classical",
            },
          },
        },
        audit: {
          present_same_works: [
            {
              ll_author: "Victor",
              ll_title: "Origo",
              ll_paths: ["victor.origio.txt"],
            },
            {
              ll_author: "Aulus Gellius",
              ll_title: "Noctes",
              ll_paths: ["gellius/gellius1.txt"],
            },
          ],
        },
      });
      const byAuthor = (a: string) => index.works.find((w) => w.author === a)!;
      expect(byAuthor("Victor").pages).toEqual(["victor/victor.origio.html"]);
      expect(byAuthor("Aulus Gellius").pages).toEqual([
        "gellius/gellius1.shtml",
        "gellius/gellius12.shtml",
      ]);
      expect(byAuthor("Sextus Pompeius Festus").title).toBe(
        "De Verborum Significatu"
      );
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("infers an unaudited work's period through the hub -> author page -> work chain", async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ll-work-hub-"));
    try {
      const write = (p: string, html: string) => {
        const bytes = Buffer.from(`<html><body>${html}</body></html>`);
        const file = path.join(tmpRoot, "raw", p);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, bytes);
        fs.writeFileSync(
          `${file}.meta.json`,
          JSON.stringify({
            url: `https://www.thelatinlibrary.com/${p}`,
            retrieved: "2026-10-31",
            sha256: computeSha256(bytes),
          })
        );
      };
      write("index.html", '<a href="medieval.html">Medieval</a>');
      write("medieval.html", '<a href="abbo.html">Abbo</a>');
      write("abbo.html", '<h1>ABBO</h1><a href="abbo/passio.html">Passio</a>');
      write("abbo/passio.html", "<h1>PASSIO</h1><p>Textus.</p>");

      const { links } = await crawlLatinLibrary({
        rootDir: tmpRoot,
        seedPaths: ["index.html", "medieval.html"],
        offline: true,
      });
      const { manifest } = buildManifestFromRaw(tmpRoot, { links });
      expect(manifest["abbo.html"].hubPage).toBe("medieval.html");
      expect(manifest["abbo/passio.html"].authorPage).toBe("abbo.html");

      const index = buildWorkIndex({ rootDir: tmpRoot, manifest, audit: {} });
      expect(index.works).toHaveLength(1);
      expect(index.works[0]).toMatchObject({
        author: "ABBO",
        title: "PASSIO",
        period: "medieval",
        pages: ["abbo/passio.html"],
      });
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
