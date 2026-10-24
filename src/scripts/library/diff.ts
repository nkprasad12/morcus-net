/**
 * `./morcus.sh library diff --from=<label> --to=<label>`: compares two renders
 * written by `library render` and reports, per work, the pages added, removed
 * and changed, with an HTML-aware summary of what changed (see diff_html.ts).
 *
 * Writes `<out>/diffs/<from>__<to>/report.{md,json}` and prints the markdown.
 */

import fs from "fs";
import path from "path";

import {
  mergeDelta,
  summarizePageDiff,
  type CountDelta,
  type PageDiffSummary,
} from "@/scripts/library/diff_html";
import {
  RENDER_OUT_DEFAULT,
  readRenderIndex,
  type RenderIndex,
  type RenderedPage,
  type RenderedWork,
} from "@/scripts/library/render";

export type Fragment = "html" | "notes" | "trans";
const FRAGMENTS: Fragment[] = ["html", "notes", "trans"];
const FRAGMENT_SUFFIX: Record<Fragment, string> = {
  html: ".html",
  notes: ".notes.html",
  trans: ".trans.html",
};

/** Work-level fields compared verbatim (hashes stand in for big blobs). */
const WORK_FIELDS = [
  "title",
  "shortTitle",
  "author",
  "urlAuthor",
  "urlName",
  "attribution",
  "license",
  "hasTranslation",
  "translator",
  "editor",
  "textParts",
  "paginationDepth",
  "navTreeHash",
  "tocHtmlHash",
] as const;
const PAGE_FIELDS = ["title", "sectionCount", "citationRange"] as const;

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface FragmentChange {
  page: string;
  fragment: Fragment | "toc";
  summary: PageDiffSummary;
}

export interface WorkDiff {
  id: string;
  status: "same" | "changed" | "added" | "removed" | "failed" | "fixed";
  /** Failure message on the side(s) where the work failed. */
  failure?: { from?: string; to?: string };
  fields: FieldChange[];
  addedPages: string[];
  removedPages: string[];
  /** True if the common pages appear in a different order. */
  pageOrderChanged: boolean;
  /** Page metadata (title, section count, citation range) changes. */
  pageFieldChanges: { page: string; changes: FieldChange[] }[];
  /** Pages with at least one fragment whose normal form changed. */
  changedPages: string[];
  /** Fragments whose bytes differ but normal forms are equal. */
  cosmeticOnly: number;
  /** Fragments whose text (tags dropped) changed. */
  textChanged: number;
  tags: CountDelta;
  classes: CountDelta;
  attrs: CountDelta;
  /** Hunk counts by pattern (see `hunkSignature`). */
  patterns: CountDelta;
  /** All changed fragments (hunks capped per fragment). */
  fragments: FragmentChange[];
}

export interface DiffReport {
  from: string;
  to: string;
  fromMeta: Omit<RenderIndex, "works" | "failures">;
  toMeta: Omit<RenderIndex, "works" | "failures">;
  totals: {
    works: number;
    worksDiffering: number;
    pagesCompared: number;
    pagesChanged: number;
    pagesAdded: number;
    pagesRemoved: number;
    cosmeticOnly: number;
  };
  tags: CountDelta;
  classes: CountDelta;
  attrs: CountDelta;
  patterns: CountDelta;
  works: WorkDiff[];
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function fieldChanges<T extends object>(
  a: T,
  b: T,
  fields: readonly (keyof T & string)[]
): FieldChange[] {
  return fields
    .filter((f) => !same(a[f], b[f]))
    .map((f) => ({ field: f, from: a[f], to: b[f] }));
}

function readOptional(file: string): string | undefined {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined;
}

function emptyWorkDiff(id: string, status: WorkDiff["status"]): WorkDiff {
  return {
    id,
    status,
    fields: [],
    addedPages: [],
    removedPages: [],
    pageOrderChanged: false,
    pageFieldChanges: [],
    changedPages: [],
    cosmeticOnly: 0,
    textChanged: 0,
    tags: {},
    classes: {},
    attrs: {},
    patterns: {},
    fragments: [],
  };
}

function addSummary(
  diff: WorkDiff,
  page: string,
  fragment: FragmentChange["fragment"],
  summary: PageDiffSummary
): boolean {
  if (!summary.changed) {
    if (summary.rawChanged) {
      diff.cosmeticOnly++;
    }
    return false;
  }
  if (summary.textChanged) {
    diff.textChanged++;
  }
  mergeDelta(diff.tags, summary.tags);
  mergeDelta(diff.classes, summary.classes);
  mergeDelta(diff.attrs, summary.attrs);
  mergeDelta(diff.patterns, summary.patterns);
  diff.fragments.push({ page, fragment, summary });
  return true;
}

/** Compares one work present (and rendered) on both sides. */
export function diffWork(
  fromDir: string,
  toDir: string,
  a: RenderedWork,
  b: RenderedWork
): WorkDiff {
  const diff = emptyWorkDiff(a.id, "same");
  diff.fields = fieldChanges(a, b, WORK_FIELDS);
  if (a.tocHtmlHash !== b.tocHtmlHash) {
    addSummary(
      diff,
      "(toc)",
      "toc",
      summarizePageDiff(
        readOptional(path.join(fromDir, a.id, "toc.html")),
        readOptional(path.join(toDir, b.id, "toc.html"))
      )
    );
  }
  const aPages = new Map(a.pages.map((p) => [p.id, p]));
  const bPages = new Map(b.pages.map((p) => [p.id, p]));
  diff.removedPages = a.pages.filter((p) => !bPages.has(p.id)).map((p) => p.id);
  diff.addedPages = b.pages.filter((p) => !aPages.has(p.id)).map((p) => p.id);
  const aCommon = a.pages.filter((p) => bPages.has(p.id)).map((p) => p.id);
  const bCommon = b.pages.filter((p) => aPages.has(p.id)).map((p) => p.id);
  diff.pageOrderChanged = !same(aCommon, bCommon);

  for (const id of aCommon) {
    const pa: RenderedPage = aPages.get(id)!;
    const pb: RenderedPage = bPages.get(id)!;
    const changes = fieldChanges(pa, pb, PAGE_FIELDS);
    if (changes.length > 0) {
      diff.pageFieldChanges.push({ page: id, changes });
    }
    let pageChanged = false;
    for (const fragment of FRAGMENTS) {
      if (pa[fragment] === pb[fragment]) {
        continue;
      }
      const suffix = FRAGMENT_SUFFIX[fragment];
      const before =
        pa[fragment] === undefined
          ? undefined
          : readOptional(path.join(fromDir, a.id, pa.file + suffix));
      const after =
        pb[fragment] === undefined
          ? undefined
          : readOptional(path.join(toDir, b.id, pb.file + suffix));
      const summary = summarizePageDiff(before, after);
      pageChanged = addSummary(diff, id, fragment, summary) || pageChanged;
    }
    if (pageChanged) {
      diff.changedPages.push(id);
    }
  }
  const differs =
    diff.fields.length > 0 ||
    diff.addedPages.length > 0 ||
    diff.removedPages.length > 0 ||
    diff.pageOrderChanged ||
    diff.pageFieldChanges.length > 0 ||
    diff.fragments.length > 0;
  diff.status = differs ? "changed" : "same";
  return diff;
}

function meta(index: RenderIndex): DiffReport["fromMeta"] {
  const { works: _w, failures: _f, ...rest } = index;
  return rest;
}

/** Compares two render directories. */
export function diffRenders(
  fromDir: string,
  toDir: string,
  labels?: { from: string; to: string }
): DiffReport {
  const a = readRenderIndex(fromDir);
  const b = readRenderIndex(toDir);
  const ids = [
    ...new Set([
      ...Object.keys(a.works),
      ...Object.keys(b.works),
      ...Object.keys(a.failures),
      ...Object.keys(b.failures),
    ]),
  ].sort();
  const report: DiffReport = {
    from: labels?.from ?? a.label,
    to: labels?.to ?? b.label,
    fromMeta: meta(a),
    toMeta: meta(b),
    totals: {
      works: ids.length,
      worksDiffering: 0,
      pagesCompared: 0,
      pagesChanged: 0,
      pagesAdded: 0,
      pagesRemoved: 0,
      cosmeticOnly: 0,
    },
    tags: {},
    classes: {},
    attrs: {},
    patterns: {},
    works: [],
  };
  for (const id of ids) {
    const wa = a.works[id];
    const wb = b.works[id];
    const fa = a.failures[id];
    const fb = b.failures[id];
    let diff: WorkDiff;
    if (wa !== undefined && wb !== undefined) {
      diff = diffWork(fromDir, toDir, wa, wb);
      report.totals.pagesCompared += wa.pages.length;
    } else if (fa !== undefined || fb !== undefined) {
      if (fa !== undefined && fb !== undefined) {
        diff = emptyWorkDiff(id, fa === fb ? "same" : "failed");
      } else {
        diff = emptyWorkDiff(id, fb !== undefined ? "failed" : "fixed");
        if (wb !== undefined) {
          diff.addedPages = wb.pages.map((p) => p.id);
        }
        if (wa !== undefined) {
          diff.removedPages = wa.pages.map((p) => p.id);
        }
      }
      diff.failure = { from: fa, to: fb };
    } else if (wb !== undefined) {
      diff = emptyWorkDiff(id, "added");
      diff.addedPages = wb.pages.map((p) => p.id);
    } else {
      diff = emptyWorkDiff(id, "removed");
      diff.removedPages = wa!.pages.map((p) => p.id);
    }
    if (diff.status !== "same") {
      report.totals.worksDiffering++;
    }
    report.totals.pagesChanged += diff.changedPages.length;
    report.totals.pagesAdded += diff.addedPages.length;
    report.totals.pagesRemoved += diff.removedPages.length;
    report.totals.cosmeticOnly += diff.cosmeticOnly;
    mergeDelta(report.tags, diff.tags);
    mergeDelta(report.classes, diff.classes);
    mergeDelta(report.attrs, diff.attrs);
    mergeDelta(report.patterns, diff.patterns);
    report.works.push(diff);
  }
  return report;
}

export function reportDiffers(report: DiffReport): boolean {
  return report.totals.worksDiffering > 0;
}

function formatDelta(d: CountDelta, max = 12): string {
  const entries = Object.entries(d).sort(
    (x, y) => Math.abs(y[1]) - Math.abs(x[1]) || (x[0] < y[0] ? -1 : 1)
  );
  if (entries.length === 0) {
    return "—";
  }
  const shown = entries
    .slice(0, max)
    .map(([k, v]) => `\`${k}\` ${v > 0 ? "+" : ""}${v}`);
  if (entries.length > max) {
    shown.push(`… (${entries.length - max} more)`);
  }
  return shown.join(", ");
}

function formatPatterns(d: CountDelta, max: number, indent = ""): string[] {
  return Object.entries(d)
    .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))
    .slice(0, max)
    .map(([sig, n]) => `${indent}${String(n).padStart(6)}× ${sig}`);
}

function listIds(ids: string[], max = 10): string {
  const shown = ids.slice(0, max).map((id) => `\`${id}\``);
  if (ids.length > max) {
    shown.push(`… (${ids.length - max} more)`);
  }
  return shown.join(", ");
}

function inlineCode(s: string): string {
  // Backtick-safe inline code span.
  const ticks = s.includes("`") ? "``" : "`";
  return `${ticks} ${s} ${ticks}`;
}

export interface FormatOptions {
  /** Sample hunks shown per work. */
  hunksPerWork?: number;
}

/** Renders a report as markdown. */
export function formatReport(
  report: DiffReport,
  options: FormatOptions = {}
): string {
  const { hunksPerWork = 3 } = options;
  const t = report.totals;
  const lines: string[] = [];
  lines.push(`# Library render diff: \`${report.from}\` → \`${report.to}\``);
  lines.push("");
  const side = (m: DiffReport["fromMeta"]) =>
    `latinLit \`${m.latinLitCommit ?? "?"}\`, morcus-net \`${
      m.morcusCommit ?? "?"
    }\`, rendered ${m.createdAt}`;
  lines.push(`- **from**: ${side(report.fromMeta)}`);
  lines.push(`- **to**: ${side(report.toMeta)}`);
  lines.push("");
  if (!reportDiffers(report)) {
    lines.push(
      `**No differences** across ${t.works} works / ${t.pagesCompared} pages` +
        (t.cosmeticOnly > 0
          ? ` (${t.cosmeticOnly} fragments differ only cosmetically: attribute order, entities).`
          : ".")
    );
    return lines.join("\n") + "\n";
  }
  lines.push(
    `**${t.worksDiffering} of ${t.works} works differ.** Pages: ` +
      `${t.pagesChanged} changed, ${t.pagesAdded} added, ${t.pagesRemoved} removed ` +
      `(of ${t.pagesCompared} compared); ${t.cosmeticOnly} fragments cosmetic-only.`
  );
  lines.push("");
  lines.push(`- Tags: ${formatDelta(report.tags)}`);
  lines.push(`- Classes: ${formatDelta(report.classes)}`);
  lines.push(`- Attributes: ${formatDelta(report.attrs)}`);
  const topPatterns = formatPatterns(report.patterns, 10);
  if (topPatterns.length > 0) {
    lines.push("");
    lines.push("Most common change patterns (digits shown as `#`):");
    lines.push("");
    lines.push("```text");
    lines.push(...topPatterns);
    lines.push("```");
  }
  lines.push("");
  lines.push("| Work | Status | Changed | Added | Removed | Text changed |");
  lines.push("| ---- | ------ | ------: | ----: | ------: | -----------: |");
  const differing = report.works.filter((w) => w.status !== "same");
  for (const w of differing) {
    lines.push(
      `| \`${w.id}\` | ${w.status} | ${w.changedPages.length} | ` +
        `${w.addedPages.length} | ${w.removedPages.length} | ${w.textChanged} |`
    );
  }
  for (const w of differing) {
    lines.push("");
    lines.push(`## \`${w.id}\` — ${w.status}`);
    lines.push("");
    if (w.failure !== undefined) {
      if (w.failure.from !== undefined) {
        lines.push(`- failed in from: ${inlineCode(w.failure.from)}`);
      }
      if (w.failure.to !== undefined) {
        lines.push(`- failed in to: ${inlineCode(w.failure.to)}`);
      }
    }
    for (const f of w.fields) {
      const show = (v: unknown) =>
        inlineCode(v === undefined ? "undefined" : JSON.stringify(v));
      lines.push(`- \`${f.field}\`: ${show(f.from)} → ${show(f.to)}`);
    }
    if (w.addedPages.length > 0) {
      lines.push(`- added pages: ${listIds(w.addedPages)}`);
    }
    if (w.removedPages.length > 0) {
      lines.push(`- removed pages: ${listIds(w.removedPages)}`);
    }
    if (w.pageOrderChanged) {
      lines.push("- page order changed");
    }
    if (w.pageFieldChanges.length > 0) {
      const first = w.pageFieldChanges[0];
      lines.push(
        `- page metadata changed on ${w.pageFieldChanges.length} pages, e.g. ` +
          `\`${first.page}\`: ` +
          first.changes
            .map(
              (c) =>
                `${c.field} ${inlineCode(
                  JSON.stringify(c.from)
                )} → ${inlineCode(JSON.stringify(c.to))}`
            )
            .join("; ")
      );
    }
    if (w.changedPages.length > 0) {
      lines.push(`- changed pages: ${listIds(w.changedPages)}`);
      lines.push(`- tags: ${formatDelta(w.tags)}`);
      lines.push(`- classes: ${formatDelta(w.classes)}`);
      lines.push(`- attributes: ${formatDelta(w.attrs)}`);
    }
    const patterns = formatPatterns(w.patterns, 5);
    if (patterns.length > 1) {
      lines.push("- patterns:");
      lines.push("");
      lines.push("```text");
      lines.push(...patterns);
      lines.push("```");
    }
    // Samples: prefer one per distinct pattern.
    const allSamples = w.fragments.flatMap((f) =>
      f.summary.tooLarge
        ? [{ f, text: "(too many changes to diff)", sig: "(too large)" }]
        : f.summary.hunks.map((h) => ({ f, text: h.text, sig: h.signature }))
    );
    const seen = new Set<string>();
    const distinct = allSamples.filter((x) => {
      const fresh = !seen.has(x.sig);
      seen.add(x.sig);
      return fresh;
    });
    const distinctSet = new Set(distinct);
    const samples = [
      ...distinct,
      ...allSamples.filter((x) => !distinctSet.has(x)),
    ].slice(0, hunksPerWork);
    if (samples.length > 0) {
      lines.push("");
      lines.push("```text");
      for (const s of samples) {
        lines.push(`[${s.f.page} ${s.f.fragment}] ${s.text}`);
      }
      lines.push("```");
    }
  }
  return lines.join("\n") + "\n";
}

export interface DiffOptions {
  from: string;
  to: string;
  /** Render root (default: `.cache/library-render`). */
  out?: string;
  /** Exit successfully even if the renders differ. */
  allowDiff?: boolean;
  /** Print only the summary lines, not the whole report. */
  quiet?: boolean;
}

/** Entry point for the `library diff` action. */
export async function runDiffCli(options: DiffOptions): Promise<boolean> {
  try {
    const outRoot = path.resolve(options.out ?? RENDER_OUT_DEFAULT);
    const report = diffRenders(
      path.join(outRoot, options.from),
      path.join(outRoot, options.to),
      { from: options.from, to: options.to }
    );
    const reportDir = path.join(
      outRoot,
      "diffs",
      `${options.from}__${options.to}`
    );
    fs.mkdirSync(reportDir, { recursive: true });
    const markdown = formatReport(report);
    fs.writeFileSync(path.join(reportDir, "report.md"), markdown);
    fs.writeFileSync(
      path.join(reportDir, "report.json"),
      JSON.stringify(report, null, 1) + "\n"
    );
    console.log(
      options.quiet ? markdown.split("\n").slice(0, 8).join("\n") : markdown
    );
    console.log(`Report: ${reportDir}/report.{md,json}`);
    return options.allowDiff === true || !reportDiffers(report);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return false;
  }
}
