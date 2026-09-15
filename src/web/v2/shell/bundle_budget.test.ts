import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as zlib from "zlib";
import {
  checkV2BundleBudget,
  formatV2BundleSizeReport,
  V2_BUNDLE_BUDGET,
  type V2BundleBudget,
} from "@/bundler/v2_bundle_budget";

describe("UI V2 Bundle Budget", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "budget-test-"));
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
    expect(formatted).toContain("< 90.0 kB raw / < 26.0 kB gzip");
    expect(formatted).toContain("< 115.0 kB raw / < 20.0 kB gzip");
    expect(formatted).toContain("< 200.0 kB raw / < 45.0 kB gzip");
  });

  test("accepts realistic production bundle sizes corresponding to current baseline", () => {
    // Current baseline is ~72 kB raw / ~20 kB gzip JS and ~94 kB raw / ~15 kB gzip CSS
    const jsContent = "const x = 1;\n".repeat(4500); // ~72 kB
    const cssContent = ".card { border: 1px solid #ccc; }\n".repeat(2500); // ~92 kB

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
