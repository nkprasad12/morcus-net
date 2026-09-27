import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as zlib from "zlib";
import * as crypto from "crypto";
import {
  CRITICAL_JS_FILE,
  checkV2BundleBudget,
  formatV2BundleSizeReport,
  V2_BUNDLE_BUDGET,
  type V2BundleBudget,
} from "@/bundler/v2_bundle_budget";

describe("UI V2 Bundle Budget", () => {
  let tmpDir: string;

  const criticalContent = "(()=>{try{}catch{}})();";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "budget-test-"));
    fs.writeFileSync(path.join(tmpDir, CRITICAL_JS_FILE), criticalContent);
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("passes when assets are within budget", () => {
    const jsContent = "console.log('test');";
    const cssContent = "body { margin: 0; }";

    fs.writeFileSync(path.join(tmpDir, "v2_bundle.12345.js"), jsContent);
    fs.writeFileSync(path.join(tmpDir, "v2.67890.css"), cssContent);

    const manifest = {
      "v2.js": "v2_bundle.12345.js",
      "v2.css": "v2.67890.css",
    };

    const report = checkV2BundleBudget(tmpDir, manifest, V2_BUNDLE_BUDGET);

    expect(report.exceeded).toBe(false);
    expect(report.errors).toHaveLength(0);
    expect(report.js).toBeDefined();
    expect(report.css).toBeDefined();
    expect(report.combinedRawBytes).toBe(
      Buffer.byteLength(jsContent) + Buffer.byteLength(cssContent)
    );
    expect(report.combinedGzipBytes).toBe(
      zlib.gzipSync(jsContent).byteLength + zlib.gzipSync(cssContent).byteLength
    );
  });

  test("fails when JS raw size exceeds budget", () => {
    const jsContent = "x".repeat(100);
    const cssContent = "y".repeat(10);

    fs.writeFileSync(path.join(tmpDir, "v2_bundle.js"), jsContent);
    fs.writeFileSync(path.join(tmpDir, "v2.css"), cssContent);

    const tightBudget: V2BundleBudget = {
      ...V2_BUNDLE_BUDGET,
      maxJsRawBytes: 50,
    };

    const report = checkV2BundleBudget(
      tmpDir,
      { "v2.js": "v2_bundle.js", "v2.css": "v2.css" },
      tightBudget
    );

    expect(report.exceeded).toBe(true);
    expect(
      report.errors.some(
        (e) => e.includes("JS raw size") && e.includes("exceeds budget")
      )
    ).toBe(true);
  });

  test("fails when CSS gzip size exceeds budget", () => {
    // Generate compressible but large content
    const jsContent = "console.log(1);";
    const cssContent = ".cls { color: red; }\n".repeat(500);

    fs.writeFileSync(path.join(tmpDir, "v2_bundle.js"), jsContent);
    fs.writeFileSync(path.join(tmpDir, "v2.css"), cssContent);

    const tightBudget: V2BundleBudget = {
      ...V2_BUNDLE_BUDGET,
      maxCssGzipBytes: 10,
    };

    const report = checkV2BundleBudget(
      tmpDir,
      { "v2.js": "v2_bundle.js", "v2.css": "v2.css" },
      tightBudget
    );

    expect(report.exceeded).toBe(true);
    expect(
      report.errors.some(
        (e) => e.includes("CSS gzip size") && e.includes("exceeds budget")
      )
    ).toBe(true);
  });

  test("fails when combined size exceeds budget", () => {
    const jsContent = "a".repeat(100);
    const cssContent = "b".repeat(100);

    fs.writeFileSync(path.join(tmpDir, "v2_bundle.js"), jsContent);
    fs.writeFileSync(path.join(tmpDir, "v2.css"), cssContent);

    const tightBudget: V2BundleBudget = {
      ...V2_BUNDLE_BUDGET,
      maxJsRawBytes: 500,
      maxCssRawBytes: 500,
      maxCombinedRawBytes: 150, // 200 > 150
    };

    const report = checkV2BundleBudget(
      tmpDir,
      { "v2.js": "v2_bundle.js", "v2.css": "v2.css" },
      tightBudget
    );

    expect(report.exceeded).toBe(true);
    expect(
      report.errors.some(
        (e) => e.includes("Combined raw size") && e.includes("exceeds budget")
      )
    ).toBe(true);
  });

  test("flags missing files and manifest entries", () => {
    const reportMissingManifest = checkV2BundleBudget(tmpDir, {});
    expect(reportMissingManifest.exceeded).toBe(true);
    expect(
      reportMissingManifest.errors.some((e) =>
        e.includes("Manifest missing 'v2.js'")
      )
    ).toBe(true);
    expect(
      reportMissingManifest.errors.some((e) =>
        e.includes("Manifest missing 'v2.css'")
      )
    ).toBe(true);

    fs.rmSync(path.join(tmpDir, CRITICAL_JS_FILE));
    const reportMissingFiles = checkV2BundleBudget(tmpDir, {
      "v2.js": "nonexistent.js",
      "v2.css": "nonexistent.css",
    });
    expect(reportMissingFiles.exceeded).toBe(true);
    expect(
      reportMissingFiles.errors.some((e) =>
        e.includes("JS asset not found on disk")
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
    const manifest = { "v2.js": "v2_bundle.js", "v2.css": "v2.css" };

    beforeEach(() => {
      fs.writeFileSync(path.join(tmpDir, "v2_bundle.js"), "console.log(1);");
      fs.writeFileSync(path.join(tmpDir, "v2.css"), "body{margin:0}");
    });

    test("is measured but not counted in the combined totals", () => {
      const report = checkV2BundleBudget(tmpDir, manifest);
      expect(report.errors).toEqual([]);
      expect(report.criticalJs?.rawBytes).toBe(
        Buffer.byteLength(criticalContent)
      );
      expect(report.combinedRawBytes).toBe(
        Buffer.byteLength("console.log(1);") +
          Buffer.byteLength("body{margin:0}")
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
      // Random bytes barely compress.
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
      // The applier measured 424 B raw / 300 B gzip. Raising these means
      // logic crept back into the critical script (see v2_bundle_budget.ts).
      expect(V2_BUNDLE_BUDGET.maxCriticalJsRawBytes).toBeLessThanOrEqual(450);
      expect(V2_BUNDLE_BUDGET.maxCriticalJsGzipBytes).toBeLessThanOrEqual(350);
    });

    test("appears in the formatted report", () => {
      const formatted = formatV2BundleSizeReport(
        checkV2BundleBudget(tmpDir, manifest)
      );
      expect(formatted).toContain(
        `Critical: ${Buffer.byteLength(criticalContent)} B raw`
      );
      expect(formatted).toContain(
        `<= ${V2_BUNDLE_BUDGET.maxCriticalJsRawBytes} B raw`
      );
    });
  });

  test("formats human-readable budget report", () => {
    const jsContent = "console.log('test');";
    const cssContent = "body { margin: 0; }";

    fs.writeFileSync(path.join(tmpDir, "v2_bundle.js"), jsContent);
    fs.writeFileSync(path.join(tmpDir, "v2.css"), cssContent);

    const report = checkV2BundleBudget(tmpDir, {
      "v2.js": "v2_bundle.js",
      "v2.css": "v2.css",
    });

    const formatted = formatV2BundleSizeReport(report);
    expect(formatted).toContain("UI V2 Bundle Budget (Minified):");
    expect(formatted).toContain("JS:");
    expect(formatted).toContain("CSS:");
    expect(formatted).toContain("Combined:");
    const kb = (bytes: number) => (bytes / 1024).toFixed(1);
    const b = V2_BUNDLE_BUDGET;
    expect(formatted).toContain(
      `< ${kb(b.maxJsRawBytes)} kB raw / < ${kb(b.maxJsGzipBytes)} kB gzip`
    );
    expect(formatted).toContain(
      `< ${kb(b.maxCssRawBytes)} kB raw / < ${kb(b.maxCssGzipBytes)} kB gzip`
    );
    expect(formatted).toContain(
      `< ${kb(b.maxCombinedRawBytes)} kB raw / < ${kb(
        b.maxCombinedGzipBytes
      )} kB gzip`
    );
  });

  test("accepts realistic production bundle sizes corresponding to current baseline", () => {
    // Current baseline is ~97 kB raw / ~27 kB gzip JS and ~105 kB raw / ~17 kB gzip CSS
    const jsContent = "const x = 1;\n".repeat(6000); // ~96 kB
    const cssContent = ".card { border: 1px solid #ccc; }\n".repeat(2800); // ~103 kB

    fs.writeFileSync(path.join(tmpDir, "v2_bundle.js"), jsContent);
    fs.writeFileSync(path.join(tmpDir, "v2.css"), cssContent);

    const report = checkV2BundleBudget(tmpDir, {
      "v2.js": "v2_bundle.js",
      "v2.css": "v2.css",
    });

    expect(report.errors).toEqual([]);
    expect(report.exceeded).toBe(false);
    expect(report.combinedRawBytes).toBeLessThan(
      V2_BUNDLE_BUDGET.maxCombinedRawBytes
    );
    expect(report.combinedGzipBytes).toBeLessThan(
      V2_BUNDLE_BUDGET.maxCombinedGzipBytes
    );
  });
});
