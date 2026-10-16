/**
 * Repo-facing entry point for the UI V2 CSS audit. Wires the pure analyzers
 * (`css_audit_cascade`, `css_audit_shadowing`, `css_audit_sources`,
 * `css_audit_unreferenced`) to the working tree.
 *
 * - Check A (shadowed declarations) runs separately on each stylesheet entry
 *   point, because `v2-critical.css` is inlined and `v2.css` is linked, and a
 *   rule that appears in both is deliberate (the inlined copy is what prevents
 *   a flash of unstyled content).
 * - Check B (unreferenced names) runs on the union of both entry points
 *   against every tracked non-test `.ts` file under `src/`.
 */

import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  collectDeclarations,
  loadCascadeOrder,
  type DeclarationEntry,
} from "@/web/v2/tools/css_audit/css_audit_cascade";
import {
  findShadowedDeclarations,
  type ShadowFinding,
} from "@/web/v2/tools/css_audit/css_audit_shadowing";
import {
  scanSourceReferences,
  type SourceReferences,
} from "@/web/v2/tools/css_audit/css_audit_sources";
import {
  collectCssNames,
  findUnreferencedCssNames,
  type UnreferencedReport,
} from "@/web/v2/tools/css_audit/css_audit_unreferenced";

/** Each entry point is its own cascade for Check A. */
export const CSS_ENTRY_POINTS: readonly string[] = [
  "src/web/v2/v2-critical.css",
  "src/web/v2/v2.css",
];

/**
 * Source files that do not count as references: tests, test fixtures and
 * harnesses, the audit tooling itself, and throwaway prototypes.
 *
 * Everything else under `src/` is scanned (not only `src/web/v2/`), because
 * the HTML for dictionary entries and library passages is produced in
 * `src/common/**`. The cost is that any `[\w-]+` token in a string literal
 * anywhere in `src/` counts as a reference, so a very short or generic class
 * name could be masked by an unrelated string. `.tsx` is excluded on
 * purpose: it is all UI V1.
 */
const EXCLUDED_SOURCE_PREFIXES: readonly string[] = [
  "src/web/v2/tools/",
  "src/web/v2/testing/",
  "src/web/v2/prototypes/",
];

/**
 * Shadowed declarations that are intentionally kept. Keys come from
 * `ShadowFinding.key` (`file|context|selectors|prop`); values say why.
 * ADDING AN ENTRY REQUIRES HUMAN REVIEW. The only legitimate shape is a
 * progressive-enhancement fallback that cannot live in the same block.
 */
export const SHADOW_ALLOWLIST: Readonly<Record<string, string>> = {};

export function listTrackedSourceFiles(repoRoot: string): string[] {
  // Tracked plus untracked-but-not-ignored, so a new renderer counts as a
  // reference before it is `git add`ed.
  const out = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", "src/"],
    { cwd: repoRoot, encoding: "utf8" }
  );
  return out
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.endsWith(".ts") &&
        !line.endsWith(".test.ts") &&
        !line.endsWith(".d.ts") &&
        !EXCLUDED_SOURCE_PREFIXES.some((prefix) => line.startsWith(prefix)) &&
        fs.existsSync(path.join(repoRoot, line))
    )
    .sort();
}

function readRepoFile(repoRoot: string): (rel: string) => string {
  return (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

export interface CssAuditResult {
  readonly shadowed: readonly ShadowFinding[];
  readonly staleShadowAllowlist: readonly string[];
  readonly unreferenced: UnreferencedReport;
}

export function loadEntryDeclarations(
  repoRoot: string,
  entry: string
): DeclarationEntry[] {
  return collectDeclarations(loadCascadeOrder([entry], readRepoFile(repoRoot)));
}

export function scanRepoSources(repoRoot: string): SourceReferences {
  return scanSourceReferences(
    listTrackedSourceFiles(repoRoot).map((rel) => ({
      path: rel,
      text: fs.readFileSync(path.join(repoRoot, rel), "utf8"),
    }))
  );
}

export function runCssAudit(repoRoot: string = process.cwd()): CssAuditResult {
  const perEntry = CSS_ENTRY_POINTS.map((entry) =>
    loadEntryDeclarations(repoRoot, entry)
  );

  const allShadowed = perEntry.flatMap((entries) =>
    findShadowedDeclarations(entries)
  );
  const dead = allShadowed.filter((f) => f.kind === "dead");
  const deadKeys = new Set(dead.map((f) => f.key));
  const shadowed = dead.filter((f) => !(f.key in SHADOW_ALLOWLIST));
  const staleShadowAllowlist = Object.keys(SHADOW_ALLOWLIST).filter(
    (key) => !deadKeys.has(key)
  );

  const names = collectCssNames(perEntry.flat());
  const unreferenced = findUnreferencedCssNames(
    names,
    scanRepoSources(repoRoot)
  );

  return { shadowed, staleShadowAllowlist, unreferenced };
}
