/**
 * Playwright's output for the screenshot suite: project names, and how a
 * `*-actual.png` in `test-results/` maps back to a baseline file name.
 *
 * Shared by the Visual Diff Inspector (`visual_diff.ts`, `results` source) and
 * the local baseline store (`local_baselines.ts`, `accept`), so both agree on
 * which baseline an actual belongs to.
 */

import fs from "fs";
import path from "path";
import type { SnapshotSize } from "@/scripts/visual_diff/visual_diff_types";

/**
 * Playwright project names from `playwright.config.ts`, and the form factor
 * each one renders at.
 */
export const PROJECT_SIZES: Record<string, SnapshotSize> = {
  chromium: "large",
  firefox: "large",
  webkit: "large",
  MobileChrome: "small",
  FirefoxSmallScreen: "small",
  MobileSafari: "small",
};

/** Longest first, so `FirefoxSmallScreen` wins over `firefox`. */
export const KNOWN_PROJECTS = Object.keys(PROJECT_SIZES).sort(
  (a, b) => b.length - a.length
);

export function sizeForProject(project: string): SnapshotSize {
  return PROJECT_SIZES[project] ?? "unknown";
}

/** Returns the Playwright project encoded in a `test-results` directory name. */
export function projectFromResultsDir(dirName: string): string | undefined {
  const withoutRetry = dirName.replace(/-retry\d+$/, "");
  return KNOWN_PROJECTS.find((p) =>
    withoutRetry.toLowerCase().endsWith(`-${p.toLowerCase()}`)
  );
}

export function safeId(raw: string): string {
  return raw.replace(/[^A-Za-z0-9._-]+/g, "_");
}

/**
 * The baseline file name for a screenshot, following `snapshotPathTemplate`
 * in `playwright.config.ts` (`{arg}{-projectName}{-snapshotSuffix}{ext}`).
 * Playwright's default snapshot suffix is the platform.
 */
export function snapshotNameFor(
  stem: string,
  project: string,
  platform: string = process.platform
): string {
  return `${stem}-${project}-${platform}.png`;
}

/** One `*-actual.png` left in `test-results/` by a failed comparison. */
export interface ResultActual {
  /** Unique per snapshot and project; also used as the viewer's item id. */
  id: string;
  /** The screenshot name without extension, e.g. `about-page-js-light`. */
  stem: string;
  /** The `test-results` directory it came from. */
  dirName: string;
  /** The Playwright project, when the directory name encodes one. */
  project?: string;
  actualPath: string;
  expectedPath?: string;
  diffPath?: string;
  /** The baseline file this actual would replace; needs a known project. */
  snapshotName?: string;
}

/**
 * Lists the actuals in `resultsDir`, one per snapshot and project. With
 * retries, later attempts overwrite earlier ones.
 */
export function scanResultActuals(
  resultsDir: string,
  platform: string = process.platform
): ResultActual[] {
  const absDir = path.resolve(resultsDir);
  if (!fs.existsSync(absDir)) {
    return [];
  }
  const byId = new Map<string, ResultActual>();
  const dirs = fs
    .readdirSync(absDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const dirName of dirs) {
    const dir = path.join(absDir, dirName);
    const project = projectFromResultsDir(dirName);
    for (const file of fs.readdirSync(dir)) {
      const match = file.match(/^(.*)-actual\.png$/);
      if (match === null) {
        continue;
      }
      const stem = match[1];
      const expected = path.join(dir, `${stem}-expected.png`);
      const diff = path.join(dir, `${stem}-diff.png`);
      const id = safeId(`${stem}-${project ?? dirName}`);
      byId.set(id, {
        id,
        stem,
        dirName,
        project,
        actualPath: path.join(dir, file),
        expectedPath: fs.existsSync(expected) ? expected : undefined,
        diffPath: fs.existsSync(diff) ? diff : undefined,
        snapshotName:
          project === undefined
            ? undefined
            : snapshotNameFor(stem, project, platform),
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}
