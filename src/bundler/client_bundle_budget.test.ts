import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as zlib from "zlib";
import * as crypto from "crypto";
import {
  CRITICAL_CSS_FILE,
  CRITICAL_JS_FILE,
  V2_BUNDLE_BUDGET,
  checkV2BundleBudget,
  checkV2ChunkDuplication,
  formatV2BundleSizeReport,
  sumRouteSizes,
  type V2BundleBudget,
} from "@/bundler/client_bundle_budget";
import {
  DYNAMIC_BROTLI_QUALITY,
  STATIC_BROTLI_QUALITY,
  V2_CHUNK_ENTRIES,
  V2_JS_CHUNKS,
  V2_ROUTES,
  type V2AssetManifest,
} from "@/bundler/client_build_contract";

function brotliSize(
  content: string | Buffer,
  quality: number = STATIC_BROTLI_QUALITY
): number {
  return zlib.brotliCompressSync(content, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: quality },
  }).byteLength;
}

describe("UI V2 Bundle Budget", () => {
  let tmpDir: string;

  const criticalContent = "(()=>{try{}catch{}})();";
  const criticalCssContent = "*{box-sizing:border-box}";

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
    fs.writeFileSync(path.join(tmpDir, CRITICAL_CSS_FILE), criticalCssContent);
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
    expect(report.totalJsBrotliBytes).toBe(
      brotliSize(jsContent) * V2_JS_CHUNKS.length
    );
  });

  test("uses precompressed .br sibling size when present on disk", () => {
    const manifest = writeAllChunks("console.log('test');");
    const precompressed = zlib.brotliCompressSync("console.log('test');", {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: STATIC_BROTLI_QUALITY },
    });
    // Write a .br sibling with a distinct byte length to prove it is read from disk
    const paddedBr = Buffer.concat([precompressed, Buffer.from("extra")]);
    fs.writeFileSync(path.join(tmpDir, "common.js.br"), paddedBr);

    const report = checkV2BundleBudget(tmpDir, manifest);
    expect(report.chunks["common.js"]?.brotliBytes).toBe(paddedBr.byteLength);
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
    const singleBrotli = brotliSize("x".repeat(100));

    const tightBudget: V2BundleBudget = {
      ...V2_BUNDLE_BUDGET,
      routes: {
        ...V2_BUNDLE_BUDGET.routes,
        // common + dict = 2 * singleBrotli > singleBrotli + 5, while each chunk is within its own budget.
        dicts: { maxBrotliBytes: singleBrotli + 5 },
      },
    };

    const report = checkV2BundleBudget(tmpDir, manifest, tightBudget);

    expect(report.errors).toEqual([
      `Route 'dicts' (common.js + dict.js) brotli total ${
        2 * singleBrotli
      } B exceeds budget ${singleBrotli + 5} B`,
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
              rawBytes: 0,
              brotliBytes: V2_BUNDLE_BUDGET.chunks[c].maxBrotliBytes,
            },
          ])
        )
      )!;
      const routeBudget = V2_BUNDLE_BUDGET.routes[route];
      expect(routeBudget.maxBrotliBytes).toBeLessThanOrEqual(
        summedCeilings.brotliBytes
      );
    }
  });

  test("fails when a JS chunk brotli size exceeds its per-chunk budget", () => {
    const manifest = writeAllChunks("x".repeat(20));
    const random = crypto.randomBytes(300).toString("base64");
    fs.writeFileSync(path.join(tmpDir, "corpus.js"), random);

    const tightBudget: V2BundleBudget = {
      ...V2_BUNDLE_BUDGET,
      chunks: {
        ...V2_BUNDLE_BUDGET.chunks,
        "corpus.js": {
          maxBrotliBytes: 100,
        },
      },
    };

    const report = checkV2BundleBudget(tmpDir, manifest, tightBudget);

    expect(report.exceeded).toBe(true);
    expect(
      report.errors.some(
        (e) =>
          e.includes("corpus.js brotli size") && e.includes("exceeds budget")
      )
    ).toBe(true);
  });

  test("fails when CSS brotli size exceeds budget, but allows large raw CSS when brotli is within budget", () => {
    const manifest = writeAllChunks("console.log(1);");
    // 200 kB of repetitive CSS compresses to well under 21 kB brotli.
    const largeCompressibleCss = ".cls { color: red; }\n".repeat(10_000);
    fs.writeFileSync(path.join(tmpDir, "app.css"), largeCompressibleCss);

    const passReport = checkV2BundleBudget(tmpDir, manifest, V2_BUNDLE_BUDGET);
    expect(passReport.exceeded).toBe(false);
    expect(passReport.css?.rawBytes).toBeGreaterThan(150 * 1024);

    const tightBudget: V2BundleBudget = {
      ...V2_BUNDLE_BUDGET,
      maxCssBrotliBytes: 10,
    };

    const report = checkV2BundleBudget(tmpDir, manifest, tightBudget);

    expect(report.exceeded).toBe(true);
    expect(
      report.errors.some(
        (e) => e.includes("CSS brotli size") && e.includes("exceeds budget")
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
    fs.rmSync(path.join(tmpDir, CRITICAL_CSS_FILE));
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
    expect(
      reportMissingFiles.errors.some((e) =>
        e.includes("Critical CSS asset not found on disk")
      )
    ).toBe(true);
  });

  describe("critical.js", () => {
    let manifest: V2AssetManifest;

    beforeEach(() => {
      manifest = writeAllChunks("console.log(1);");
    });

    test("is measured at DYNAMIC_BROTLI_QUALITY and not counted in the fetched JS chunk totals", () => {
      const report = checkV2BundleBudget(tmpDir, manifest);
      expect(report.errors).toEqual([]);
      expect(report.criticalJs?.rawBytes).toBe(
        Buffer.byteLength(criticalContent)
      );
      expect(report.criticalJs?.brotliBytes).toBe(
        brotliSize(criticalContent, DYNAMIC_BROTLI_QUALITY)
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

    test("fails when its brotli size exceeds the ceiling", () => {
      const random = crypto.randomBytes(300).toString("base64");
      fs.writeFileSync(path.join(tmpDir, CRITICAL_JS_FILE), random);
      const report = checkV2BundleBudget(tmpDir, manifest, {
        ...V2_BUNDLE_BUDGET,
        maxCriticalJsRawBytes: 10_000,
        maxCriticalJsBrotliBytes: 100,
      });
      expect(
        report.errors.some((e) => e.startsWith("Critical JS brotli size"))
      ).toBe(true);
    });

    test("ceilings stay at a fixed-size applier, not per-preference logic", () => {
      expect(V2_BUNDLE_BUDGET.maxCriticalJsRawBytes).toBeLessThanOrEqual(450);
      expect(V2_BUNDLE_BUDGET.maxCriticalJsBrotliBytes).toBeLessThanOrEqual(
        350
      );
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

  describe("critical.css", () => {
    let manifest: V2AssetManifest;

    beforeEach(() => {
      manifest = writeAllChunks("console.log(1);");
    });

    test("is measured at DYNAMIC_BROTLI_QUALITY separately from app.css", () => {
      const report = checkV2BundleBudget(tmpDir, manifest);
      expect(report.errors).toEqual([]);
      expect(report.criticalCss?.rawBytes).toBe(
        Buffer.byteLength(criticalCssContent)
      );
      expect(report.criticalCss?.brotliBytes).toBe(
        brotliSize(criticalCssContent, DYNAMIC_BROTLI_QUALITY)
      );
      expect(report.css?.rawBytes).toBe(
        Buffer.byteLength("body { margin: 0; }")
      );
    });

    test("fails when its raw size exceeds the ceiling", () => {
      fs.writeFileSync(
        path.join(tmpDir, CRITICAL_CSS_FILE),
        "x".repeat(V2_BUNDLE_BUDGET.maxCriticalCssRawBytes + 1)
      );
      const report = checkV2BundleBudget(tmpDir, manifest);
      expect(report.exceeded).toBe(true);
      expect(
        report.errors.some((e) => e.startsWith("Critical CSS raw size"))
      ).toBe(true);
    });

    test("fails when its brotli size exceeds the ceiling", () => {
      const random = crypto.randomBytes(300).toString("base64");
      fs.writeFileSync(path.join(tmpDir, CRITICAL_CSS_FILE), random);
      const report = checkV2BundleBudget(tmpDir, manifest, {
        ...V2_BUNDLE_BUDGET,
        maxCriticalCssRawBytes: 10_000,
        maxCriticalCssBrotliBytes: 100,
      });
      expect(
        report.errors.some((e) => e.startsWith("Critical CSS brotli size"))
      ).toBe(true);
    });

    test("ceilings keep critical.css within its inline budget", () => {
      expect(V2_BUNDLE_BUDGET.maxCriticalCssRawBytes).toBeLessThanOrEqual(2400);
      expect(V2_BUNDLE_BUDGET.maxCriticalCssBrotliBytes).toBeLessThanOrEqual(
        900
      );
    });

    test("appears in the formatted report", () => {
      const formatted = formatV2BundleSizeReport(
        checkV2BundleBudget(tmpDir, manifest)
      );
      expect(formatted).toContain("Critical CSS:");
      expect(formatted).toContain(
        `${Buffer.byteLength(criticalCssContent)} B raw`
      );
      expect(formatted).toContain(
        `<= ${V2_BUNDLE_BUDGET.maxCriticalCssBrotliBytes} B brotli`
      );
    });
  });

  test("formats human-readable budget report with every chunk", () => {
    const manifest = writeAllChunks("console.log('test');");
    const report = checkV2BundleBudget(tmpDir, manifest);

    const formatted = formatV2BundleSizeReport(report);
    expect(formatted).toContain("UI V2 Bundle Budget (Minified):");
    const kb = (bytes: number) =>
      (bytes / 1024).toFixed(2).replace(/(\.\d)0$/, "$1");
    for (const chunkName of V2_JS_CHUNKS) {
      expect(formatted).toContain(`${chunkName}:`);
      const cb = V2_BUNDLE_BUDGET.chunks[chunkName];
      expect(formatted).toContain(
        `(budget: < ${kb(cb.maxBrotliBytes)} kB brotli)`
      );
    }
    expect(formatted).toContain("Per-route JS:");
    for (const route of V2_ROUTES) {
      expect(formatted).toContain(`${route}:`);
    }
    expect(formatted).toContain("CSS:");
    expect(formatted).toContain(
      `(budget: < ${kb(V2_BUNDLE_BUDGET.maxCssBrotliBytes)} kB brotli)`
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
