/**
 * Check A of the UI V2 CSS audit: declarations that can never win the cascade.
 *
 * A declaration D1 on rule R1 is *shadowed* on a selector branch `s` when a
 * later declaration D2 on a different rule R2 has:
 * - the same at-rule context and the same `!important` flag,
 * - a flattened selector branch textually equal to `s`,
 * - an effective specificity at least that of D1's branch, and
 * - the same property, or a shorthand that resets it.
 *
 * Under those conditions the only remaining tiebreaker is source order, and
 * D2 is later, so D1 cannot apply on `s` for any element. When every branch
 * of R1 is shadowed the declaration is `dead`; when only some are, it is
 * `partial` (the usual "shared base in core/ plus a slice override" shape,
 * reported for inspection but not enforced).
 *
 * Anything that would require reasoning about *which* elements two different
 * selectors match is out of scope and simply not compared, so the check can
 * miss dead code but cannot invent it. The one known exception is a
 * progressive-enhancement fallback split across rules (`height: 100vh` in one
 * rule, `height: 100svh` in a later one): a browser that rejects the later
 * value at parse time falls back to the earlier one. Such pairs belong in the
 * same block; if one must be kept across rules, allowlist it.
 */

import {
  compareSpecificity,
  type DeclarationEntry,
} from "@/web/v2/tools/css_audit/css_audit_cascade";
import { resetsProperty } from "@/web/v2/tools/css_audit/css_audit_shorthands";

interface DeclarationSite {
  readonly file: string;
  readonly line: number;
  readonly prop: string;
  readonly value: string;
}

export interface ShadowFinding {
  readonly kind: "dead" | "partial";
  /** Normalized at-rule context shared by both declarations. */
  readonly context: string;
  /** Branches of the earlier rule that are shadowed. */
  readonly selectors: readonly string[];
  readonly earlier: DeclarationSite;
  /** One later declaration per shadowed branch (deduplicated). */
  readonly laterSites: readonly DeclarationSite[];
  /** Line-independent key, for allowlisting. */
  readonly key: string;
}

/**
 * Builds the allowlist key for a finding: `file|context|selectors|prop`.
 * Selectors are the shadowed branches, sorted and joined by ", ", so the key
 * survives reordering a selector list or shifting lines.
 */
function shadowFindingKey(
  file: string,
  context: string,
  selectors: readonly string[],
  prop: string
): string {
  return `${file}|${context}|${[...selectors].sort().join(", ")}|${prop}`;
}

function siteOf(entry: DeclarationEntry): DeclarationSite {
  return {
    file: entry.file,
    line: entry.line,
    prop: entry.prop,
    value: entry.value,
  };
}

function siteKey(site: DeclarationSite): string {
  return `${site.file}:${site.line}:${site.prop}`;
}

/**
 * Finds shadowed declarations in a cascade. `entries` must be in cascade
 * order (as produced by `collectDeclarations`).
 */
export function findShadowedDeclarations(
  entries: readonly DeclarationEntry[]
): ShadowFinding[] {
  // (context, important, selector) -> indices of entries with that branch.
  const byBranch = new Map<string, number[]>();
  const branchKey = (entry: DeclarationEntry, selector: string): string =>
    `${entry.context}\u0000${entry.important ? "!" : ""}\u0000${selector}`;
  entries.forEach((entry, index) => {
    for (const branch of entry.branches) {
      const key = branchKey(entry, branch.selector);
      const list = byBranch.get(key);
      if (list) list.push(index);
      else byBranch.set(key, [index]);
    }
  });

  const findings: ShadowFinding[] = [];
  entries.forEach((entry, index) => {
    if (entry.branches.length === 0) return;
    const shadowed: string[] = [];
    const laterSites = new Map<string, DeclarationSite>();
    for (const branch of entry.branches) {
      const candidates = byBranch.get(branchKey(entry, branch.selector)) ?? [];
      const hit = candidates.find((j) => {
        if (j <= index) return false;
        const later = entries[j];
        if (later.ruleId === entry.ruleId) return false;
        if (!resetsProperty(later.prop, entry.prop)) return false;
        const laterBranch = later.branches.find(
          (b) => b.selector === branch.selector
        );
        return (
          laterBranch !== undefined &&
          compareSpecificity(laterBranch.specificity, branch.specificity) >= 0
        );
      });
      if (hit === undefined) continue;
      if (!shadowed.includes(branch.selector)) shadowed.push(branch.selector);
      const site = siteOf(entries[hit]);
      laterSites.set(siteKey(site), site);
    }
    if (shadowed.length === 0) return;
    const distinct = new Set(entry.branches.map((b) => b.selector));
    findings.push({
      kind: shadowed.length === distinct.size ? "dead" : "partial",
      context: entry.context,
      selectors: shadowed,
      earlier: siteOf(entry),
      laterSites: [...laterSites.values()],
      key: shadowFindingKey(entry.file, entry.context, shadowed, entry.prop),
    });
  });
  return findings;
}

/** Renders a finding as a readable, multi-line diagnostic. */
export function formatShadowFinding(finding: ShadowFinding): string {
  const context = finding.context ? ` [${finding.context}]` : "";
  const lines = [
    `${finding.kind.toUpperCase()} ${finding.earlier.file}:${
      finding.earlier.line
    }` + `  ${finding.selectors.join(", ")}${context}`,
    `    ${finding.earlier.prop}: ${finding.earlier.value}`,
    ...finding.laterSites.map(
      (site) => `    <- ${site.file}:${site.line}  ${site.prop}: ${site.value}`
    ),
    `    key: ${finding.key}`,
  ];
  return lines.join("\n");
}
