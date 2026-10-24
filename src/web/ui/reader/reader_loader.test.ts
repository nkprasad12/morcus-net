import {
  LatinWorks,
  WORK_ID_ALIASES,
} from "@/common/library/library_constants";
import type { V2PreprocessedWork } from "@/common/library/preprocess/preprocessed_types";
import {
  getV2Work,
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
