import fs from "fs";
import path from "path";

import type { CorpusInputWork } from "@/common/library/corpus/corpus_common";
import {
  LIB_CORPUS_INPUT_DIR,
  latinWorksFromLibrary,
} from "@/common/library/corpus/corpus_library_utils";
import {
  DEFAULT_NON_ASCII_RATCHET_PATH,
  NON_ASCII_RATCHET_SCHEMA_VERSION,
  analyzeCorpusNonAscii,
  buildNonAsciiRatchet,
  categorizeNonAsciiToken,
  evaluateNonAsciiRatchet,
  formatNonAsciiRatchetReport,
  hasCorruptedLatinCombiningMark,
  isNonAsciiWord,
  renderNonAsciiMarkdownReport,
  serializeNonAsciiRatchet,
  type NonAsciiRatchet,
} from "@/common/library/corpus/corpus_non_ascii";

const RATCHET_PATH = path.resolve(
  process.cwd(),
  DEFAULT_NON_ASCII_RATCHET_PATH
);

describe("categorizeNonAsciiToken", () => {
  it("identifies ASCII vs non-ASCII words", () => {
    expect(isNonAsciiWord("ego")).toBe(false);
    expect(isNonAsciiWord("e\u0301go")).toBe(true);
    expect(() => categorizeNonAsciiToken("ego")).toThrow("Expected non-ASCII");
  });

  it("categorizes Latin words with legitimate combining marks", () => {
    expect(categorizeNonAsciiToken("e\u0301go")).toBe("latinCombiningMarks");
    expect(categorizeNonAsciiToken("poe\u0308tae")).toBe("latinCombiningMarks");
    expect(categorizeNonAsciiToken("denu\u0302m")).toBe("latinCombiningMarks");
    expect(categorizeNonAsciiToken("ca\u0323sin\u0323u\u0323st")).toBe(
      "latinCombiningMarks"
    );
    expect(categorizeNonAsciiToken("x\u0305v\u0305i\u0305")).toBe(
      "latinCombiningMarks"
    );
    expect(categorizeNonAsciiToken("verres\u0335")).toBe("latinCombiningMarks");
    expect(categorizeNonAsciiToken("\u0335")).toBe("latinCombiningMarks");
  });

  it("categorizes pure Greek and Greek with Latin -que enclitic as greek", () => {
    expect(categorizeNonAsciiToken("και\u0300")).toBe("greek");
    expect(categorizeNonAsciiToken("ʼα\u0313φροδι\u0301τη")).toBe("greek");
    expect(categorizeNonAsciiToken("ο\u0314\u0301μοιο\u0301νque")).toBe(
      "greek"
    );
    expect(categorizeNonAsciiToken("οι\u0313\u0301νω\u0345que")).toBe("greek");
    expect(categorizeNonAsciiToken("φαι\u0301νωνque")).toBe("greek");
    expect(categorizeNonAsciiToken("φια\u0301λη\u0345que")).toBe("greek");
  });

  it("categorizes editorial brackets and punctuation glued to words", () => {
    expect(categorizeNonAsciiToken("abolito〈que〉")).toBe(
      "editorialBracketsAndPunctuation"
    );
    expect(categorizeNonAsciiToken("〈in〉")).toBe(
      "editorialBracketsAndPunctuation"
    );
    expect(categorizeNonAsciiToken("⟨cc⟩z")).toBe(
      "editorialBracketsAndPunctuation"
    );
    expect(categorizeNonAsciiToken("achillis–")).toBe(
      "editorialBracketsAndPunctuation"
    );
    expect(categorizeNonAsciiToken("«aliqua")).toBe(
      "editorialBracketsAndPunctuation"
    );
    expect(categorizeNonAsciiToken("centeni»")).toBe(
      "editorialBracketsAndPunctuation"
    );
    expect(categorizeNonAsciiToken("scripsit·")).toBe(
      "editorialBracketsAndPunctuation"
    );
    expect(categorizeNonAsciiToken("iam§")).toBe(
      "editorialBracketsAndPunctuation"
    );
    expect(categorizeNonAsciiToken("°")).toBe(
      "editorialBracketsAndPunctuation"
    );
    expect(categorizeNonAsciiToken("…")).toBe(
      "editorialBracketsAndPunctuation"
    );
  });

  it("categorizes corrupted source text including accented Latin typos and â— garbling", () => {
    // Cyrillic look-alikes
    expect(categorizeNonAsciiToken("\u0430c")).toBe("corrupted");
    expect(categorizeNonAsciiToken("ill\u0435")).toBe("corrupted");
    expect(categorizeNonAsciiToken("\u043c")).toBe("corrupted");
    // U+FFFD replacement character
    expect(categorizeNonAsciiToken("civit\ufffdtem")).toBe("corrupted");
    expect(categorizeNonAsciiToken("d\ufffdseis")).toBe("corrupted");
    // Accented Latin typos and SHA â— garbling
    expect(categorizeNonAsciiToken("qua\u0300a")).toBe("corrupted");
    expect(categorizeNonAsciiToken("eleu\u030asinia")).toBe("corrupted");
    expect(categorizeNonAsciiToken("ca\u0303esellio")).toBe("corrupted");
    expect(categorizeNonAsciiToken("commendata\u0302")).toBe("corrupted");
    expect(categorizeNonAsciiToken("a\u0302")).toBe("corrupted");
    expect(hasCorruptedLatinCombiningMark("qua\u0300a")).toBe(true);
    expect(hasCorruptedLatinCombiningMark("denu\u0302m")).toBe(false);
    // Mixed Greek/Latin look-alikes
    expect(categorizeNonAsciiToken("extraordi\u03bdariis")).toBe("corrupted");
    expect(categorizeNonAsciiToken("n\u03bfn")).toBe("corrupted");
    expect(categorizeNonAsciiToken("orb\u03b5s")).toBe("corrupted");
    expect(categorizeNonAsciiToken("aποφασις")).toBe("corrupted");
    expect(categorizeNonAsciiToken("σξομβρvς·")).toBe("corrupted");
    // Stray symbols
    expect(categorizeNonAsciiToken("i£")).toBe("corrupted");
    expect(categorizeNonAsciiToken("secret©")).toBe("corrupted");
    expect(categorizeNonAsciiToken("¦aemula")).toBe("corrupted");
    expect(categorizeNonAsciiToken("˜confessa")).toBe("corrupted");
  });

  it("categorizes ligatures and Roman numeral codepoints", () => {
    expect(categorizeNonAsciiToken("præterierat")).toBe(
      "ligaturesAndRomanNumerals"
    );
    expect(categorizeNonAsciiToken("cœrceas")).toBe(
      "ligaturesAndRomanNumerals"
    );
    expect(categorizeNonAsciiToken("ⅹ\u0305ⅰ\u0305ⅰ\u0305")).toBe(
      "ligaturesAndRomanNumerals"
    );
    expect(
      categorizeNonAsciiToken(
        "|ⅽ\u0305ⅹ\u0305ⅹ\u0305ⅹ\u0305ⅰ\u0305ⅰ\u0305ⅰ\u0305ⅰ\u0305|"
      )
    ).toBe("ligaturesAndRomanNumerals");
  });

  it("categorizes apostrophus numerals, infinity, and fraction marks as other", () => {
    expect(categorizeNonAsciiToken("ciↄ")).toBe("other");
    expect(categorizeNonAsciiToken("ccciↄↄↄ")).toBe("other");
    expect(categorizeNonAsciiToken("ⅰↄ")).toBe("other");
    expect(categorizeNonAsciiToken("∞")).toBe("other");
    expect(categorizeNonAsciiToken("s¯")).toBe("other");
    expect(categorizeNonAsciiToken("is÷")).toBe("other");
  });
});

describe("evaluateNonAsciiRatchet on synthetic fixtures", () => {
  const sampleWorks: CorpusInputWork[] = [
    {
      id: "work.1",
      workName: "Pseudolus",
      author: "Plautus",
      authorCode: "Plautus",
      rows: [
        "e\u0301go e\u0301go et και\u0300 abolito〈que〉 obsole[n]tior tacere[m]",
      ],
      rowIds: [["1"]],
      sectionDepth: 1,
    },
    {
      id: "work.2",
      workName: "Epitoma",
      author: "Justin",
      authorCode: "Justin",
      rows: ["civit\ufffdtem quæso ciↄ"],
      rowIds: [["1"]],
      sectionDepth: 1,
    },
  ];

  it("passes when actual counts match the ratchet exactly", () => {
    const analysis = analyzeCorpusNonAscii(sampleWorks);
    expect(analysis.intraWordBracketSplits).toBe(3);
    const ratchet = buildNonAsciiRatchet(analysis);
    const report = evaluateNonAsciiRatchet(ratchet, analysis);

    expect(report.passed).toBe(true);
    expect(report.regressions).toHaveLength(0);
    expect(report.stale).toHaveLength(0);
    expect(formatNonAsciiRatchetReport(report)).toBe("");

    const md = renderNonAsciiMarkdownReport(analysis, ratchet);
    expect(md).toContain("Pseudolus");
    expect(md).toContain("civit\ufffdtem");
  });

  it("fails on count regressions and cites offending words", () => {
    const analysis = analyzeCorpusNonAscii(sampleWorks);
    const ratchet = buildNonAsciiRatchet(analysis);
    const stricterRatchet: NonAsciiRatchet = {
      ...ratchet,
      tokenCounts: {
        ...ratchet.tokenCounts,
        corrupted: 0,
      },
      intraWordBracketSplits: 0,
    };

    const report = evaluateNonAsciiRatchet(stricterRatchet, analysis);
    expect(report.passed).toBe(false);
    expect(report.regressions).toHaveLength(2);
    const msg = formatNonAsciiRatchetReport(report);
    expect(msg).toContain("[tokenCounts] corrupted: 0 → 1");
    expect(msg).toContain("civit\ufffdtem (1)");
    expect(msg).toContain(
      "[intraWordBracketSplits] intraWordBracketSplits: 0 → 3"
    );
  });

  it("fails on stale ceilings when counts drop", () => {
    const analysis = analyzeCorpusNonAscii(sampleWorks);
    const ratchet = buildNonAsciiRatchet(analysis);
    const looserRatchet: NonAsciiRatchet = {
      ...ratchet,
      tokenCounts: {
        ...ratchet.tokenCounts,
        latinCombiningMarks: 10,
      },
      intraWordBracketSplits: 10,
    };

    const report = evaluateNonAsciiRatchet(looserRatchet, analysis);
    expect(report.passed).toBe(false);
    expect(report.stale).toHaveLength(2);
    const msg = formatNonAsciiRatchetReport(report);
    expect(msg).toContain("[tokenCounts] latinCombiningMarks: 10 → 2");
    expect(msg).toContain(
      "[intraWordBracketSplits] intraWordBracketSplits: 10 → 3"
    );
    expect(msg).toContain(
      "Run: ./morcus.sh corpus --non_ascii_report --update"
    );
  });
});

const corpusDir = path.resolve(process.cwd(), LIB_CORPUS_INPUT_DIR);
const hasCorpusInputs =
  fs.existsSync(corpusDir) &&
  fs.readdirSync(corpusDir).some((f) => f.endsWith(".json"));

(hasCorpusInputs ? describe : describe.skip)(
  "corpus non-ASCII ratchet against non_ascii_ratchet.json",
  () => {
    it("matches src/common/library/corpus/non_ascii_ratchet.json across all corpus input works", () => {
      const rawJson = fs.readFileSync(RATCHET_PATH, "utf8");
      const ratchet: NonAsciiRatchet = JSON.parse(rawJson);
      expect(ratchet.schema).toBe(NON_ASCII_RATCHET_SCHEMA_VERSION);

      const analysis = analyzeCorpusNonAscii(latinWorksFromLibrary());
      const report = evaluateNonAsciiRatchet(ratchet, analysis);
      if (!report.passed) {
        throw new Error(formatNonAsciiRatchetReport(report));
      }
      expect(report.passed).toBe(true);
      expect(serializeNonAsciiRatchet(ratchet)).toBe(rawJson);
    });
  }
);
