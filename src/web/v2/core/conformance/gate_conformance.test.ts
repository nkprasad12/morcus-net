/**
 * Conformance check for the JS gate (see `v2-critical.css` and "JS-only and
 * No-JS-only UI" in README.md).
 *
 * UI V2 has exactly one way to show or hide UI depending on whether JS is
 * running: `data-js-only` / `data-nojs-only`. What is painted comes from
 * `@media (scripting)`; what works comes from the owner's `data-upgraded`
 * marker. The mechanisms it replaced disagree with each other during the
 * pre-hydration window (README.md, "JS-only and No-JS-only UI"), so this test fails if any of
 * them come back.
 *
 * ALLOWLIST AND RATCHET ENTRIES REQUIRE HUMAN REVIEW. Do not add or raise one
 * to make this test pass; use the gate attributes instead. If a genuine
 * exception is needed, ask a human, and leave a comment at the call site
 * explaining why.
 */

import fs from "fs";
import path from "path";

const V2_ROOT = path.resolve(__dirname, "../..");
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
    fix: "Use `data-nojs-only`, which is never painted when scripting is on.",
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
};

/**
 * RATCHET: `[data-upgraded]` occurrences per CSS file. A growth guard: counts
 * must not go up, and if a change removes rules, the entry follows them down so
 * the ceiling stays tight. `[data-upgraded]` means "this
 * component's behaviour is attached", so it's only for behaviour and
 * hand-over (a `:target` rule the component takes over, a native fallback it
 * replaces). Appearance that only depends on whether scripts can run belongs
 * in `@media (scripting)`, which is known before first paint.
 *
 * HUMAN REVIEW REQUIRED to add or raise an entry, with a comment at the rule
 * saying which behaviour depends on upgrade.
 */
const UPGRADED_RATCHET: Readonly<Record<string, number>> = {
  // The gate's behaviour half, plus the fallback for browsers without
  // (scripting).
  "v2-critical.css": 4,
  // `:target` opens the dictionary drawer until the reader adopts the hash.
  "reader/reader_layout.css": 3,
  // `:target` opens the TOC drawer until the TOC controller adopts the hash.
  "reader/reader_toc.css": 2,
  // `:target` opens the dictionary settings dialog until the element adopts the hash.
  "dict/settings/dict_settings.css": 2,
  "v2.css": 1,
  // The back-to-top link stays visible (a plain link) until its script runs,
  // and clears the drawer that a pre-upgrade `:target` inside it opens.
  "shell/app_bar.css": 2,
  // The CSS focus tooltip hands over to the abbreviation popover.
  "dict/entry/dict_typography.css": 1,
  // Browsers without (scripting) pick the External Reader panel at upgrade.
  "external/external.css": 1,
  // Overscroll suppression only while swipe page turns are live.
  "reader/reader_page_nav.css": 1,
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

/** `[data-upgraded]` occurrences per CSS file, ignoring comments. */
function countUpgradedInCss(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const file of listSources(V2_ROOT)) {
    if (!file.endsWith(".css")) continue;
    const rel = path.relative(V2_ROOT, file).split(path.sep).join("/");
    const text = stripComments(fs.readFileSync(file, "utf8"), true);
    const count = text.match(/\[data-upgraded\]/g)?.length ?? 0;
    if (count > 0) counts.set(rel, count);
  }
  return counts;
}

describe("[data-upgraded] ratchet in CSS", () => {
  const counts = countUpgradedInCss();

  test("no file gains [data-upgraded] rules", () => {
    const grown: string[] = [];
    for (const [file, count] of counts) {
      const allowed = UPGRADED_RATCHET[file] ?? 0;
      if (count > allowed) {
        grown.push(
          `${file}: ${count}× [data-upgraded] (ratchet ${allowed}). ` +
            "Appearance-only rules belong in @media (scripting); behaviour " +
            "rules need human review."
        );
      }
    }
    expect(grown).toEqual([]);
  });

  test("[data-upgraded] ratchet has no stale entries", () => {
    const loose: string[] = [];
    for (const [file, allowed] of Object.entries(UPGRADED_RATCHET)) {
      const count = counts.get(file) ?? 0;
      if (count < allowed) {
        loose.push(`${file}: ratchet ${allowed}, found ${count}`);
      }
    }
    expect(loose).toEqual([]);
  });
});

describe("(scripting) is allowed for paint", () => {
  test("the gate paints from @media (scripting)", () => {
    const gate = stripComments(
      fs.readFileSync(path.join(V2_ROOT, "v2-critical.css"), "utf8"),
      true
    );
    expect(gate).toMatch(/@media\s*\(\s*scripting:\s*enabled\s*\)/);
    expect(gate).toMatch(/@media\s*\(\s*scripting:\s*none\s*\)/);
  });

  test("(scripting) is not a banned gate", () => {
    expect(BANNED.map((g) => g.name)).not.toContain("@media (scripting)");
  });
});
