import * as fs from "fs";
import * as path from "path";
import type {
  CallSiteCitation,
  CssDuplicatePattern,
  InventoryAnalysis,
} from "@/web/v2/tools/inventory/inventory_analyzer";

export const DEFAULT_RATCHET_PATH = "src/web/v2/inventory_ratchet.json";

export interface CssAllowlistEntry {
  readonly files: readonly string[];
  readonly reason: string;
}

export interface InventoryRatchet {
  readonly version: 1;
  readonly cssDuplicates: {
    readonly patterns: Readonly<Record<string, readonly string[]>>;
    readonly allowlist: Readonly<Record<string, CssAllowlistEntry>>;
  };
  readonly domMutationOutsideCore: {
    readonly callsPerFile: Readonly<Record<string, number>>;
  };
}

export interface RatchetViolation {
  readonly metric: "cssDuplicates" | "domMutationOutsideCore";
  readonly kind: "regression" | "stale";
  readonly target: string;
  readonly message: string;
  readonly citations: readonly string[];
}

export interface RatchetComparisonResult {
  readonly passed: boolean;
  readonly regressions: readonly RatchetViolation[];
  readonly stale: readonly RatchetViolation[];
}

function sortRecordKeys<T>(
  record: Readonly<Record<string, T>>
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) {
    out[key] = record[key];
  }
  return out;
}

function sortCallsPerFile(
  callsPerFile: Readonly<Record<string, number>>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(callsPerFile).sort()) {
    const count = callsPerFile[key] ?? 0;
    if (count > 0) {
      out[key] = count;
    }
  }
  return out;
}

/**
 * Builds a normalized `InventoryRatchet` from the current `InventoryAnalysis`,
 * preserving any existing CSS allowlist entries.
 */
export function buildRatchetFromAnalysis(
  analysis: InventoryAnalysis,
  existingAllowlist: Readonly<Record<string, CssAllowlistEntry>> = {}
): InventoryRatchet {
  const normalizedAllowlist: Record<string, CssAllowlistEntry> = {};
  for (const id of Object.keys(existingAllowlist).sort()) {
    const entry = existingAllowlist[id];
    normalizedAllowlist[id] = {
      files: [...entry.files].sort(),
      reason: entry.reason,
    };
  }

  const patterns: Record<string, readonly string[]> = {};
  const sortedPatterns = [...analysis.cssDuplicates].sort((a, b) =>
    a.id.localeCompare(b.id)
  );
  for (const pattern of sortedPatterns) {
    if (pattern.id in normalizedAllowlist) continue;
    patterns[pattern.id] = [...pattern.files].sort();
  }

  return {
    version: 1,
    cssDuplicates: {
      patterns: sortRecordKeys(patterns),
      allowlist: normalizedAllowlist,
    },
    domMutationOutsideCore: {
      callsPerFile: sortCallsPerFile(
        analysis.domMutationOutsideCore.callsPerFile
      ),
    },
  };
}

/**
 * Deterministically serializes an `InventoryRatchet` with sorted keys and a
 * trailing newline so `--update` diffs remain minimal.
 */
export function serializeInventoryRatchet(ratchet: InventoryRatchet): string {
  const normalizedPatterns: Record<string, readonly string[]> = {};
  for (const id of Object.keys(ratchet.cssDuplicates.patterns).sort()) {
    if (id in ratchet.cssDuplicates.allowlist) continue;
    normalizedPatterns[id] = [...ratchet.cssDuplicates.patterns[id]].sort();
  }

  const normalizedAllowlist: Record<string, CssAllowlistEntry> = {};
  for (const id of Object.keys(ratchet.cssDuplicates.allowlist).sort()) {
    const entry = ratchet.cssDuplicates.allowlist[id];
    normalizedAllowlist[id] = {
      files: [...entry.files].sort(),
      reason: entry.reason,
    };
  }

  const normalized: InventoryRatchet = {
    version: 1,
    cssDuplicates: {
      patterns: normalizedPatterns,
      allowlist: normalizedAllowlist,
    },
    domMutationOutsideCore: {
      callsPerFile: sortCallsPerFile(
        ratchet.domMutationOutsideCore.callsPerFile
      ),
    },
  };

  const raw = `${JSON.stringify(normalized, null, 2)}\n`;
  return raw.replace(
    /^( +)"([^"]+)": \[\n((?:\1 {2}"[^"]+",?\n)+)\1\](,?)$/gm,
    (match, indent: string, key: string, body: string, comma: string) => {
      const items = body
        .trim()
        .split("\n")
        .map((line) => line.trim().replace(/,$/, ""));
      const singleLine = `${indent}"${key}": [${items.join(", ")}]${comma}`;
      return singleLine.length <= 80 ? singleLine : match;
    }
  );
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function isStringArray(val: unknown): val is string[] {
  return Array.isArray(val) && val.every((item) => typeof item === "string");
}

function parseCallsPerFile(
  raw: unknown,
  metricName: string
): Record<string, number> {
  if (!isRecord(raw) || !isRecord(raw.callsPerFile)) {
    throw new Error(`Invalid ${metricName}.callsPerFile in inventory ratchet`);
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw.callsPerFile)) {
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
      throw new Error(
        `Invalid count for ${k} in ${metricName}.callsPerFile: ${String(v)}`
      );
    }
    if (v > 0) {
      out[k] = v;
    }
  }
  return sortCallsPerFile(out);
}

/**
 * Parses and validates an `InventoryRatchet` JSON string.
 */
export function parseInventoryRatchet(jsonText: string): InventoryRatchet {
  const raw: unknown = JSON.parse(jsonText);
  if (!isRecord(raw) || raw.version !== 1) {
    throw new Error("Invalid inventory_ratchet.json: expected version 1");
  }
  if (!isRecord(raw.cssDuplicates)) {
    throw new Error("Invalid inventory_ratchet.json: missing cssDuplicates");
  }
  const rawPatterns = raw.cssDuplicates.patterns;
  const rawAllowlist = raw.cssDuplicates.allowlist;
  if (!isRecord(rawPatterns) || !isRecord(rawAllowlist)) {
    throw new Error(
      "Invalid inventory_ratchet.json: cssDuplicates must have patterns and allowlist objects"
    );
  }

  const patterns: Record<string, readonly string[]> = {};
  for (const [id, files] of Object.entries(rawPatterns)) {
    if (!isStringArray(files)) {
      throw new Error(`Invalid files list for CSS pattern ${id}`);
    }
    patterns[id] = [...files].sort();
  }

  const allowlist: Record<string, CssAllowlistEntry> = {};
  for (const [id, entry] of Object.entries(rawAllowlist)) {
    if (
      !isRecord(entry) ||
      !isStringArray(entry.files) ||
      typeof entry.reason !== "string"
    ) {
      throw new Error(`Invalid allowlist entry for CSS pattern ${id}`);
    }
    allowlist[id] = {
      files: [...entry.files].sort(),
      reason: entry.reason,
    };
  }

  return {
    version: 1,
    cssDuplicates: {
      patterns: sortRecordKeys(patterns),
      allowlist: sortRecordKeys(allowlist),
    },
    domMutationOutsideCore: {
      callsPerFile: parseCallsPerFile(
        raw.domMutationOutsideCore,
        "domMutationOutsideCore"
      ),
    },
  };
}

export function readInventoryRatchet(
  repoRoot: string = process.cwd(),
  ratchetRelPath: string = DEFAULT_RATCHET_PATH
): InventoryRatchet {
  const fullPath = path.resolve(repoRoot, ratchetRelPath);
  const content = fs.readFileSync(fullPath, "utf8");
  return parseInventoryRatchet(content);
}

export function writeInventoryRatchet(
  ratchet: InventoryRatchet,
  repoRoot: string = process.cwd(),
  ratchetRelPath: string = DEFAULT_RATCHET_PATH
): void {
  const fullPath = path.resolve(repoRoot, ratchetRelPath);
  fs.writeFileSync(fullPath, serializeInventoryRatchet(ratchet), "utf8");
}

function compareFileMetric(
  metric: "domMutationOutsideCore",
  expectedMap: Readonly<Record<string, number>>,
  actualMap: Readonly<Record<string, number>>,
  citations: readonly CallSiteCitation[],
  regressions: RatchetViolation[],
  stale: RatchetViolation[]
): void {
  const allFiles = new Set<string>([
    ...Object.keys(expectedMap),
    ...Object.keys(actualMap),
  ]);

  const citationsByFile = new Map<string, CallSiteCitation[]>();
  for (const c of citations) {
    let list = citationsByFile.get(c.file);
    if (!list) {
      list = [];
      citationsByFile.set(c.file, list);
    }
    list.push(c);
  }

  for (const file of [...allFiles].sort()) {
    const expected = expectedMap[file] ?? 0;
    const actual = actualMap[file] ?? 0;
    if (actual > expected) {
      const fileCitations = (citationsByFile.get(file) ?? []).map(
        (c) => `${c.file}:${c.line} [${c.method}] ${c.snippet}`
      );
      regressions.push({
        metric,
        kind: "regression",
        target: file,
        message: `[${metric}] ${file}: ${expected} → ${actual}`,
        citations: fileCitations,
      });
    } else if (actual < expected) {
      stale.push({
        metric,
        kind: "stale",
        target: file,
        message: `[${metric}] ${file}: ${expected} → ${actual}`,
        citations: [],
      });
    }
  }
}

/**
 * Compares the actual `InventoryAnalysis` against a committed `InventoryRatchet`.
 *
 * The ratchet is a growth guard. It is exact in both directions (§1.3, §4):
 * - `actual > ratchet` (or a new CSS pattern / added file) → regression;
 * - `actual < ratchet` (or a missing CSS pattern / dropped file) → stale;
 * - allowlisted CSS patterns are excluded from comparison.
 *
 * Stale entries fail only so the ceiling follows the code down and can't be
 * silently re-spent later. Lower counts are not a goal in themselves.
 */
export function compareInventoryRatchet(
  ratchet: InventoryRatchet,
  analysis: InventoryAnalysis
): RatchetComparisonResult {
  const regressions: RatchetViolation[] = [];
  const stale: RatchetViolation[] = [];

  const allowlist = ratchet.cssDuplicates.allowlist;

  const expectedPatterns = new Map<string, readonly string[]>();
  for (const [id, files] of Object.entries(ratchet.cssDuplicates.patterns)) {
    if (id in allowlist) continue;
    expectedPatterns.set(id, [...files].sort());
  }

  const actualPatterns = new Map<string, CssDuplicatePattern>();
  for (const pattern of analysis.cssDuplicates) {
    if (pattern.id in allowlist) continue;
    actualPatterns.set(pattern.id, pattern);
  }

  const allPatternIds = new Set<string>([
    ...expectedPatterns.keys(),
    ...actualPatterns.keys(),
  ]);

  for (const id of [...allPatternIds].sort()) {
    const expectedFiles = expectedPatterns.get(id);
    const actualPattern = actualPatterns.get(id);
    const actualFiles = actualPattern ? [...actualPattern.files].sort() : null;

    if (!expectedFiles && actualPattern && actualFiles) {
      regressions.push({
        metric: "cssDuplicates",
        kind: "regression",
        target: id,
        message: `[cssDuplicates] pattern ${id} (${actualFiles.join(
          ", "
        )}): none → [${actualFiles.join(", ")}]`,
        citations: actualPattern.occurrences.map(
          (o) => `${o.file}:${o.line} (${o.selector})`
        ),
      });
      continue;
    }

    if (expectedFiles && !actualFiles) {
      stale.push({
        metric: "cssDuplicates",
        kind: "stale",
        target: id,
        message: `[cssDuplicates] pattern ${id} (${expectedFiles.join(
          ", "
        )}): [${expectedFiles.join(", ")}] → none`,
        citations: [],
      });
      continue;
    }

    if (expectedFiles && actualFiles && actualPattern) {
      const expectedSet = new Set(expectedFiles);
      const actualSet = new Set(actualFiles);
      const addedFiles = actualFiles.filter((f) => !expectedSet.has(f));
      const droppedFiles = expectedFiles.filter((f) => !actualSet.has(f));

      if (addedFiles.length > 0) {
        regressions.push({
          metric: "cssDuplicates",
          kind: "regression",
          target: id,
          message: `[cssDuplicates] pattern ${id} (${actualFiles.join(
            ", "
          )}): [${expectedFiles.join(", ")}] → [${actualFiles.join(", ")}]`,
          citations: actualPattern.occurrences.map(
            (o) => `${o.file}:${o.line} (${o.selector})`
          ),
        });
      }
      if (droppedFiles.length > 0) {
        stale.push({
          metric: "cssDuplicates",
          kind: "stale",
          target: id,
          message: `[cssDuplicates] pattern ${id} (${expectedFiles.join(
            ", "
          )}): [${expectedFiles.join(", ")}] → [${actualFiles.join(", ")}]`,
          citations: [],
        });
      }
    }
  }

  compareFileMetric(
    "domMutationOutsideCore",
    ratchet.domMutationOutsideCore.callsPerFile,
    analysis.domMutationOutsideCore.callsPerFile,
    analysis.domMutationOutsideCore.citations,
    regressions,
    stale
  );

  return {
    passed: regressions.length === 0 && stale.length === 0,
    regressions,
    stale,
  };
}

/**
 * Formats ratchet comparison failures according to §6:
 * - Names the metric, the file (or pattern ID with its files), and `ratchet → actual`.
 * - Regressions show offending call sites with `file:line`.
 * - Stale failures end with the exact line `Run: npm run inventory:update`.
 */
export function formatRatchetFailures(
  comparison: RatchetComparisonResult
): string {
  if (comparison.passed) return "";

  const lines: string[] = [];

  if (comparison.regressions.length > 0) {
    lines.push(
      `Inventory ratchet regressions (${comparison.regressions.length}):`
    );
    for (const reg of comparison.regressions) {
      lines.push(`  - ${reg.message}`);
      for (const cite of reg.citations) {
        lines.push(`      ${cite}`);
      }
    }
  }

  if (comparison.stale.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(`Stale inventory ratchet entries (${comparison.stale.length}):`);
    for (const st of comparison.stale) {
      lines.push(`  - ${st.message}`);
    }
    lines.push("Run: npm run inventory:update");
  }

  return lines.join("\n");
}
