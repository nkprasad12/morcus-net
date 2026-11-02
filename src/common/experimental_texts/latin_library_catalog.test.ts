import {
  buildLatinLibraryExperimentalTextEntries,
  formatPartialCoverageMessage,
} from "@/common/experimental_texts/latin_library_catalog";
import type {
  SnapshotManifest,
  SnapshotWorkIndex,
} from "@/common/thelatinlibrary/snapshot_types";

const COMMIT = "54dacdfe87dd5b1cddd641cdb9269105b9c94cd6";

describe("latin_library_catalog", () => {
  const sampleManifest: SnapshotManifest = {
    "abbofloracensis.html": {
      url: "https://www.thelatinlibrary.com/abbofloracensis.html",
      retrieved: "2026-10-30",
      sha256: "abc",
      provenance: "noStatement",
      provenanceStatements: [],
    },
    "apicius/apicius1.shtml": {
      url: "https://www.thelatinlibrary.com/apicius/apicius1.shtml",
      retrieved: "2026-10-30",
      sha256: "def",
      provenance: "noStatement",
      provenanceStatements: [],
    },
    "erasmus/moria.html": {
      url: "https://www.thelatinlibrary.com/erasmus/moria.html",
      retrieved: "2026-10-30",
      sha256: "ghi",
      provenance: "statementFound",
      provenanceClassification: "pre1930",
      provenanceStatements: ["Basileae 1515"],
    },
  };

  const sampleWorkIndex: SnapshotWorkIndex = {
    version: 1,
    generatedAt: "2026-10-30T00:00:00Z",
    sourceCommit: COMMIT,
    works: [
      {
        workId: "ll/abbo-passio-sancti-edmundi",
        author: "Abbo of Fleury",
        title: "Passio Sancti Edmundi",
        period: "medieval",
        pages: ["abbofloracensis.html"],
        status: "candidate",
        statedEdition: null,
        wordCount: 4632,
      },
      {
        workId: "ll/erasmus-moriae-encomium",
        author: "Desiderius Erasmus",
        title: "Moriae Encomium",
        period: "neolatin",
        pages: ["erasmus/moria.html"],
        status: "candidate",
        statedEdition: "Basileae 1515",
        wordCount: 25000,
      },
      {
        workId: "ll/apicius-de-re-coquinaria",
        author: "Apicius",
        title: "De Re Coquinaria (Books I-V)",
        period: "classical",
        pages: ["apicius/apicius1.shtml", "apicius/apicius2.shtml"],
        status: "partial",
        partialCoverage: {
          libraryWorkId: "phi2003.phi001.perseus-lat1",
          libraryUrl: "/work/apicius/de_re_coquinaria",
          libraryAuthor: "Apicius",
          libraryTitle: "De Re Coquinaria",
          note: "Books I-V in LL; Books I-X in Perseus.",
        },
        statedEdition: null,
        wordCount: 7899,
      },
      {
        workId: "thelatinlibrary-augustus-resgestae",
        author: "Augustus",
        title: "Res Gestae Divi Augusti",
        period: "classical",
        pages: ["resgestae.html"],
        status: "in_library",
      },
      {
        workId: "ll/modern-copyright-work",
        author: "Modern Author",
        title: "Copyrighted Edition",
        period: "neolatin",
        pages: ["modern.html"],
        status: "excluded",
      },
    ],
  };

  it("includes 'candidate' (including medieval and neolatin) and 'partial' works, omitting 'in_library' and 'excluded'", () => {
    const { sourceMeta, entries } = buildLatinLibraryExperimentalTextEntries(
      sampleWorkIndex,
      sampleManifest,
      COMMIT
    );

    expect(sourceMeta).toEqual({
      source: "thelatinlibrary",
      label: "The Latin Library",
      repo: "nkprasad12/TheLatinLibrary",
      commit: COMMIT,
      rawBaseUrl: `https://raw.githubusercontent.com/nkprasad12/TheLatinLibrary/${COMMIT}/`,
      fallbackBaseUrl: `https://cdn.jsdelivr.net/gh/nkprasad12/TheLatinLibrary@${COMMIT}/`,
      license:
        "Public domain Latin text; HTML transcription from The Latin Library",
    });

    expect(entries.map((e) => e.id)).toEqual([
      "ll/abbo-passio-sancti-edmundi",
      "ll/erasmus-moriae-encomium",
      "ll/apicius-de-re-coquinaria",
    ]);

    const abbo = entries[0];
    expect(abbo).toMatchObject({
      id: "ll/abbo-passio-sancti-edmundi",
      source: "thelatinlibrary",
      format: "thelatinlibrary_html",
      period: "medieval",
      files: ["raw/abbofloracensis.html"],
      sourceUrl: "https://www.thelatinlibrary.com/abbofloracensis.html",
      statedEdition: null,
      wordCount: 4632,
    });
    expect(abbo.partialCoverage).toBeUndefined();

    const erasmus = entries[1];
    expect(erasmus.period).toBe("neolatin");
    expect(erasmus.statedEdition).toBe("Basileae 1515");

    const apicius = entries[2];
    expect(apicius.partialCoverage).toEqual({
      libraryWorkId: "phi2003.phi001.perseus-lat1",
      libraryUrl: "/work/apicius/de_re_coquinaria",
      libraryAuthor: "Apicius",
      libraryTitle: "De Re Coquinaria",
      message:
        "A curated edition of De Re Coquinaria (Apicius) is available in the Library.",
    });
  });

  it("formats user-facing partialCoverage messages without maintainer shorthand", () => {
    expect(
      formatPartialCoverageMessage({
        libraryAuthor: "Apicius",
        libraryTitle: "De Re Coquinaria",
      })
    ).toBe(
      "A curated edition of De Re Coquinaria (Apicius) is available in the Library."
    );
    expect(
      formatPartialCoverageMessage({ libraryTitle: "De Re Coquinaria" })
    ).toBe(
      "A curated edition of De Re Coquinaria is available in the Library."
    );
    expect(formatPartialCoverageMessage({})).toBe(
      "A curated edition of this work is available in the Library."
    );
  });

  it("omits works present in promotedWorkIds", () => {
    const { entries } = buildLatinLibraryExperimentalTextEntries(
      sampleWorkIndex,
      sampleManifest,
      COMMIT,
      { promotedWorkIds: new Set(["ll/abbo-passio-sancti-edmundi"]) }
    );
    expect(entries.map((e) => e.id)).toEqual([
      "ll/erasmus-moriae-encomium",
      "ll/apicius-de-re-coquinaria",
    ]);
  });
});
