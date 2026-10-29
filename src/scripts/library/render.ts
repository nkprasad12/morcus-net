/**
 * `./morcus.sh library render`: renders every onboarded Perseus work through
 * the production reader pipeline (parse → `processTei2` with patches →
 * `preprocessWorkToV2`, via `preprocessPerseusWorks` in `process_library.ts`)
 * and writes each page's HTML to `.cache/library-render/<label>/` so that two
 * renders can be compared with `library diff`.
 *
 * Layout of a render:
 *
 *     <out>/<label>/index.json                 RenderIndex (below)
 *     <out>/<label>/<workId>/<page>.html       V2PreprocessedPage.singleHtml
 *     <out>/<label>/<workId>/<page>.notes.html .notesHtml (if any)
 *     <out>/<label>/<workId>/<page>.trans.html .translationHtml (if any)
 *     <out>/<label>/<workId>/toc.html          V2PreprocessedWork.tocHtml
 *
 * Nothing is written under `build/`, and the corpus-input side effects of
 * `processLibrary` are not performed.
 */

import { execFileSync } from "child_process";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";

import { envVar } from "@/common/env_vars";
import {
  ALL_SUPPORTED_WORKS,
  EnglishTranslations,
  resolveWorkIdAlias,
} from "@/common/library/library_constants";
import { loadPatches } from "@/common/library/library_patches";
import type { V2PreprocessedWork } from "@/common/library/preprocess/preprocessed_types";
import { preprocessPerseusWorks } from "@/common/library/process_library";
import { surveyFiles } from "@/scripts/library/survey";

export const RENDER_OUT_DEFAULT = ".cache/library-render";
export const RENDER_INDEX = "index.json";
export const RENDER_INDEX_VERSION = 1;

export interface RenderedPage {
  /** Dot-joined page id, e.g. "1.2". */
  id: string;
  /** File stem under the work directory (the id, made filesystem-safe). */
  file: string;
  title: string;
  sectionCount: number;
  citationRange: [string, string];
  /** Short content hashes of each emitted fragment. */
  html: string;
  notes?: string;
  trans?: string;
}

export interface RenderedWork {
  id: string;
  title: string;
  shortTitle?: string;
  author: string;
  urlAuthor: string;
  urlName: string;
  attribution: string;
  license?: string;
  hasTranslation: boolean;
  translator?: string;
  editor?: string;
  textParts: string[];
  paginationDepth: number;
  tocHtmlHash?: string;
  navTreeHash?: string;
  pages: RenderedPage[];
}

export interface RenderIndex {
  version: number;
  label: string;
  createdAt: string;
  root: string;
  latinLitCommit?: string;
  morcusCommit?: string;
  works: Record<string, RenderedWork>;
  /** Works (incl. translations) whose processing threw, with the message. */
  failures: Record<string, string>;
}

export function shortHash(content: string): string {
  return createHash("sha1").update(content).digest("hex").slice(0, 16);
}

/** A filesystem-safe file stem for a page id. */
export function pageFileStem(pageId: string): string {
  const safe = pageId.replace(/[^A-Za-z0-9._-]/g, (c) =>
    c === "." ? c : `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`
  );
  return safe.length === 0 ? "_root" : safe;
}

export function gitShortSha(dir: string): string | undefined {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "--short", "HEAD"], {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

export function workIdOfPath(workPath: string): string {
  return path.basename(workPath).replace(/\.[^/.]+$/, "");
}

export interface SelectWorkPathsOptions {
  /** canonical-latinLit checkout (used when `includeCandidates` is true). */
  root?: string;
  /** Also include non-onboarded `perseus-lat*` candidate works under `root`. */
  includeCandidates?: boolean;
}

/**
 * The repo-relative paths to render: all onboarded works (plus candidate works
 * when `options.includeCandidates` is true), or the requested ones plus their
 * English translations (needed for `translationHtml`).
 */
export function selectWorkPaths(
  works?: string[],
  options?: SelectWorkPathsOptions
): string[] {
  if (options?.includeCandidates) {
    const root = path.resolve(
      options.root ?? envVar("LIB_XML_ROOT", "unsafe") ?? ""
    );
    if (!fs.existsSync(path.join(root, "data"))) {
      throw new Error(
        `No canonical-latinLit checkout at '${root}': pass --root= or set LIB_XML_ROOT.`
      );
    }
    const surveyed = surveyFiles(root);
    const byId = new Map<string, string>();
    for (const f of surveyed) {
      byId.set(f.workId, f.relPath);
    }
    for (const relPath of ALL_SUPPORTED_WORKS) {
      const id = workIdOfPath(relPath);
      if (!byId.has(id) && fs.existsSync(path.join(root, relPath))) {
        byId.set(id, relPath);
      }
    }
    if (works === undefined || works.length === 0) {
      return [...byId.values()];
    }
    const wanted = new Set<string>();
    const requestedIds: string[] = [];
    for (const rawId of works) {
      const id = resolveWorkIdAlias(rawId);
      requestedIds.push(id);
      wanted.add(id);
      const translation = EnglishTranslations[id];
      if (translation !== undefined && byId.has(translation)) {
        wanted.add(translation);
      }
    }
    const missing = requestedIds.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      throw new Error(
        `Work files not found in '${root}': ${missing.join(", ")}`
      );
    }
    return [...byId.entries()]
      .filter(([id]) => wanted.has(id))
      .map(([, relPath]) => relPath);
  }

  if (works === undefined || works.length === 0) {
    return [...ALL_SUPPORTED_WORKS];
  }
  const wanted = new Set<string>();
  for (const id of works) {
    wanted.add(id);
    const translation = EnglishTranslations[id];
    if (translation !== undefined) {
      wanted.add(translation);
    }
  }
  const selected = ALL_SUPPORTED_WORKS.filter((p) =>
    wanted.has(workIdOfPath(p))
  );
  const found = new Set(selected.map(workIdOfPath));
  const missing = [...wanted].filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new Error(`Not onboarded works: ${missing.join(", ")}`);
  }
  return selected;
}

function writeWork(workDir: string, work: V2PreprocessedWork): RenderedWork {
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });
  const pages: RenderedPage[] = [];
  const usedStems = new Set<string>();
  for (const page of work.pages) {
    const id = Array.isArray(page.id) ? page.id.join(".") : page.id;
    let file = pageFileStem(id);
    while (usedStems.has(file.toLowerCase())) {
      file += "_";
    }
    usedStems.add(file.toLowerCase());
    const base = path.join(workDir, file);
    fs.writeFileSync(`${base}.html`, page.singleHtml);
    const rendered: RenderedPage = {
      id,
      file,
      title: page.title,
      sectionCount: page.sectionCount,
      citationRange: page.citationRange,
      html: shortHash(page.singleHtml),
    };
    if (page.notesHtml !== undefined) {
      fs.writeFileSync(`${base}.notes.html`, page.notesHtml);
      rendered.notes = shortHash(page.notesHtml);
    }
    if (page.translationHtml !== undefined) {
      fs.writeFileSync(`${base}.trans.html`, page.translationHtml);
      rendered.trans = shortHash(page.translationHtml);
    }
    pages.push(rendered);
  }
  if (work.tocHtml !== undefined) {
    fs.writeFileSync(path.join(workDir, "toc.html"), work.tocHtml);
  }
  return {
    id: work.id,
    title: work.title,
    shortTitle: work.shortTitle,
    author: work.author,
    urlAuthor: work.urlAuthor,
    urlName: work.urlName,
    attribution: work.attribution,
    license: work.license,
    hasTranslation: work.hasTranslation,
    translator: work.translator,
    editor: work.editor,
    textParts: work.textParts,
    paginationDepth: work.paginationDepth,
    tocHtmlHash:
      work.tocHtml === undefined ? undefined : shortHash(work.tocHtml),
    navTreeHash:
      work.navTree === undefined
        ? undefined
        : shortHash(JSON.stringify(work.navTree)),
    pages,
  };
}

export function readRenderIndex(dir: string): RenderIndex {
  const file = path.join(dir, RENDER_INDEX);
  if (!fs.existsSync(file)) {
    throw new Error(`No render at ${dir} (missing ${RENDER_INDEX})`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export interface RenderOptions {
  /** Output label (default: `<latinLit sha>-<morcus-net sha>`). */
  label?: string;
  /** Work ids to render (default: all onboarded works, or all with `includeCandidates`). */
  works?: string[];
  /** Also include non-onboarded Latin works in `--root` that pass `processTei2`. */
  includeCandidates?: boolean;
  /** canonical-latinLit checkout (default: `$LIB_XML_ROOT`). */
  root?: string;
  /** Output root (default: `.cache/library-render`). */
  out?: string;
  /** Suppress per-work progress lines. */
  quiet?: boolean;
}

export interface RenderResult {
  dir: string;
  index: RenderIndex;
}

/** Renders the library and writes it to `<out>/<label>/`. */
export function renderLibrary(options: RenderOptions = {}): RenderResult {
  const root = path.resolve(
    options.root ?? envVar("LIB_XML_ROOT", "unsafe") ?? ""
  );
  if (!fs.existsSync(path.join(root, "data"))) {
    throw new Error(
      `No canonical-latinLit checkout at '${root}': pass --root= or set LIB_XML_ROOT.`
    );
  }
  const latinLitCommit = gitShortSha(root);
  const morcusCommit = gitShortSha(process.cwd());
  const label =
    options.label ??
    `${latinLitCommit ?? "unknown"}-${morcusCommit ?? "unknown"}`;
  if (label.length === 0 || /[/\\]|^\.\.?$/.test(label)) {
    throw new Error(`Invalid label '${label}'`);
  }
  const outRoot = path.resolve(options.out ?? RENDER_OUT_DEFAULT);
  const dir = path.join(outRoot, label);
  const buildDir = path.resolve("build");
  if (dir === buildDir || dir.startsWith(buildDir + path.sep)) {
    throw new Error(`Refusing to write a render under build/: ${dir}`);
  }

  const relPaths = selectWorkPaths(options.works, {
    root,
    includeCandidates: options.includeCandidates,
  });
  const partial = options.works !== undefined && options.works.length > 0;
  let previous: RenderIndex | undefined = undefined;
  if (partial && fs.existsSync(path.join(dir, RENDER_INDEX))) {
    previous = readRenderIndex(dir);
  } else if (!partial) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });

  const index: RenderIndex = {
    version: RENDER_INDEX_VERSION,
    label,
    createdAt: new Date().toISOString(),
    root,
    latinLitCommit,
    morcusCommit,
    works: { ...(previous?.works ?? {}) },
    failures: { ...(previous?.failures ?? {}) },
  };
  for (const p of relPaths) {
    delete index.failures[workIdOfPath(p)];
  }

  const start = performance.now();
  let done = 0;
  let pageCount = 0;
  let lastTick = performance.now();
  const total = relPaths.length;
  const log = (line: string) => {
    if (!options.quiet) {
      console.log(line);
    }
  };
  const tick = (workId: string, what: string) => {
    done++;
    const now = performance.now();
    log(
      `[${done}/${total}] ${workId}: ${what} (${Math.round(now - lastTick)} ms)`
    );
    lastTick = now;
  };
  log(`Rendering ${total} TEI files from ${root} into ${dir}`);
  preprocessPerseusWorks(
    relPaths.map((p) => path.join(root, p)),
    {
      patches: loadPatches(),
      onProcessed: (work, isTranslation) => {
        if (isTranslation) {
          tick(work.info.workId, "translation");
        }
      },
      onV2Work: (v2) => {
        index.works[v2.id] = writeWork(path.join(dir, v2.id), v2);
        pageCount += v2.pages.length;
        tick(v2.id, `${v2.pages.length} pages`);
      },
      onError: (workId, error) => {
        done++;
        const message = error instanceof Error ? error.message : String(error);
        index.failures[workId] = message.split("\n")[0];
        delete index.works[workId];
        fs.rmSync(path.join(dir, workId), { recursive: true, force: true });
        log(`[${done}/${total}] ${workId} FAILED: ${index.failures[workId]}`);
        lastTick = performance.now();
      },
    }
  );
  const sortedWorks: Record<string, RenderedWork> = {};
  for (const id of Object.keys(index.works).sort()) {
    sortedWorks[id] = index.works[id];
  }
  index.works = sortedWorks;
  fs.writeFileSync(
    path.join(dir, RENDER_INDEX),
    JSON.stringify(index, null, 1) + "\n"
  );
  const failed = Object.keys(index.failures).length;
  console.log(
    `Rendered ${Object.keys(index.works).length} works / ${pageCount} pages ` +
      `(this run) in ${((performance.now() - start) / 1000).toFixed(1)} s` +
      `${failed > 0 ? `; ${failed} FAILED` : ""} → ${dir}`
  );
  return { dir, index };
}

/** Entry point for the `library render` action. */
export async function runRenderCli(options: RenderOptions): Promise<boolean> {
  try {
    renderLibrary(options);
    return true;
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return false;
  }
}

/** Splits a `--works=a,b` value. */
export function parseWorkList(value: string | undefined): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const ids = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length === 0 ? undefined : ids;
}
