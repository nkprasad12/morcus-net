import {
  LatinWorks,
  WORK_ID_ALIASES,
} from "@/common/library/library_constants";
import type { V2PreprocessedWork } from "@/common/library/preprocess/preprocessed_types";
import {
  getV2Work,
  LEGACY_AUTHOR_SLUGS,
  resolvePageInWork,
  saveV2LibraryDb,
} from "@/web/ui/reader/reader_loader.server";
import fs from "fs";
import os from "os";
import path from "path";

const OLD_DE_OFFICIIS = "phi0474.phi055.perseus-lat1";

function fakeWork(id: string, urlName: string): V2PreprocessedWork {
  return {
    id,
    title: urlName,
    author: "M. Tullius Cicero",
    urlAuthor: "cicero",
    urlName,
    attribution: "perseus",
    hasMacra: false,
    hasTranslation: false,
    textParts: ["book", "section"],
    paginationDepth: 1,
    tocHtml: "",
    pages: [
      {
        id: ["1"],
        title: "Book 1",
        sectionCount: 1,
        citationRange: ["1.1", "1.1"],
        singleHtml: "<p>Quamquam te, Marce fili</p>",
      },
    ],
  };
}

describe("work id aliases", () => {
  let libDir = "";

  beforeEach(() => {
    libDir = fs.mkdtempSync(path.join(os.tmpdir(), "reader-loader-test-"));
  });

  afterEach(() => {
    fs.rmSync(libDir, { recursive: true, force: true });
  });

  test("an old id resolves to its successor", async () => {
    expect(WORK_ID_ALIASES[OLD_DE_OFFICIIS]).toBe(
      LatinWorks.CICERO_DE_OFFICIIS
    );
    saveV2LibraryDb(libDir, [
      fakeWork(LatinWorks.CICERO_DE_OFFICIIS, "de_officiis"),
    ]);

    const work = await getV2Work(OLD_DE_OFFICIIS, libDir);

    expect(work?.id).toBe(LatinWorks.CICERO_DE_OFFICIIS);
    expect(work?.pages[0].singleHtml).toContain("Marce fili");
  });

  test("an old id whose successor is not in the library is not found", async () => {
    saveV2LibraryDb(libDir, [fakeWork(LatinWorks.CAESAR_DBG, "dbg")]);

    expect(await getV2Work(OLD_DE_OFFICIIS, libDir)).toBeNull();
  });

  test("a work still shipped under an aliased id wins over the alias", async () => {
    saveV2LibraryDb(libDir, [
      fakeWork(OLD_DE_OFFICIIS, "old_de_officiis"),
      fakeWork(LatinWorks.CICERO_DE_OFFICIIS, "de_officiis"),
    ]);

    expect((await getV2Work(OLD_DE_OFFICIIS, libDir))?.id).toBe(
      OLD_DE_OFFICIIS
    );
  });
});

describe("legacy author slugs", () => {
  let libDir = "";

  beforeEach(() => {
    libDir = fs.mkdtempSync(path.join(os.tmpdir(), "reader-loader-test-"));
  });

  afterEach(() => {
    fs.rmSync(libDir, { recursive: true, force: true });
  });

  function senecaWork(id: string, urlName: string): V2PreprocessedWork {
    return {
      ...fakeWork(id, urlName),
      author: "Seneca, Lucius Annaeus",
      urlAuthor: "seneca_minor",
    };
  }

  test("Seneca's old author slug resolves to the work", async () => {
    expect(LEGACY_AUTHOR_SLUGS.get("seneca_minor")).toContain(
      "seneca,_lucius_annaeus"
    );
    saveV2LibraryDb(libDir, [
      senecaWork("phi1017.phi014.perseus-lat2", "de_clementia"),
    ]);

    const legacy = await getV2Work(
      "seneca,_lucius_annaeus/de_clementia",
      libDir
    );
    const canonical = await getV2Work("seneca_minor/de_clementia", libDir);

    expect(legacy?.id).toBe("phi1017.phi014.perseus-lat2");
    expect(canonical?.id).toBe("phi1017.phi014.perseus-lat2");
  });

  test("other authors get no legacy slug", async () => {
    saveV2LibraryDb(libDir, [
      fakeWork(LatinWorks.CICERO_DE_OFFICIIS, "de_officiis"),
    ]);

    expect(
      await getV2Work("seneca,_lucius_annaeus/de_officiis", libDir)
    ).toBeNull();
  });
});

describe("resolvePageInWork section fallback", () => {
  function lineWork(lineCount: number): V2PreprocessedWork {
    const lines = Array.from(
      { length: lineCount },
      (_, i) => `<span id="sec-${i + 1}">versus ${i + 1}</span>`
    );
    return {
      ...fakeWork("phi0690.phi001.perseus-lat2", "ciris"),
      textParts: ["line"],
      paginationDepth: 1,
      pages: [
        {
          id: ["1"],
          title: `Lines 1–${lineCount}`,
          sectionCount: lineCount,
          citationRange: ["1", `${lineCount}`],
          singleHtml: lines.join(""),
        },
      ],
    };
  }

  test("a line in a single-page line work finds its page", () => {
    const work = lineWork(80);

    expect(resolvePageInWork(work, "57")).toMatchObject({
      pageIndex: 0,
      matched: true,
    });
  });

  test("a line the work lacks still misses", () => {
    const work = lineWork(80);

    expect(resolvePageInWork(work, "81").matched).toBe(false);
    // `sec-5` must not match inside `sec-57`.
    const onlyLine57: V2PreprocessedWork = {
      ...work,
      pages: [{ ...work.pages[0], singleHtml: '<span id="sec-57">x</span>' }],
    };
    expect(resolvePageInWork(onlyLine57, "5").matched).toBe(false);
    expect(resolvePageInWork(onlyLine57, "57").matched).toBe(true);
  });

  test("finds the right page among several", () => {
    const work: V2PreprocessedWork = {
      ...fakeWork("phi0959.phi001.perseus-lat2", "amores"),
      pages: [
        {
          id: ["1"],
          title: "Book 1",
          sectionCount: 1,
          citationRange: ["a1", "a1"],
          singleHtml: '<span id="sec-a1">x</span>',
        },
        {
          id: ["2"],
          title: "Book 2",
          sectionCount: 1,
          citationRange: ["b7", "b7"],
          singleHtml: '<span id="sec-b7">y</span>',
        },
      ],
    };

    expect(resolvePageInWork(work, "b7")).toMatchObject({
      pageIndex: 1,
      matched: true,
    });
  });
});
