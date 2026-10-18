/* istanbul ignore file */

import * as fs from "fs";
import * as path from "path";
import { analyzeRepoInventory } from "@/web/v2/tools/inventory/inventory_analyzer";
import {
  DEFAULT_RATCHET_PATH,
  buildRatchetFromAnalysis,
  compareInventoryRatchet,
  readInventoryRatchet,
  writeInventoryRatchet,
  type CssAllowlistEntry,
} from "@/web/v2/tools/inventory/inventory_ratchet";
import {
  formatInventoryTerminalSummary,
  renderInventoryReportMarkdown,
} from "@/web/v2/tools/inventory/inventory_reporter";

const DEFAULT_REPORT_PATH = ".cache/inventory/report.md";

interface InventoryCliOptions {
  readonly repoRoot?: string;
  readonly ratchetPath?: string;
  readonly reportPath?: string;
  readonly update?: boolean;
}

function parseInventoryCliArgs(argv: readonly string[]): InventoryCliOptions {
  let update = false;
  let reportPath = DEFAULT_REPORT_PATH;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--update" || arg === "-u") {
      update = true;
    } else if (arg === "--report" || arg === "-r") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error(`Missing value for ${arg}`);
      }
      reportPath = next;
      i++;
    } else if (arg.startsWith("--report=")) {
      reportPath = arg.slice("--report=".length);
    }
  }

  return { update, reportPath };
}

/**
 * Executes the inventory CLI workflow and returns `true` if the ratchet passes
 * (or was updated), or `false` on any regression or stale entry.
 */
export function runInventoryCli(options: InventoryCliOptions = {}): boolean {
  const repoRoot = options.repoRoot ?? process.cwd();
  const ratchetRelPath = options.ratchetPath ?? DEFAULT_RATCHET_PATH;
  const reportRelPath = options.reportPath ?? DEFAULT_REPORT_PATH;
  const update = Boolean(options.update);

  const analysis = analyzeRepoInventory(repoRoot);

  let existingAllowlist: Readonly<Record<string, CssAllowlistEntry>> = {};
  const ratchetAbsPath = path.resolve(repoRoot, ratchetRelPath);
  if (fs.existsSync(ratchetAbsPath)) {
    const existing = readInventoryRatchet(repoRoot, ratchetRelPath);
    existingAllowlist = existing.cssDuplicates.allowlist;
  }

  if (update) {
    const updatedRatchet = buildRatchetFromAnalysis(
      analysis,
      existingAllowlist
    );
    writeInventoryRatchet(updatedRatchet, repoRoot, ratchetRelPath);
  }

  const ratchet = readInventoryRatchet(repoRoot, ratchetRelPath);
  const comparison = compareInventoryRatchet(ratchet, analysis);

  const reportAbsPath = path.resolve(repoRoot, reportRelPath);
  fs.mkdirSync(path.dirname(reportAbsPath), { recursive: true });
  const markdown = renderInventoryReportMarkdown(ratchet, analysis, comparison);
  fs.writeFileSync(reportAbsPath, markdown, "utf8");

  console.log(
    formatInventoryTerminalSummary(ratchet, analysis, comparison, reportRelPath)
  );

  return comparison.passed;
}

if (require.main === module) {
  try {
    const cliOptions = parseInventoryCliArgs(process.argv.slice(2));
    const ok = runInventoryCli(cliOptions);
    if (!ok) {
      process.exit(1);
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
