import {
  processWordPart,
  fixGreekWords,
} from "@/common/dictionaries/pozo/pozo_fixes";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

console.log = jest.fn();

describe("processWordPart", () => {
  test("should return whitespace as is", () => {
    expect(processWordPart("   ")).toBe("   ");
    expect(processWordPart("\t\n")).toBe("\t\n");
  });

  test("should handle empty string part", () => {
    expect(processWordPart("")).toBe("");
  });

  test("should handle part consisting only of punctuation", () => {
    expect(processWordPart(",.")).toBe(",.");
    expect(processWordPart("!")).toBe("!");
  });

  // Greek word tests
  test("should convert Latin vowels in a predominantly Greek word", () => {
    expect(processWordPart("λόγoς")).toBe("λόγος"); // o -> ο
  });

  test("should convert Latin v to Greek ν in high-score Greek word", () => {
    expect(processWordPart("ἄvθρωπος")).toBe("ἄνθρωπος"); // score > 0.65
  });

  test("should handle polytonic Greek characters correctly", () => {
    expect(processWordPart("ἄνθρωπος")).toBe("ἄνθρωπος"); // Already Greek
    expect(processWordPart("ἀγαθóς")).toBe("ἀγαθός"); // Latin o with acute -> Greek ο with tonos
  });

  // Latin word tests
  test("should convert Greek ν to Latin v in a predominantly Latin word", () => {
    expect(processWordPart("serνus")).toBe("servus");
  });

  test("should handle already correct Latin word", () => {
    expect(processWordPart("servus")).toBe("servus");
  });

  // Unclassifiable tests
  test("should not change unclassifiable two-letter mixed words", () => {
    expect(processWordPart("aν")).toBe("aν"); // Latin a, Greek nu
    expect(processWordPart("αv")).toBe("αv"); // Greek alpha, Latin v
  });

  // Punctuation tests
  test("should preserve leading and trailing punctuation", () => {
    expect(processWordPart(",λόγoς.")).toBe(",λόγος.");
    expect(processWordPart("(serνus)")).toBe("(servus)");
  });

  test("should correctly process word with only leading punctuation and then word", () => {
    expect(processWordPart("-λόγoς")).toBe("-λόγος");
  });

  test("should correctly process word with only trailing punctuation", () => {
    expect(processWordPart("λόγoς!")).toBe("λόγος!");
  });

  test("should handle Latin character with acute accent in Greek word", () => {
    // á (U+00E1) -> NFD: a + U+0301. classifyWord: acute + Greek char -> Greek, score 1.
    // applyCharacterModifications: a -> α. Result: α + U+0301 -> NFC: ά
    expect(processWordPart("μάντις")).toBe("μάντις"); // Already correct
    expect(processWordPart("μáντις")).toBe("μάντις"); // Latin a with acute
  });

  test("should correctly handle complex case with punctuation and mixed chars", () => {
    // NOTE - written out, some fonts (like the VS Code default) don't render the
    // circumflex over the i correctly.
    const expected = ["λ", "α", "χ", "v", "α", "ι", "̂", "ο", "ς"].join("");
    expect(processWordPart("(λαχvαîoς,)")).toBe(`(${expected},)`);
  });

  test("should not change purely numeric or symbolic parts not matching punctuation regexes initially", () => {
    expect(processWordPart("123")).toBe("123");
    expect(processWordPart("$%*")).toBe("$%*"); //These are not stripped by \p{P} or \p{S}
  });
});

describe("fixGreekWords", () => {
  let tempFilePath: string;
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory and file
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pozo-fix-test-"));
    tempFilePath = path.join(tempDir, "test_pozo_data.txt");
  });

  afterEach(() => {
    // Clean up the temporary file and directory
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir);
    }
  });

  it("should correctly process mixed Greek and Latin words and apply character modifications", () => {
    const inputFileContent = `
zurriago
*ZURRIAGO* ρυτηρ, ηρος, ò; σκυτάλη, ης, η scνtica, flagellum

zurrón
*ZURRÓN* γρυµαία, ας, η perae genus
`;

    fs.writeFileSync(tempFilePath, inputFileContent, "utf8");

    fixGreekWords(tempFilePath);

    const outputFileContent = fs.readFileSync(tempFilePath, "utf8");

    const expectedOutput = `
zurriago
*ZURRIAGO* ρυτηρ, ηρος, ò; σκυτάλη, ης, η scvtica, flagellum

zurrón
*ZURRÓN* γρυµαία, ας, η perae genus
`;

    expect(outputFileContent).toBe(expectedOutput);
  });
});
