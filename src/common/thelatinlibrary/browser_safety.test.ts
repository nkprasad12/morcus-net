import fs from "fs";
import path from "path";

/**
 * `src/common/thelatinlibrary/` is bundled into browser code (Open Texts) as
 * well as Node scripts, but its files don't carry the `.common.ts` suffix
 * that the UI conformance suites check. This test enforces the contract from
 * docs/library-release/INTERFACES.md §2.2: no Node-only imports.
 */

const DIR = __dirname;
const FORBIDDEN = /^(?:fs|path|crypto|parse5|node:.*)(?:\/.*)?$/;

/** Drops comments (e.g. usage examples in JSDoc) but keeps string literals. */
function stripComments(source: string): string {
  return source.replace(
    /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    (_match, str: string | undefined) => str ?? ""
  );
}

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["']/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) specs.push(m[1]);
  }
  return specs;
}

describe("browser safety of src/common/thelatinlibrary", () => {
  const files = fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

  it("finds the page-layer sources", () => {
    expect(files).toEqual(
      expect.arrayContaining([
        "dom_adapter.ts",
        "encoding.ts",
        "index.ts",
        "markers.ts",
        "page_layer.ts",
        "page_layer_types.ts",
        "snapshot_types.ts",
      ])
    );
  });

  it.each(files)("%s has no Node-only imports", (file) => {
    const source = fs.readFileSync(path.join(DIR, file), "utf8");
    const bad = importSpecifiers(stripComments(source)).filter((s) =>
      FORBIDDEN.test(s)
    );
    expect(bad).toEqual([]);
  });

  it("detects forbidden imports", () => {
    const sample = [
      `import fs from "fs";`,
      `import * as path from 'path';`,
      `import { createHash } from "node:crypto";`,
      `import type { DefaultTreeAdapterMap } from "parse5";`,
      `const c = require("crypto");`,
      `export { parse } from "parse5";`,
      `// import fs from "fs";`,
      `/** import { parse } from "parse5"; */`,
    ].join("\n");
    expect(
      importSpecifiers(stripComments(sample)).filter((s) => FORBIDDEN.test(s))
    ).toEqual(["fs", "path", "node:crypto", "parse5", "parse5", "crypto"]);
  });
});
