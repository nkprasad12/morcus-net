import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as zlib from "zlib";
import * as crypto from "crypto";
import {
  CRITICAL_JS_FILE,
  V2_BUNDLE_BUDGET,
  checkV2BundleBudget,
  checkV2ChunkDuplication,
  formatV2BundleSizeReport,
  sumRouteSizes,
  type V2BundleBudget,
} from "@/bundler/client_bundle_budget";
import {
  V2_CHUNK_ENTRIES,
  V2_JS_CHUNKS,
  V2_ROUTES,
  type V2AssetManifest,
} from "@/bundler/client_build_contract";

describe("UI V2 Bundle Budget", () => {
  let tmpDir: string;

  const criticalContent = "(()=>{try{}catch{}})();";

  function writeAllChunks(
    content: string = "console.log('test');"
  ): V2AssetManifest {
    const manifest: Record<string, string> = {
      "app.css": "app.css",
    };
    for (const chunkName of V2_JS_CHUNKS) {
      fs.writeFileSync(path.join(tmpDir, chunkName), content);
      manifest[chunkName] = chunkName;
    }
    fs.writeFileSync(path.join(tmpDir, "app.css"), "body { margin: 0; }");
    return manifest;
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "budget-test-"));
    fs.writeFileSync(path.join(tmpDir, CRITICAL_JS_FILE), criticalContent);
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("passes when all chunks and CSS are within budget", () => {
    const jsContent = "console.log('test');";
    const cssContent = "body { margin: 0; }";

    const manifest: V2AssetManifest = {
      "app.css": "app.67890.css",
    };
    for (const chunkName of V2_JS_CHUNKS) {
      const hashed = chunkName.replace(".js", ".12345.js");
      fs.writeFileSync(path.join(tmpDir, hashed), jsContent);
      manifest[chunkName] = hashed;
    }
    fs.writeFileSync(path.join(tmpDir, "app.67890.css"), cssContent);

    const report = checkV2BundleBudget(tmpDir, manifest, V2_BUNDLE_BUDGET);

    expect(report.exceeded).toBe(false);
    expect(report.errors).toHaveLength(0);
    for (const chunkName of V2_JS_CHUNKS) {
      expect(report.chunks[chunkName]).toBeDefined();
    }
    expect(report.css).toBeDefined();
    expect(report.totalJsRawBytes).toBe(
      Buffer.byteLength(jsContent) * V2_JS_CHUNKS.length
    );
    expect(report.totalJsGzipBytes).toBe(
      zlib.gzipSync(jsContent).byteLength * V2_JS_CHUNKS.length
    );
  });

  test("sums each route's chunks in its per-route total", () => {
    const manifest = writeAllChunks("x".repeat(100));
    fs.writeFileSync(path.join(tmpDir, "reader.js"), "x".repeat(300));
    fs.writeFileSync(path.join(tmpDir, "external.js"), "x".repeat(50));

    const report = checkV2BundleBudget(tmpDir, manifest);

    expect(report.routes.about?.rawBytes).toBe(100);
    expect(report.routes.dicts?.rawBytes).toBe(200);
    expect(report.routes.library?.rawBytes).toBe(400);
    // external = common + reader + external.
    expect(report.routes.external?.rawBytes).toBe(450);
    expect(sumRouteSizes("external", report.chunks)).toEqual(
      report.routes.external
    );
  });

  test("fails a route whose total exceeds its budget though every chunk passes", () => {
    const manifest = writeAllChunks("x".repeat(100));

    const tightBudget: V2BundleBudget = {
      ...V2_BUNDLE_BUDGET,
      routes: {
        ...V2_BUNDLE_BUDGET.routes,
        // common (100) + dict (100) = 200 > 150, while each chunk is < 55 kB.
        dicts: { maxRawBytes: 150, maxGzipBytes: 10 * 1024 },
      },
    };

    const report = checkV2BundleBudget(tmpDir, manifest, tightBudget);

    expect(report.errors).toEqual([
      "Route 'dicts' (common.js + dict.js) raw total 200 B exceeds budget 150 B",
    ]);
  });

  test("route budgets are no looser than the sum of their chunk ceilings", () => {
    for (const route of V2_ROUTES) {
      const summedCeilings = sumRouteSizes(
        route,
        Object.fromEntries(
          V2_JS_CHUNKS.map((c) => [
            c,
            {
              rawBytes: V2_BUNDLE_BUDGET.chunks[c].maxRawBytes,
              gzipBytes: V2_BUNDLE_BUDGET.chunks[c].maxGzipBytes,
            },
          ])
        )
      )!;
      const routeBudget = V2_BUNDLE_BUDGET.routes[route];
      expect(routeBudget.maxRawBytes).toBeLessThanOrEqual(
        summedCeilings.rawBytes
      );
      expect(routeBudget.maxGzipBytes).toBeLessThanOrEqual(
        summedCeilings.gzipBytes
      );
    }
  });

  test("fails when a JS chunk raw size exceeds its per-chunk budget", () => {
    const manifest = writeAllChunks("x".repeat(20));
    fs.writeFileSync(path.join(tmpDir, "dict.js"), "x".repeat(100));

    const tightBudget: V2BundleBudget = {
      ...V2_BUNDLE_BUDGET,
      chunks: {
        ...V2_BUNDLE_BUDGET.chunks,
        "dict.js": {
          maxRawBytes: 50,
          maxGzipBytes: 10 * 1024,
        },
      },
    };

    const report = checkV2BundleBudget(tmpDir, manifest, tightBudget);

    expect(report.exceeded).toBe(true);
    expect(
      report.errors.some(
        (e) => e.includes("dict.js raw size") && e.includes("exceeds budget")
      )
    ).toBe(true);
  });

  test("fails when a JS chunk gzip size exceeds its per-chunk budget", () => {
    const manifest = writeAllChunks("x".repeat(20));
    const random = crypto.randomBytes(300).toString("base64");
    fs.writeFileSync(path.join(tmpDir, "corpus.js"), random);

    const tightBudget: V2BundleBudget = {
      ...V2_BUNDLE_BUDGET,
      chunks: {
        ...V2_BUNDLE_BUDGET.chunks,
        "corpus.js": {
          maxRawBytes: 20 * 1024,
          maxGzipBytes: 100,
        },
      },
    };

    const report = checkV2BundleBudget(tmpDir, manifest, tightBudget);

    expect(report.exceeded).toBe(true);
    expect(
      report.errors.some(
        (e) => e.includes("corpus.js gzip size") && e.includes("exceeds budget")
      )
    ).toBe(true);
  });

  test("fails when CSS gzip size exceeds budget, but allows large raw CSS when gzip is within budget", () => {
    const manifest = writeAllChunks("console.log(1);");
    // 200 kB of repetitive CSS compresses to well under 25 kB gzip.
    const largeCompressibleCss = ".cls { color: red; }\n".repeat(10_000);
    fs.writeFileSync(path.join(tmpDir, "app.css"), largeCompressibleCss);

    const passReport = checkV2BundleBudget(tmpDir, manifest, V2_BUNDLE_BUDGET);
    expect(passReport.exceeded).toBe(false);
    expect(passReport.css?.rawBytes).toBeGreaterThan(150 * 1024);

    const tightBudget: V2BundleBudget = {
      ...V2_BUNDLE_BUDGET,
      maxCssGzipBytes: 10,
    };

    const report = checkV2BundleBudget(tmpDir, manifest, tightBudget);

    expect(report.exceeded).toBe(true);
    expect(
      report.errors.some(
        (e) => e.includes("CSS gzip size") && e.includes("exceeds budget")
      )
    ).toBe(true);
  });

  test("flags missing files and manifest entries", () => {
    const reportMissingManifest = checkV2BundleBudget(tmpDir, {});
    expect(reportMissingManifest.exceeded).toBe(true);
    for (const chunkName of V2_JS_CHUNKS) {
      expect(
        reportMissingManifest.errors.some((e) =>
          e.includes(`Manifest missing '${chunkName}'`)
        )
      ).toBe(true);
    }
    expect(
      reportMissingManifest.errors.some((e) =>
        e.includes("Manifest missing 'app.css'")
      )
    ).toBe(true);

    fs.rmSync(path.join(tmpDir, CRITICAL_JS_FILE));
    const reportMissingFiles = checkV2BundleBudget(tmpDir, {
      "common.js": "nonexistent-common.js",
      "reader.js": "nonexistent-reader.js",
      "dict.js": "nonexistent-dict.js",
      "corpus.js": "nonexistent-corpus.js",
      "external.js": "nonexistent-external.js",
      "app.css": "nonexistent.css",
    });
    expect(reportMissingFiles.exceeded).toBe(true);
    expect(
      reportMissingFiles.errors.some((e) =>
        e.includes("common.js asset not found on disk")
      )
    ).toBe(true);
    expect(
      reportMissingFiles.errors.some((e) =>
        e.includes("CSS asset not found on disk")
      )
    ).toBe(true);
    expect(
      reportMissingFiles.errors.some((e) =>
        e.includes("Critical JS asset not found on disk")
      )
    ).toBe(true);
  });

  describe("critical.js", () => {
    let manifest: V2AssetManifest;

    beforeEach(() => {
      manifest = writeAllChunks("console.log(1);");
    });

    test("is measured but not counted in the fetched JS chunk totals", () => {
      const report = checkV2BundleBudget(tmpDir, manifest);
      expect(report.errors).toEqual([]);
      expect(report.criticalJs?.rawBytes).toBe(
        Buffer.byteLength(criticalContent)
      );
      expect(report.totalJsRawBytes).toBe(
        Buffer.byteLength("console.log(1);") * V2_JS_CHUNKS.length
      );
    });

    test("fails when its raw size exceeds the ceiling, reported in bytes", () => {
      fs.writeFileSync(
        path.join(tmpDir, CRITICAL_JS_FILE),
        "x".repeat(V2_BUNDLE_BUDGET.maxCriticalJsRawBytes + 1)
      );
      const report = checkV2BundleBudget(tmpDir, manifest);
      expect(report.exceeded).toBe(true);
      expect(report.errors).toContain(
        `Critical JS raw size ${
          V2_BUNDLE_BUDGET.maxCriticalJsRawBytes + 1
        } B exceeds budget ${V2_BUNDLE_BUDGET.maxCriticalJsRawBytes} B`
      );
    });

    test("fails when its gzip size exceeds the ceiling", () => {
      const random = crypto.randomBytes(300).toString("base64");
      fs.writeFileSync(path.join(tmpDir, CRITICAL_JS_FILE), random);
      const report = checkV2BundleBudget(tmpDir, manifest, {
        ...V2_BUNDLE_BUDGET,
        maxCriticalJsRawBytes: 10_000,
        maxCriticalJsGzipBytes: 100,
      });
      expect(
        report.errors.some((e) => e.startsWith("Critical JS gzip size"))
      ).toBe(true);
    });

    test("ceilings stay at a fixed-size applier, not per-preference logic", () => {
      expect(V2_BUNDLE_BUDGET.maxCriticalJsRawBytes).toBeLessThanOrEqual(450);
      expect(V2_BUNDLE_BUDGET.maxCriticalJsGzipBytes).toBeLessThanOrEqual(350);
    });

    test("appears in the formatted report", () => {
      const formatted = formatV2BundleSizeReport(
        checkV2BundleBudget(tmpDir, manifest)
      );
      expect(formatted).toContain(
        `${Buffer.byteLength(criticalContent)} B raw`
      );
      expect(formatted).toContain(
        `<= ${V2_BUNDLE_BUDGET.maxCriticalJsRawBytes} B raw`
      );
    });
  });

  test("formats human-readable budget report with every chunk", () => {
    const manifest = writeAllChunks("console.log('test');");
    const report = checkV2BundleBudget(tmpDir, manifest);

    const formatted = formatV2BundleSizeReport(report);
    expect(formatted).toContain("UI V2 Bundle Budget (Minified):");
    for (const chunkName of V2_JS_CHUNKS) {
      expect(formatted).toContain(`${chunkName}:`);
      const cb = V2_BUNDLE_BUDGET.chunks[chunkName];
      const kb = (bytes: number) => (bytes / 1024).toFixed(1);
      expect(formatted).toContain(
        `< ${kb(cb.maxRawBytes)} kB raw / < ${kb(cb.maxGzipBytes)} kB gzip`
      );
    }
    expect(formatted).toContain("Per-route JS:");
    for (const route of V2_ROUTES) {
      expect(formatted).toContain(`${route}:`);
    }
    expect(formatted).toContain("CSS:");
    expect(formatted).toContain(
      `(budget: < ${(V2_BUNDLE_BUDGET.maxCssGzipBytes / 1024).toFixed(
        1
      )} kB gzip)`
    );
  });

  describe("checkV2ChunkDuplication", () => {
    test("passes when every chunk is present and modules are disjoint", () => {
      const result = checkV2ChunkDuplication({
        chunks: [
          {
            names: ["common"],
            modules: [
              { nameForCondition: "/repo/src/web/ui/core/dom/dom.client.ts" },
              { name: "webpack/runtime/chunk loaded", moduleType: "runtime" },
            ],
          },
          {
            names: ["dict"],
            modules: [
              {
                name: "./src/web/ui/dict/dict_entry.client.ts + 2 modules",
                modules: [
                  {
                    nameForCondition:
                      "/repo/src/web/ui/dict/search/dict_search.client.ts",
                  },
                ],
              },
            ],
          },
          {
            names: ["reader"],
            modules: [
              {
                nameForCondition:
                  "/repo/src/web/ui/reader/reader_view.client.ts",
              },
            ],
          },
          {
            names: ["corpus"],
            modules: [
              {
                nameForCondition:
                  "/repo/src/web/ui/corpus/corpus_view.client.ts",
              },
            ],
          },
          {
            names: ["external"],
            modules: [
              {
                nameForCondition:
                  "/repo/src/web/ui/external/external_loader.client.ts",
              },
            ],
          },
          {
            names: ["macronizer"],
            modules: [
              {
                nameForCondition:
                  "/repo/src/web/ui/macronizer/macronizer_view.client.ts",
              },
            ],
          },
        ],
      });

      expect(result.errors).toEqual([]);
      expect(result.chunkModules.dict).toEqual([
        "/repo/src/web/ui/dict/search/dict_search.client.ts",
      ]);
    });

    test("fails when a source module appears in more than one chunk", () => {
      const result = checkV2ChunkDuplication({
        chunks: [
          {
            names: ["common"],
            modules: [
              { nameForCondition: "/repo/src/web/ui/core/dom/dom.client.ts" },
            ],
          },
          {
            names: ["dict"],
            modules: [
              { nameForCondition: "/repo/src/common/shared_helper.ts" },
            ],
          },
          {
            names: ["reader"],
            modules: [
              { nameForCondition: "/repo/src/common/shared_helper.ts" },
            ],
          },
          {
            names: ["corpus"],
            modules: [
              {
                nameForCondition:
                  "/repo/src/web/ui/corpus/corpus_view.client.ts",
              },
            ],
          },
          {
            names: ["external"],
            modules: [
              {
                nameForCondition:
                  "/repo/src/web/ui/external/external_loader.client.ts",
              },
            ],
          },
          {
            names: ["macronizer"],
            modules: [
              {
                nameForCondition:
                  "/repo/src/web/ui/macronizer/macronizer_view.client.ts",
              },
            ],
          },
        ],
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain(
        "Module '/repo/src/common/shared_helper.ts' is duplicated across chunks [dict, reader]"
      );
      // dict and reader both depend only on common, so that's where it goes.
      expect(result.errors[0]).toContain(
        "Add it to `V2_CHUNK_ENTRIES.common.shared` in src/bundler/client_build_contract.ts"
      );
      expect(result.errors[0]).toContain(
        "An `import` from './src/web/ui/shell/common_entry.client.ts' is not enough"
      );
      expect(result.errors[0]).toContain("module of common.js and ships once");
    });

    test("points a reader/external duplicate at reader_entry", () => {
      const result = checkV2ChunkDuplication({
        chunks: [
          {
            names: ["common"],
            modules: [{ nameForCondition: "/repo/src/a.ts" }],
          },
          {
            names: ["dict"],
            modules: [{ nameForCondition: "/repo/src/b.ts" }],
          },
          {
            names: ["reader"],
            modules: [{ nameForCondition: "/repo/src/x.ts" }],
          },
          {
            names: ["corpus"],
            modules: [{ nameForCondition: "/repo/src/c.ts" }],
          },
          {
            names: ["external"],
            modules: [{ nameForCondition: "/repo/src/x.ts" }],
          },
          {
            names: ["macronizer"],
            modules: [{ nameForCondition: "/repo/src/d.ts" }],
          },
        ],
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain(
        "Add it to `V2_CHUNK_ENTRIES.reader.shared`"
      );
      expect(result.errors[0]).toContain("module of reader.js");
    });
  });

  describe("V2_CHUNK_ENTRIES shared modules", () => {
    test("every shared module exists and isn't an entry of its own", () => {
      const entryImports = new Set(
        Object.values(V2_CHUNK_ENTRIES).map((spec) => spec.import)
      );
      for (const spec of Object.values(V2_CHUNK_ENTRIES)) {
        for (const shared of spec.shared ?? []) {
          expect(fs.existsSync(path.resolve(process.cwd(), shared))).toBe(true);
          expect(entryImports.has(shared)).toBe(false);
        }
      }
    });
  });
});
