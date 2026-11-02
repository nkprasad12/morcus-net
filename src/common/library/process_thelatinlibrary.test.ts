import {
  convertTheLatinLibraryWork,
  processTheLatinLibrary,
  THE_LATIN_LIBRARY_ROOT_ENV,
  type TheLatinLibraryWork,
} from "@/common/library/process_thelatinlibrary";
import fs from "fs";
import os from "os";
import path from "path";

function makeWork(
  rows: TheLatinLibraryWork["rows"] = [
    [["pr"], "Prooemium."],
    [["1"], "Primum caput."],
    [["appendix1"], "Additamentum."],
  ]
): TheLatinLibraryWork {
  return {
    workId: "thelatinlibrary-test-opus",
    author: "Auctor",
    title: "Opus",
    source: {
      url: "https://www.thelatinlibrary.com/opus.html",
      retrieved: "2026-10-30",
      sha256: "abc",
      statedEdition: null,
    },
    textParts: ["chapter"],
    rows,
  };
}

describe("convertTheLatinLibraryWork", () => {
  it("credits The Latin Library and links the source page", () => {
    const result = convertTheLatinLibraryWork(makeWork());

    expect(result.info.attribution).toBe("theLatinLibrary");
    expect(result.info.sourceRef).toEqual([
      "https://www.thelatinlibrary.com/opus.html",
    ]);
    expect(result.info.editor).toBeUndefined();
  });

  it("keeps row order and ids, one page per chapter", () => {
    const result = convertTheLatinLibraryWork(makeWork());

    expect(result.textParts).toEqual(["chapter"]);
    expect(result.rows.map(([id]) => id)).toEqual([
      ["pr"],
      ["1"],
      ["appendix1"],
    ]);
    expect(result.rows[1][1].toString()).toContain("Primum caput.");
    expect(result.pages.map((p) => p.id)).toEqual([
      ["pr"],
      ["1"],
      ["appendix1"],
    ]);
  });

  it("marks editorial segments so the corpus skips them", () => {
    const result = convertTheLatinLibraryWork(
      makeWork([[["1"], [{ editorial: "[I. De iure.]" }, "Omnes populi."]]])
    );
    const row = result.rows[0][1];
    const editorial = row.children.find(
      (c) => typeof c !== "string" && c.getAttr("kind") === "editorial"
    );
    expect(editorial).toBeDefined();
    expect(row.toString()).toContain("Omnes populi.");
  });

  it("preserves citationStyle and emits style='smallcaps' on editorial spans", () => {
    const work = makeWork([
      [
        ["1"],
        [
          { editorial: "Ulpianus 1 inst.", style: "smallcaps" },
          "Iuri operam daturum.",
        ],
      ],
    ]);
    work.citationStyle = "roman_law";
    const result = convertTheLatinLibraryWork(work);

    expect(result.info.citationStyle).toBe("roman_law");
    const row = result.rows[0][1];
    const editorial = row.children.find(
      (c) => typeof c !== "string" && c.getAttr("kind") === "editorial"
    );
    expect(editorial).toBeDefined();
    expect(typeof editorial !== "string" && editorial?.getAttr("style")).toBe(
      "smallcaps"
    );
  });

  it("paginates by pageDepth and renders heading rows as headings", () => {
    const work = makeWork([
      [["1", "1"], "De iustitia et iure.", "heading"],
      [["1", "1", "1", "pr"], "Iuri operam."],
      [["1", "1", "2"], "Veluti."],
      [["1", "2"], "De origine iuris.", "heading"],
      [["1", "2", "1"], "Facturus."],
    ]);
    work.textParts = ["book", "title", "lex", "paragraph"];
    work.pageDepth = 2;
    const result = convertTheLatinLibraryWork(work);
    expect(result.pages).toEqual([
      { id: ["1", "1"], rows: [0, 3] },
      { id: ["1", "2"], rows: [3, 5] },
    ]);
    expect(result.rows[0][1].name).toBe("head");
  });

  it("rejects a heading whose id isn't a page id", () => {
    const work = makeWork([[["1", "1", "1"], "Titulus.", "heading"]]);
    work.textParts = ["book", "title", "lex", "paragraph"];
    work.pageDepth = 2;
    expect(() => convertTheLatinLibraryWork(work)).toThrow(/must be 2 parts/);
  });

  it("records a stated edition as the editor", () => {
    const work = makeWork();
    work.source.statedEdition = "Mommsen";
    expect(convertTheLatinLibraryWork(work).info.editor).toBe("Mommsen");
  });
});

describe("processTheLatinLibrary", () => {
  let root: string;
  const original = process.env[THE_LATIN_LIBRARY_ROOT_ENV];

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "thelatinlibrary-"));
    process.env[THE_LATIN_LIBRARY_ROOT_ENV] = root;
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    if (original === undefined) {
      delete process.env[THE_LATIN_LIBRARY_ROOT_ENV];
    } else {
      process.env[THE_LATIN_LIBRARY_ROOT_ENV] = original;
    }
  });

  function writeWork(work: TheLatinLibraryWork, name = "opus.json") {
    fs.mkdirSync(path.join(root, "works"), { recursive: true });
    fs.writeFileSync(path.join(root, "works", name), JSON.stringify(work));
  }

  it("fails when the works directory is missing", () => {
    expect(() => processTheLatinLibrary()).toThrow(
      /The Latin Library works not found/
    );
  });

  it("reads converted works", () => {
    writeWork(makeWork());
    const works = processTheLatinLibrary();
    expect(works.map((w) => w.info.workId)).toEqual([
      "thelatinlibrary-test-opus",
    ]);
  });

  it("rejects duplicate ids", () => {
    writeWork(
      makeWork([
        [["1"], "Primum."],
        [["1"], "Iterum."],
      ])
    );
    expect(() => processTheLatinLibrary()).toThrow(/duplicate id 1/);
  });

  it("rejects ids that don't match textParts", () => {
    writeWork(makeWork([[["1", "2"], "Primum."]]));
    expect(() => processTheLatinLibrary()).toThrow(/does not match textParts/);
  });

  it("allows rows one level shallower than textParts", () => {
    const work = makeWork([
      [["1", "1"], "Liber primus, caput primum."],
      [["7", "1", "1"], "Liber septimus."],
    ]);
    work.textParts = ["book", "chapter", "section"];
    writeWork(work);
    const [result] = processTheLatinLibrary();
    expect(result.pages.map((p) => p.id)).toEqual([
      ["1", "1"],
      ["7", "1"],
    ]);
  });

  it("rejects rows that would fall off every reader page", () => {
    const work = makeWork([
      [["pr"], "Praefatio."],
      [["1", "1", "1"], "Primum."],
    ]);
    work.textParts = ["book", "chapter", "section"];
    writeWork(work);
    expect(() => processTheLatinLibrary()).toThrow(/does not match textParts/);
  });

  it("rejects empty rows", () => {
    writeWork(makeWork([[["1"], "  "]]));
    expect(() => processTheLatinLibrary()).toThrow(/empty row/);
  });

  it("reads the root it is given instead of THELATINLIBRARY_ROOT", () => {
    const clone = fs.mkdtempSync(path.join(os.tmpdir(), "ll-clone-"));
    try {
      fs.mkdirSync(path.join(clone, "works"));
      fs.writeFileSync(
        path.join(clone, "works", "sample.json"),
        JSON.stringify(makeWork([[["1"], "Salve."]]))
      );
      // The env root has no works/, so this only passes if `clone` is read.
      const works = processTheLatinLibrary(clone);
      expect(works.map((w) => w.info.workId)).toEqual([
        "thelatinlibrary-test-opus",
      ]);
    } finally {
      fs.rmSync(clone, { recursive: true, force: true });
    }
  });

  it("fails when THELATINLIBRARY_ROOT is unset and no root is given", () => {
    delete process.env[THE_LATIN_LIBRARY_ROOT_ENV];
    const origCwd = process.cwd();
    const cwdTmp = fs.mkdtempSync(path.join(os.tmpdir(), "ll-cwd-"));
    try {
      // Checkouts where an old fallback would have looked must be ignored.
      for (const dir of ["TheLatinLibrary", "thelatinlibrary"]) {
        fs.mkdirSync(path.join(cwdTmp, dir, "works"), { recursive: true });
      }
      process.chdir(cwdTmp);
      expect(() => processTheLatinLibrary()).toThrow(
        /THELATINLIBRARY_ROOT not set/
      );
    } finally {
      process.chdir(origCwd);
      fs.rmSync(cwdTmp, { recursive: true, force: true });
    }
  });
});
