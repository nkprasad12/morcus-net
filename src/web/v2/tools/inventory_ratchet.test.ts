import * as fs from "fs";
import * as path from "path";
import {
  analyzeRepoInventory,
  type InventoryAnalysis,
} from "@/web/v2/tools/inventory_analyzer";
import {
  DEFAULT_RATCHET_PATH,
  buildRatchetFromAnalysis,
  compareInventoryRatchet,
  formatRatchetFailures,
  parseInventoryRatchet,
  readInventoryRatchet,
  serializeInventoryRatchet,
  type InventoryRatchet,
} from "@/web/v2/tools/inventory_ratchet";
import { renderInventoryReportMarkdown } from "@/web/v2/tools/inventory_reporter";

describe("inventory_ratchet unit tests", () => {
  const baseAnalysis: InventoryAnalysis = {
    cssDuplicates: [
      {
        id: "aaaa1111",
        fullKey: "##color:red;display:flex;gap:4px",
        contextKey: "",
        declarationKey: "color:red;display:flex;gap:4px",
        declCount: 3,
        declarations: ["color:red", "display:flex", "gap:4px"],
        files: ["src/web/v2/a.css", "src/web/v2/b.css"],
        occurrences: [
          { file: "src/web/v2/a.css", line: 10, selector: ".a" },
          { file: "src/web/v2/b.css", line: 20, selector: ".b" },
        ],
      },
    ],
    domMutationOutsideCore: {
      callsPerFile: {
        "src/web/v2/dict/dict_search.client.ts": 2,
      },
      citations: [
        {
          file: "src/web/v2/dict/dict_search.client.ts",
          line: 12,
          method: "createElement",
          snippet: 'document.createElement("div")',
        },
        {
          file: "src/web/v2/dict/dict_search.client.ts",
          line: 13,
          method: "appendChild",
          snippet: "host.appendChild(el)",
        },
      ],
      totalCalls: 2,
    },
    selectorCalls: {
      callsPerFile: {
        "src/web/v2/reader/reader_view.client.ts": 3,
      },
      citations: [
        {
          file: "src/web/v2/reader/reader_view.client.ts",
          line: 30,
          method: "$",
          snippet: 'this.scope.$(".btn")',
        },
        {
          file: "src/web/v2/reader/reader_view.client.ts",
          line: 31,
          method: "querySelector",
          snippet: 'this.querySelector(".panel")',
        },
        {
          file: "src/web/v2/reader/reader_view.client.ts",
          line: 32,
          method: "delegate",
          snippet: 'this.scope.delegate(this, "click", ".item", fn)',
        },
      ],
      totalCalls: 3,
    },
  };

  it("passes when actual metrics match the ratchet exactly", () => {
    const ratchet = buildRatchetFromAnalysis(baseAnalysis);
    const result = compareInventoryRatchet(ratchet, baseAnalysis);

    expect(result.passed).toBe(true);
    expect(result.regressions).toHaveLength(0);
    expect(result.stale).toHaveLength(0);
    expect(formatRatchetFailures(result)).toBe("");
  });

  it("fails on swapped CSS duplicate patterns even when the pattern count is unchanged", () => {
    const ratchet = buildRatchetFromAnalysis(baseAnalysis);
    const swappedAnalysis: InventoryAnalysis = {
      ...baseAnalysis,
      cssDuplicates: [
        {
          id: "bbbb2222",
          fullKey: "##margin:0;padding:0;width:100%",
          contextKey: "",
          declarationKey: "margin:0;padding:0;width:100%",
          declCount: 3,
          declarations: ["margin:0", "padding:0", "width:100%"],
          files: ["src/web/v2/c.css", "src/web/v2/d.css"],
          occurrences: [
            { file: "src/web/v2/c.css", line: 5, selector: ".c" },
            { file: "src/web/v2/d.css", line: 8, selector: ".d" },
          ],
        },
      ],
    };

    const result = compareInventoryRatchet(ratchet, swappedAnalysis);
    expect(result.passed).toBe(false);
    expect(result.regressions).toHaveLength(1);
    expect(result.regressions[0].target).toBe("bbbb2222");
    expect(result.stale).toHaveLength(1);
    expect(result.stale[0].target).toBe("aaaa1111");

    const message = formatRatchetFailures(result);
    expect(message).toContain("bbbb2222");
    expect(message).toContain("src/web/v2/c.css:5 (.c)");
    expect(message).toContain("aaaa1111");
    expect(message).toMatch(/Run: npm run inventory:update$/);
  });

  it("fails when an existing CSS pattern gains or drops a file", () => {
    const ratchet = buildRatchetFromAnalysis(baseAnalysis);

    const gainedFileAnalysis: InventoryAnalysis = {
      ...baseAnalysis,
      cssDuplicates: [
        {
          ...baseAnalysis.cssDuplicates[0],
          files: [
            "src/web/v2/a.css",
            "src/web/v2/b.css",
            "src/web/v2/extra.css",
          ],
          occurrences: [
            ...baseAnalysis.cssDuplicates[0].occurrences,
            { file: "src/web/v2/extra.css", line: 14, selector: ".extra" },
          ],
        },
      ],
    };
    const gainedResult = compareInventoryRatchet(ratchet, gainedFileAnalysis);
    expect(gainedResult.passed).toBe(false);
    expect(gainedResult.regressions).toHaveLength(1);
    expect(formatRatchetFailures(gainedResult)).toContain(
      "src/web/v2/extra.css:14 (.extra)"
    );

    const droppedFileRatchet: InventoryRatchet = {
      ...ratchet,
      cssDuplicates: {
        ...ratchet.cssDuplicates,
        patterns: {
          aaaa1111: [
            "src/web/v2/a.css",
            "src/web/v2/b.css",
            "src/web/v2/old.css",
          ],
        },
      },
    };
    const droppedResult = compareInventoryRatchet(
      droppedFileRatchet,
      baseAnalysis
    );
    expect(droppedResult.passed).toBe(false);
    expect(droppedResult.stale).toHaveLength(1);
    expect(formatRatchetFailures(droppedResult)).toMatch(
      /Run: npm run inventory:update$/
    );
  });

  it("fails on new files (regression) and removed files or decreased counts (stale)", () => {
    const ratchet = buildRatchetFromAnalysis(baseAnalysis);

    const newFileAnalysis: InventoryAnalysis = {
      ...baseAnalysis,
      domMutationOutsideCore: {
        callsPerFile: {
          "src/web/v2/dict/dict_search.client.ts": 2,
          "src/web/v2/shell/new_widget.client.ts": 1,
        },
        citations: [
          ...baseAnalysis.domMutationOutsideCore.citations,
          {
            file: "src/web/v2/shell/new_widget.client.ts",
            line: 42,
            method: "createElement",
            snippet: 'document.createElement("span")',
          },
        ],
        totalCalls: 3,
      },
    };

    const regResult = compareInventoryRatchet(ratchet, newFileAnalysis);
    expect(regResult.passed).toBe(false);
    expect(regResult.regressions).toHaveLength(1);
    const regMsg = formatRatchetFailures(regResult);
    expect(regMsg).toContain(
      "[domMutationOutsideCore] src/web/v2/shell/new_widget.client.ts: 0 → 1"
    );
    expect(regMsg).toContain(
      'src/web/v2/shell/new_widget.client.ts:42 [createElement] document.createElement("span")'
    );

    const removedFileAnalysis: InventoryAnalysis = {
      ...baseAnalysis,
      selectorCalls: {
        callsPerFile: {},
        citations: [],
        totalCalls: 0,
      },
    };

    const staleResult = compareInventoryRatchet(ratchet, removedFileAnalysis);
    expect(staleResult.passed).toBe(false);
    expect(staleResult.stale).toHaveLength(1);
    const staleMsg = formatRatchetFailures(staleResult);
    expect(staleMsg).toContain(
      "[selectorCalls] src/web/v2/reader/reader_view.client.ts: 3 → 0"
    );
    expect(staleMsg).toMatch(/Run: npm run inventory:update$/);
  });

  it("excludes allowlisted CSS patterns from comparison and preserves them on build/serialize", () => {
    const allowlist = {
      aaaa1111: {
        files: ["src/web/v2/b.css", "src/web/v2/a.css"],
        reason: "Intentional critical CSS duplication",
      },
    };
    const ratchet = buildRatchetFromAnalysis(baseAnalysis, allowlist);
    expect(ratchet.cssDuplicates.patterns).toEqual({});
    expect(ratchet.cssDuplicates.allowlist.aaaa1111.files).toEqual([
      "src/web/v2/a.css",
      "src/web/v2/b.css",
    ]);

    const comparison = compareInventoryRatchet(ratchet, baseAnalysis);
    expect(comparison.passed).toBe(true);

    const serialized = serializeInventoryRatchet(ratchet);
    expect(serialized.endsWith("\n")).toBe(true);
    const parsed = parseInventoryRatchet(serialized);
    expect(parsed).toEqual(ratchet);

    const report = renderInventoryReportMarkdown(
      ratchet,
      baseAnalysis,
      comparison
    );
    expect(report).toContain("Intentional critical CSS duplication");
  });
});

describe("UI V2 repository inventory ratchet", () => {
  it("matches src/web/v2/inventory_ratchet.json exactly", () => {
    const repoRoot = process.cwd();
    const ratchetPath = path.resolve(repoRoot, DEFAULT_RATCHET_PATH);
    const rawJson = fs.readFileSync(ratchetPath, "utf8");
    const ratchet = readInventoryRatchet(repoRoot);
    const analysis = analyzeRepoInventory(repoRoot);
    const comparison = compareInventoryRatchet(ratchet, analysis);

    if (!comparison.passed) {
      throw new Error(formatRatchetFailures(comparison));
    }
    expect(comparison.passed).toBe(true);
    expect(serializeInventoryRatchet(ratchet)).toBe(rawJson);
  });
});
