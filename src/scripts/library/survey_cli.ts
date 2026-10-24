/** Entry point for `./morcus.sh library survey`. */

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

import type { AuditSource } from "@/common/library/audit/audit_types";
import { envVar } from "@/common/env_vars";
import { loadPatches } from "@/common/library/library_patches";
import { surveyCorpus, surveyMarkdown } from "@/scripts/library/survey";
import {
  censusSnapshot,
  fingerprintManifest,
  toJson,
  writeAuditFiles,
} from "@/scripts/library/survey_snapshot";

export const SURVEY_OUT_ROOT = ".cache/library-survey";

export interface SurveyCliArgs {
  root?: string;
  label?: string;
  out?: string;
  writeSnapshot: boolean;
  only?: string;
}

function git(cwd: string, ...args: string[]): string | undefined {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

/** The commit (and dirtiness) of the corpus checkout at `root`. */
export function corpusSource(root: string): AuditSource {
  const commit = git(root, "rev-parse", "HEAD") ?? "unknown";
  const status = git(root, "status", "--porcelain", "--untracked-files=no");
  return {
    repo: "canonical-latinLit",
    commit,
    dirty: status === undefined ? false : status.length > 0,
  };
}

/** `<corpus short sha>-<morcus-net short sha>`, with `-dirty` markers. */
export function defaultLabel(root: string, source: AuditSource): string {
  const corpus = source.commit.slice(0, 8) + (source.dirty ? "-dirty" : "");
  const morcus = git(".", "rev-parse", "--short=8", "HEAD") ?? "unknown";
  return `${corpus}-${morcus}`;
}

export async function runSurveyCli(args: SurveyCliArgs): Promise<boolean> {
  const root = args.root ?? envVar("LIB_XML_ROOT", "unsafe");
  if (root === undefined || !fs.existsSync(path.join(root, "data"))) {
    console.error(
      `library survey: no corpus at '${root}'. Pass --root=<canonical-latinLit checkout> or set LIB_XML_ROOT.`
    );
    return false;
  }
  if (args.writeSnapshot && args.only !== undefined) {
    console.error(
      "library survey: --write-snapshot cannot be used with --only."
    );
    return false;
  }
  const source = corpusSource(root);
  const label = args.label ?? defaultLabel(root, source);
  const outDir = path.join(args.out ?? SURVEY_OUT_ROOT, label);
  console.log(`Surveying ${root} (${source.commit.slice(0, 8)}) -> ${outDir}`);

  const start = Date.now();
  const result = surveyCorpus(root, {
    only: args.only,
    patches: loadPatches(),
    onProgress: (done, total) => {
      if (done % 50 === 0 || done === total) {
        console.log(
          `  ${done}/${total} (${((Date.now() - start) / 1000).toFixed(0)}s)`
        );
      }
    },
  });

  fs.mkdirSync(outDir, { recursive: true });
  const markdown = surveyMarkdown(result, label);
  fs.writeFileSync(
    path.join(outDir, "survey.json"),
    toJson({ label, source, works: result.works })
  );
  fs.writeFileSync(path.join(outDir, "survey.md"), markdown);
  fs.writeFileSync(
    path.join(outDir, "manifest.json"),
    toJson(fingerprintManifest(result, source))
  );
  fs.writeFileSync(
    path.join(outDir, "census.json"),
    toJson(censusSnapshot(result, source))
  );

  const ok = result.works.filter((w) => w.v1.ok).length;
  const onboarded = result.works.filter((w) => w.onboarded);
  const onboardedOk = onboarded.filter((w) => w.v1.ok).length;
  console.log(
    `${result.works.length} files, ${ok} V1 OK; onboarded ${onboardedOk}/${onboarded.length} OK.`
  );
  console.log(
    `Wrote ${outDir}/{survey.json,survey.md,manifest.json,census.json}`
  );

  if (args.writeSnapshot) {
    if (source.dirty) {
      console.warn(
        `Warning: ${root} has uncommitted changes; the snapshot records dirty: true.`
      );
    }
    const written = writeAuditFiles(result, source);
    // The repo's `prettier --check .` covers these files.
    execFileSync("node_modules/.bin/prettier", ["--write", ...written], {
      stdio: "ignore",
    });
    for (const file of written) console.log(`Wrote ${file}`);
  }
  return true;
}
