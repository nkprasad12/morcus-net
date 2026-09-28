import type {
  CallSiteCitation,
  CssDuplicatePattern,
  InventoryAnalysis,
} from "@/web/v2/tools/inventory_analyzer";
import {
  formatRatchetFailures,
  type InventoryRatchet,
  type RatchetComparisonResult,
} from "@/web/v2/tools/inventory_ratchet";

function sumRecordValues(record: Readonly<Record<string, number>>): number {
  let total = 0;
  for (const count of Object.values(record)) {
    total += count;
  }
  return total;
}

function formatDiff(ratchetVal: number, actualVal: number): string {
  const delta = actualVal - ratchetVal;
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return "=";
}

function renderPatternMarkdown(
  pattern: CssDuplicatePattern,
  lines: string[],
  allowlistReason?: string
): void {
  const candidateBadge =
    pattern.files.length >= 3 ? " — **`core/components.css` candidate**" : "";
  const ctxLabel = pattern.contextKey
    ? ` (context: \`${pattern.contextKey}\`)`
    : "";
  lines.push(
    `### Pattern \`${pattern.id}\` (${pattern.files.length} files, ${pattern.declCount} declarations)${ctxLabel}${candidateBadge}`
  );
  lines.push("");
  if (allowlistReason !== undefined) {
    lines.push(`- **Allowlist reason:** ${allowlistReason}`);
  }
  lines.push(`- **Declarations:** \`${pattern.declarations.join("; ")}\``);
  if (pattern.declarationKey !== pattern.declarations.join(";")) {
    lines.push(`- **Full key:** \`${pattern.declarationKey}\``);
  }
  lines.push("- **Occurrences:**");
  for (const occ of pattern.occurrences) {
    lines.push(`  - \`${occ.file}:${occ.line}\` — \`${occ.selector}\``);
  }
  lines.push("");
}

/**
 * Generates the full Markdown report (`.cache/inventory/report.md`) per §7.
 */
export function renderInventoryReportMarkdown(
  ratchet: InventoryRatchet,
  analysis: InventoryAnalysis,
  comparison: RatchetComparisonResult
): string {
  const allowlist = ratchet.cssDuplicates.allowlist;

  const activePatterns = analysis.cssDuplicates.filter(
    (p) => !(p.id in allowlist)
  );
  const allowlistedPatterns = analysis.cssDuplicates.filter(
    (p) => p.id in allowlist
  );

  const ratchetCssCount = Object.keys(ratchet.cssDuplicates.patterns).filter(
    (id) => !(id in allowlist)
  ).length;
  const actualCssCount = activePatterns.length;

  const ratchetDomTotal = sumRecordValues(
    ratchet.domMutationOutsideCore.callsPerFile
  );
  const actualDomTotal = analysis.domMutationOutsideCore.totalCalls;
  const ratchetDomFiles = Object.keys(
    ratchet.domMutationOutsideCore.callsPerFile
  ).length;
  const actualDomFiles = Object.keys(
    analysis.domMutationOutsideCore.callsPerFile
  ).length;

  const ratchetSelectorTotal = sumRecordValues(
    ratchet.selectorCalls.callsPerFile
  );
  const actualSelectorTotal = analysis.selectorCalls.totalCalls;
  const ratchetSelectorFiles = Object.keys(
    ratchet.selectorCalls.callsPerFile
  ).length;
  const actualSelectorFiles = Object.keys(
    analysis.selectorCalls.callsPerFile
  ).length;

  const lines: string[] = [];
  lines.push("# UI V2 Cross-Slice Inventory Report");
  lines.push("");
  lines.push(
    `Status: **${comparison.passed ? "PASS (exact match)" : "FAIL"}**`
  );
  lines.push("");

  // 1. Ratchet summary
  lines.push("## 1. Ratchet Summary");
  lines.push("");
  lines.push("| Metric | Ratchet | Actual | Diff |");
  lines.push("| --- | ---: | ---: | :---: |");
  lines.push(
    `| **A. Cross-file duplicate CSS patterns** | ${ratchetCssCount} | ${actualCssCount} | \`${formatDiff(
      ratchetCssCount,
      actualCssCount
    )}\` |`
  );
  lines.push(
    `| **B. DOM construction/mutation outside \`core/\`** | ${ratchetDomTotal} (${ratchetDomFiles} files) | ${actualDomTotal} (${actualDomFiles} files) | \`${formatDiff(
      ratchetDomTotal,
      actualDomTotal
    )}\` |`
  );
  lines.push(
    `| **C. String-selector calls outside \`core/\`** | ${ratchetSelectorTotal} (${ratchetSelectorFiles} files) | ${actualSelectorTotal} (${actualSelectorFiles} files) | \`${formatDiff(
      ratchetSelectorTotal,
      actualSelectorTotal
    )}\` |`
  );
  lines.push("");

  if (!comparison.passed) {
    lines.push("### Ratchet Violations");
    lines.push("");
    lines.push("```text");
    lines.push(formatRatchetFailures(comparison));
    lines.push("```");
    lines.push("");
  }

  // 2. CSS duplicates
  lines.push("## 2. Cross-File Duplicate CSS Blocks");
  lines.push("");
  if (activePatterns.length === 0) {
    lines.push("_No non-allowlisted cross-file duplicate CSS patterns._");
    lines.push("");
  } else {
    for (const pattern of activePatterns) {
      renderPatternMarkdown(pattern, lines);
    }
  }

  lines.push("### Allowlisted CSS Duplicate Patterns");
  lines.push("");
  const allowlistIds = Object.keys(allowlist).sort();
  if (allowlistIds.length === 0) {
    lines.push("_No allowlisted CSS duplicate patterns._");
    lines.push("");
  } else {
    const byId = new Map(allowlistedPatterns.map((p) => [p.id, p]));
    for (const id of allowlistIds) {
      const entry = allowlist[id];
      const matched = byId.get(id);
      if (matched) {
        renderPatternMarkdown(matched, lines, entry.reason);
      } else {
        lines.push(
          `### Pattern \`${id}\` (allowlisted, not currently matched)`
        );
        lines.push("");
        lines.push(
          `- **Files:** ${entry.files.map((f) => `\`${f}\``).join(", ")}`
        );
        lines.push(`- **Allowlist reason:** ${entry.reason}`);
        lines.push("");
      }
    }
  }

  // 3. DOM construction/mutation outside core/
  lines.push("## 3. Client DOM Construction / Mutation Outside `core/`");
  lines.push("");
  const domFiles = Object.keys(
    analysis.domMutationOutsideCore.callsPerFile
  ).sort();
  if (domFiles.length === 0) {
    lines.push("_No DOM construction or mutation calls outside `core/`._");
    lines.push("");
  } else {
    const byFile = new Map<string, CallSiteCitation[]>();
    for (const c of analysis.domMutationOutsideCore.citations) {
      let list = byFile.get(c.file);
      if (!list) {
        list = [];
        byFile.set(c.file, list);
      }
      list.push(c);
    }
    for (const file of domFiles) {
      const fileCalls = byFile.get(file) ?? [];
      lines.push(`### \`${file}\` (${fileCalls.length})`);
      lines.push("");
      for (const c of fileCalls) {
        lines.push(
          `- \`${c.file}:${c.line}\` — **\`${c.method}\`**: \`${c.snippet}\``
        );
      }
      lines.push("");
    }
  }

  // 4. Selector hotspots
  lines.push("## 4. String-Selector Hotspots Outside `core/`");
  lines.push("");
  const selectorEntries = Object.entries(
    analysis.selectorCalls.callsPerFile
  ).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  if (selectorEntries.length === 0) {
    lines.push("_No string-selector calls outside `core/`._");
    lines.push("");
  } else {
    const byFile = new Map<string, CallSiteCitation[]>();
    for (const c of analysis.selectorCalls.citations) {
      let list = byFile.get(c.file);
      if (!list) {
        list = [];
        byFile.set(c.file, list);
      }
      list.push(c);
    }

    for (const [file, count] of selectorEntries) {
      const fileCalls = byFile.get(file) ?? [];
      const byMethod = new Map<string, number>();
      for (const c of fileCalls) {
        byMethod.set(c.method, (byMethod.get(c.method) ?? 0) + 1);
      }
      const breakdown = [...byMethod.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([method, n]) => `\`${method}\`: ${n}`)
        .join(", ");

      lines.push(`### \`${file}\` (${count} total — ${breakdown})`);
      lines.push("");
      for (const c of fileCalls) {
        lines.push(
          `- \`${c.file}:${c.line}\` — **\`${c.method}\`**: \`${c.snippet}\``
        );
      }
      lines.push("");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

/**
 * Formats the terminal summary printed by `npm run inventory`.
 */
export function formatInventoryTerminalSummary(
  ratchet: InventoryRatchet,
  analysis: InventoryAnalysis,
  comparison: RatchetComparisonResult,
  reportPath: string
): string {
  const allowlist = ratchet.cssDuplicates.allowlist;
  const ratchetCss = Object.keys(ratchet.cssDuplicates.patterns).filter(
    (id) => !(id in allowlist)
  ).length;
  const actualCss = analysis.cssDuplicates.filter(
    (p) => !(p.id in allowlist)
  ).length;

  const ratchetDom = sumRecordValues(
    ratchet.domMutationOutsideCore.callsPerFile
  );
  const actualDom = analysis.domMutationOutsideCore.totalCalls;

  const ratchetSel = sumRecordValues(ratchet.selectorCalls.callsPerFile);
  const actualSel = analysis.selectorCalls.totalCalls;

  const lines: string[] = [
    "UI V2 Cross-Slice Inventory:",
    `  A. CSS duplicate patterns:     ${ratchetCss} → ${actualCss} (${formatDiff(
      ratchetCss,
      actualCss
    )})`,
    `  B. DOM mutations outside core: ${ratchetDom} → ${actualDom} (${formatDiff(
      ratchetDom,
      actualDom
    )})`,
    `  C. Selector calls outside core:${ratchetSel} → ${actualSel} (${formatDiff(
      ratchetSel,
      actualSel
    )})`,
    `  Report written to: ${reportPath}`,
  ];

  if (!comparison.passed) {
    lines.push("");
    lines.push(formatRatchetFailures(comparison));
  }

  return lines.join("\n");
}
