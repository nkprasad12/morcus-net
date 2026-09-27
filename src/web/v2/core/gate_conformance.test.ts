/**
 * Conformance check for the JS gate (see `v2-critical.css` and "JS-only and
 * No-JS-only UI" in README.md).
 *
 * UI V2 has exactly one way to show or hide UI depending on whether JS is
 * running: `data-js-only` / `data-nojs-only`, revealed by the owner's
 * `data-upgraded` marker. The mechanisms it replaced disagree with each other
 * during the pre-hydration window (PRE_HYDRATION.md §2), so this test fails
 * if any of them come back.
 *
 * ALLOWLIST ENTRIES REQUIRE HUMAN REVIEW. Do not add one to make this test
 * pass; use the gate attributes instead. If a genuine exception is needed,
 * ask a human, and leave a comment at the call site explaining why.
 */

import fs from "fs";
import path from "path";

const V2_ROOT = path.resolve(__dirname, "..");
const THIS_FILE = path.basename(__filename);

interface BannedGate {
  name: string;
  pattern: RegExp;
  fix: string;
}

const BANNED: readonly BannedGate[] = [
  {
    name: "<noscript>",
    pattern: /<noscript/g,
    fix: "Use `data-nojs-only` so the fallback also works before upgrade.",
  },
  {
    name: "@media (scripting)",
    pattern: /@media\s*\(\s*scripting/g,
    fix: "Use `data-js-only` / `data-nojs-only`, or `:not([data-upgraded] *)`.",
  },
  {
    name: ".has-js",
    pattern: /has-js/g,
    fix: "There is no global JS flag. Use `data-js-only` or `[data-upgraded]`.",
  },
  {
    name: ":defined",
    pattern: /:defined\b/g,
    fix: "Use `[data-upgraded]`, which is set after `onConnect()` succeeds.",
  },
  {
    name: ".js-only class",
    pattern: /\.js-only\b|class="[^"]*\bjs-only\b/g,
    fix: "Use the `data-js-only` attribute.",
  },
];

/**
 * `relative path` -> gate name -> allowed occurrences. HUMAN REVIEW REQUIRED
 * for every entry (see the file comment).
 */
const ALLOWLIST: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  // The gate itself: `:not(:defined)` keeps UI under a not-yet-registered
  // (lazily loaded) custom element gated.
  "v2-critical.css": { ":defined": 2 },
  // Local-text notice: as `data-nojs-only` it would flash "needs JavaScript"
  // on every load. Approved by nkprasad, 2026-09-27.
  "external/external.server.ts": { "<noscript>": 1 },
};

function listSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "prototypes" || entry.name === "node_modules") {
        continue;
      }
      out.push(...listSources(full));
    } else if (
      /\.(ts|css)$/.test(entry.name) &&
      !entry.name.endsWith(".test.ts") &&
      entry.name !== THIS_FILE
    ) {
      out.push(full);
    }
  }
  return out;
}

/** Strips comments so prose that mentions an old mechanism isn't flagged. */
function stripComments(source: string, isCss: boolean): string {
  const noBlocks = source.replace(/\/\*[\s\S]*?\*\//g, "");
  return isCss ? noBlocks : noBlocks.replace(/(^|\s)\/\/.*$/gm, "$1");
}

function countOccurrences(): Map<string, Map<string, number>> {
  const found = new Map<string, Map<string, number>>();
  for (const file of listSources(V2_ROOT)) {
    const rel = path.relative(V2_ROOT, file).split(path.sep).join("/");
    const text = stripComments(
      fs.readFileSync(file, "utf8"),
      file.endsWith(".css")
    );
    for (const gate of BANNED) {
      const count = text.match(gate.pattern)?.length ?? 0;
      if (count === 0) continue;
      if (!found.has(rel)) found.set(rel, new Map());
      found.get(rel)!.set(gate.name, count);
    }
  }
  return found;
}

describe("JS gate conformance", () => {
  const found = countOccurrences();

  test("no legacy JS gates outside the reviewed allowlist", () => {
    const violations: string[] = [];
    for (const [file, gates] of found) {
      for (const [name, count] of gates) {
        const allowed = ALLOWLIST[file]?.[name] ?? 0;
        if (count > allowed) {
          const fix = BANNED.find((g) => g.name === name)?.fix ?? "";
          violations.push(
            `${file}: ${count}× ${name} (allowed ${allowed}). ${fix}`
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test("allowlist has no stale entries", () => {
    const stale: string[] = [];
    for (const [file, gates] of Object.entries(ALLOWLIST)) {
      for (const [name, allowed] of Object.entries(gates)) {
        const count = found.get(file)?.get(name) ?? 0;
        if (count < allowed) {
          stale.push(`${file}: ${name} allows ${allowed}, found ${count}`);
        }
      }
    }
    expect(stale).toEqual([]);
  });
});
