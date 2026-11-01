import fs from "fs";
import os from "os";
import path from "path";
import type { SnapshotManifest } from "@/common/thelatinlibrary/snapshot_types";
import {
  buildWorkIndex,
  comparePagePaths,
  slugify,
} from "@/scripts/thelatinlibrary/crawl/build_work_index";

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
});
