import {
  convertRawPhi,
  processPhiJson,
  type RawPhiJson,
} from "@/common/library/process_phi_json";
import fs from "fs";
import os from "os";
import path from "path";

function createRawPhiJson(
  text: [id: [string, string, string, string], text: string][]
): RawPhiJson {
  return {
    author: "Test Author",
    title: "Test Work",
    authorCode: "0690",
    workCode: "001",
    publishedTitle: "Test Published Title",
    editor: "Test Editor",
    publishedYear: 2000,
    text,
  };
}

describe("convertRawPhi", () => {
  describe("basic processing", () => {
    it("should process title rows correctly", () => {
      const input = createRawPhiJson([
        [["t", "1", "1", "1"], "Lorem ipsum dolor sit amet"],
      ]);

      const result = convertRawPhi(input);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0][0]).toEqual([]);
    });

    it("should process simple complete words correctly", () => {
      const input = createRawPhiJson([
        [["1", "1", "1", "1"], "Lorem ipsum dolor sit amet"],
      ]);

      const result = convertRawPhi(input);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0][0]).toEqual(["1", "1", "1"]);
      const text = result.rows[0][1].toString();
      expect(text).toContain("Lorem ipsum dolor sit amet");
    });

    it("should preserve work_id in output", () => {
      const input = createRawPhiJson([[["1", "1", "1", "1"], "test"]]);

      const result = convertRawPhi(input);

      expect(result.info.workId).toBe("phi-json-lat0690.001");
    });
  });

  describe("line recombination with incomplete words", () => {
    it("should recombine lines when word is split with hyphen", () => {
      const input = createRawPhiJson([
        [["1", "1", "1", "1"], "vener-"],
        [["1", "1", "1", "1"], "abile tempus"],
      ]);

      const result = convertRawPhi(input);

      const text = result.rows[0][1].toString();
      expect(text).toContain("venerabile tempus");
      expect(text).not.toContain("-");
    });

    it("should handle multiple hyphenated words in single passage", () => {
      const input = createRawPhiJson([
        [["2", "3", "4", "1"], "con-"],
        [["2", "3", "4", "1"], "servare et aes-"],
        [["2", "3", "4", "1"], "timabilis virtus"],
      ]);

      const result = convertRawPhi(input);

      const text = result.rows[0][1].toString();
      expect(text).toContain("conservare et aestimabilis virtus");
    });

    it("should handle recombination across sections", () => {
      const input = createRawPhiJson([
        [["2", "3", "4", "1"], "con-"],
        [["2", "3", "4", "2"], "servare. et aes-"],
        [["2", "3", "4", "2"], "timabilis virtus"],
      ]);

      const result = convertRawPhi(input);

      expect(result.rows[0][1].toString()).toContain("conservare.");
      expect(result.rows[1][1].toString()).toContain("et aestimabilis virtus");
    });

    it("should preserve incomplete words at end of lines without hyphens", () => {
      const input = createRawPhiJson([
        [["1", "1", "1", "1"], "word"],
        [["1", "1", "1", "1"], "next"],
      ]);

      const result = convertRawPhi(input);

      const text = result.rows[0][1].toString();
      expect(text).toMatch(/word\s+next/);
    });

    it("should handle mixed content with hyphens and normal line breaks", () => {
      const input = createRawPhiJson([
        [["1", "1", "1", "t"], "first line"],
        [["1", "1", "1", "t"], "second-"],
        [["1", "1", "1", "t"], "third line"],
      ]);

      const result = convertRawPhi(input);

      const text = result.rows[0][1].toString();
      expect(text).toContain("first line secondthird line");
    });

    it("should handle hyphen at end without following content", () => {
      const input = createRawPhiJson([[["1", "1", "1", "t"], "word-"]]);

      const result = convertRawPhi(input);

      expect(result.rows.length).toBeGreaterThanOrEqual(0);
      if (result.rows.length > 0) {
        expect(result.rows[0][1].toString()).toContain("word");
      }
    });

    it("should handle multiple passages with mixed line breaks", () => {
      const input = createRawPhiJson([
        [["1", "1", "1", "1"], "first-"],
        [["1", "1", "1", "1"], "passage"],
        [["1", "1", "2", "1"], "second-"],
        [["1", "1", "2", "1"], "passage"],
        [["1", "1", "3", "1"], "third passage"],
      ]);

      const result = convertRawPhi(input);

      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      const allText = result.rows.map((r) => r[1].toString());

      expect(allText[0]).toContain("firstpassage");
      expect(allText[1]).toContain("secondpassage");
      expect(allText[2]).toContain("third passage");
    });
  });
});

describe("processPhiJson", () => {
  let tempDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    // Create a temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "phi-json-test-"));
    originalEnv = process.env.PHI_JSON_ROOT;
    process.env.PHI_JSON_ROOT = tempDir;
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    // Restore original environment variable
    if (originalEnv !== undefined) {
      process.env.PHI_JSON_ROOT = originalEnv;
    } else {
      delete process.env.PHI_JSON_ROOT;
    }
  });

  it("should process multiple JSON files", () => {
    const work1 = createRawPhiJson([[["1", "1", "1", "1"], "Prima opera"]]);
    const work2 = {
      ...createRawPhiJson([[["1", "1", "1", "1"], "Secunda opera"]]),
      authorCode: "0691",
      workCode: "002",
    };

    fs.writeFileSync(path.join(tempDir, "work1.json"), JSON.stringify(work1));
    fs.writeFileSync(path.join(tempDir, "work2.json"), JSON.stringify(work2));

    const results = processPhiJson();

    expect(results).toHaveLength(2);
    expect(results[0].info.workId).toBe("phi-json-lat0690.001");
    expect(results[1].info.workId).toBe("phi-json-lat0691.002");
  });

  it("should ignore non-JSON files", () => {
    const testData = createRawPhiJson([[["1", "1", "1", "1"], "Valid work"]]);

    fs.writeFileSync(
      path.join(tempDir, "valid.json"),
      JSON.stringify(testData)
    );
    fs.writeFileSync(path.join(tempDir, "readme.txt"), "Not a JSON file");
    fs.writeFileSync(path.join(tempDir, "data.xml"), "<xml>Not JSON</xml>");

    const results = processPhiJson();

    expect(results).toHaveLength(1);
    expect(results[0].rows[0][1].toString()).toContain("Valid work");
  });

  it("should handle empty directory", () => {
    expect(processPhiJson()).toHaveLength(0);
  });
});
