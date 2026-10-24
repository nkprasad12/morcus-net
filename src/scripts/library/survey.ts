/**
 * `./morcus.sh library survey`: one pass over every Perseus Latin TEI file in
 * a canonical-latinLit checkout (plus the other onboarded Perseus files),
 * collecting V1 status, header facts, a markup census and, for works V1 can
 * process, a fingerprint of its output.
 *
 * Hypotactic and PHI works are out of scope: they don't come from TEI.
 */

import fs from "fs";
import path from "path";

import type {
  WorkCensus,
  WorkFingerprint,
} from "@/common/library/audit/audit_types";
import {
  ALL_SUPPORTED_WORKS,
  EnglishTranslations,
} from "@/common/library/library_constants";
import type { LibraryPatchMap } from "@/common/library/library_patches";
import { isKnownRend } from "@/common/library/perseus_rends";
import { processTei2 } from "@/common/library/process_work";
import { XmlNode } from "@/common/xml/xml_node";
import { parseRawXml } from "@/common/xml/xml_utils";
import {
  byCount,
  categorizeV1Error,
  censusOfBody,
  fingerprintOf,
  firstLineOf,
  headerFacts,
  inc,
  outputChecks,
  stripProlog,
  workCensusEntry,
  type BodyCensus,
  type Counter,
  type HeaderFacts,
  type OutputChecks,
} from "@/scripts/library/survey_census";

/** Which rule put a file in the survey. */
export type SurveyScope = "perseus-lat" | "onboarded-other";

export interface SurveyFile {
  workId: string;
  /** Relative to the corpus root. */
  relPath: string;
  absPath: string;
  scope: SurveyScope;
}

export interface V1Status {
  ok: boolean;
  /** `OK`, or the error bucket from `categorizeV1Error`. */
  category: string;
  /** First line of the error message (truncated), or empty. */
  detail: string;
}

/** Census counters as plain objects (sorted by count) for survey.json. */
export interface CensusCounts {
  elements: Record<string, number>;
  noteElements: Record<string, number>;
  rends: Record<string, number>;
  noteRends: Record<string, number>;
  attrs: Record<string, number>;
  noteAttrs: Record<string, number>;
  milestoneUnits: Record<string, number>;
  divTypes: Record<string, number>;
  leafDepths: Record<string, number>;
  textpartNoN: number;
  textChars: number;
}

export interface WorkSurvey {
  workId: string;
  path: string;
  scope: SurveyScope;
  onboarded: boolean;
  bytes: number;
  /** Set if the file could not be parsed as XML at all. */
  parseError?: string;
  v1: V1Status;
  header?: HeaderFacts;
  census?: CensusCounts;
  /** Only for works V1 processes. */
  fingerprint?: WorkFingerprint;
  /** Only for works V1 processes. */
  checks?: OutputChecks;
}

export interface SurveyResult {
  root: string;
  works: WorkSurvey[];
  /** Per-work census entries, for census.json and the snapshot. */
  census: Record<string, WorkCensus>;
}

const ONBOARDED_PATHS = new Set(ALL_SUPPORTED_WORKS);

/** Work id of an onboarded relative path, e.g. `data/a/b/a.b.perseus-lat2.xml`. */
function workIdOf(relPath: string): string {
  return path.basename(relPath).replace(/\.xml$/, "");
}

/** The files the survey covers, sorted by relative path. */
export function surveyFiles(root: string): SurveyFile[] {
  const data = path.join(root, "data");
  const byPath = new Map<string, SurveyFile>();
  for (const group of fs.readdirSync(data).sort()) {
    const groupDir = path.join(data, group);
    if (!fs.statSync(groupDir).isDirectory()) continue;
    for (const work of fs.readdirSync(groupDir).sort()) {
      const workDir = path.join(groupDir, work);
      if (!fs.statSync(workDir).isDirectory()) continue;
      for (const file of fs.readdirSync(workDir).sort()) {
        if (!/\.perseus-lat\d*\.xml$/.test(file)) continue;
        const relPath = ["data", group, work, file].join("/");
        byPath.set(relPath, {
          workId: workIdOf(relPath),
          relPath,
          absPath: path.join(root, relPath),
          scope: "perseus-lat",
        });
      }
    }
  }
  for (const relPath of ALL_SUPPORTED_WORKS) {
    if (byPath.has(relPath)) continue;
    const absPath = path.join(root, relPath);
    if (!fs.existsSync(absPath)) continue;
    byPath.set(relPath, {
      workId: workIdOf(relPath),
      relPath,
      absPath,
      scope: "onboarded-other",
    });
  }
  return [...byPath.values()].sort((a, b) =>
    a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0
  );
}

function countsOf(c: BodyCensus): CensusCounts {
  return {
    elements: byCount(c.elements),
    noteElements: byCount(c.noteElements),
    rends: byCount(c.rends),
    noteRends: byCount(c.noteRends),
    attrs: byCount(c.attrs),
    noteAttrs: byCount(c.noteAttrs),
    milestoneUnits: byCount(c.milestoneUnits),
    divTypes: byCount(c.divTypes),
    leafDepths: byCount(c.leafDepths),
    textpartNoN: c.textpartNoN,
    textChars: c.textChars,
  };
}

function errorParts(e: unknown): [string, string] {
  if (e instanceof Error) return [e.message, e.stack ?? ""];
  return [String(e), ""];
}

/** Surveys one TEI file given its raw contents. */
export function surveyWork(
  file: Pick<SurveyFile, "workId" | "relPath" | "scope">,
  raw: string,
  patches?: LibraryPatchMap
): { survey: WorkSurvey; census?: WorkCensus } {
  const onboarded = ONBOARDED_PATHS.has(file.relPath);
  const base = {
    workId: file.workId,
    path: file.relPath,
    scope: file.scope,
    onboarded,
    bytes: Buffer.byteLength(raw),
  };
  const stripped = stripProlog(raw);
  const parse = () => parseRawXml(stripped, { keepWhitespace: true });
  let tei: XmlNode;
  try {
    tei = parse();
  } catch (e) {
    const detail = firstLineOf(errorParts(e)[0]).slice(0, 120);
    return {
      survey: {
        ...base,
        parseError: detail,
        v1: { ok: false, category: "xml: parse error", detail },
      },
    };
  }
  // Census first: V1 mutates the tree it is given, so it gets its own parse.
  const body = tei.findDescendants("body")[0] ?? new XmlNode("body");
  const census = censusOfBody(body);
  const survey: WorkSurvey = {
    ...base,
    v1: { ok: true, category: "OK", detail: "" },
    header: headerFacts(tei),
    census: countsOf(census),
  };
  try {
    const work = processTei2(
      parse(),
      { workId: file.workId, translationId: EnglishTranslations[file.workId] },
      { patches: patches?.get(file.workId) }
    );
    survey.fingerprint = fingerprintOf(work);
    survey.checks = outputChecks(work);
  } catch (e) {
    const [message, stack] = errorParts(e);
    survey.v1 = {
      ok: false,
      category: categorizeV1Error(message, stack),
      detail: firstLineOf(message).slice(0, 120),
    };
  }
  return {
    survey,
    census: workCensusEntry(census, file.relPath, onboarded),
  };
}

export interface SurveyOptions {
  /** Only survey work ids containing this substring. */
  only?: string;
  patches?: LibraryPatchMap;
  /** Called after each file, for progress output. */
  onProgress?: (done: number, total: number, workId: string) => void;
}

export function surveyCorpus(
  root: string,
  options?: SurveyOptions
): SurveyResult {
  const files = surveyFiles(root).filter(
    (f) => options?.only === undefined || f.workId.includes(options.only)
  );
  const works: WorkSurvey[] = [];
  const census: Record<string, WorkCensus> = {};
  files.forEach((file, i) => {
    const raw = fs.readFileSync(file.absPath, "utf8");
    const result = surveyWork(file, raw, options?.patches);
    works.push(result.survey);
    if (result.census !== undefined) census[file.workId] = result.census;
    options?.onProgress?.(i + 1, files.length, file.workId);
  });
  return { root, works, census };
}

// ---------------------------------------------------------------------------
// Markdown report.

interface Tally {
  works: Counter;
  occurrences: Counter;
}

function tally(
  works: WorkSurvey[],
  pick: (c: CensusCounts) => Record<string, number>
): Tally {
  const t: Tally = { works: new Map(), occurrences: new Map() };
  for (const w of works) {
    if (w.census === undefined) continue;
    for (const [k, n] of Object.entries(pick(w.census))) {
      inc(t.works, k);
      inc(t.occurrences, k, n);
    }
  }
  return t;
}

function sortedByWorks(t: Tally): string[] {
  return [...t.works.keys()].sort(
    (a, b) =>
      t.works.get(b)! - t.works.get(a)! ||
      t.occurrences.get(b)! - t.occurrences.get(a)! ||
      (a < b ? -1 : 1)
  );
}

/** Attributes too common to be worth a row in the attribute table. */
const COMMON_ATTRS = new Set(["n", "type", "subtype", "rend", "xml:lang"]);

export function surveyMarkdown(result: SurveyResult, label: string): string {
  const lines: string[] = [];
  const P = (s = "") => lines.push(s);
  const works = result.works;
  const onboarded = works.filter((w) => w.onboarded);
  const ok = works.filter((w) => w.v1.ok);
  const code = (s: string) => `\`${s.replaceAll("|", "\\|")}\``;

  P(`# Library survey: ${label}`);
  P();
  P(`Corpus root: \`${result.root}\``);
  P();
  P(`## V1 status`);
  P();
  P(`| | Files | V1 OK |`);
  P(`| --- | ---: | ---: |`);
  P(`| All surveyed | ${works.length} | ${ok.length} |`);
  P(
    `| Onboarded | ${onboarded.length} | ${
      onboarded.filter((w) => w.v1.ok).length
    } |`
  );
  P(
    `| Not onboarded | ${works.length - onboarded.length} | ${
      ok.length - onboarded.filter((w) => w.v1.ok).length
    } |`
  );
  P();
  const missing = ALL_SUPPORTED_WORKS.filter(
    (p) => !works.some((w) => w.path === p)
  );
  if (missing.length > 0 && result.works.length > 0) {
    P(`> [!WARNING]`);
    P(`> Onboarded files missing from this checkout: ${missing.length}`);
    P();
    for (const m of missing) P(`- ${code(m)}`);
    P();
  }
  const brokenOnboarded = onboarded.filter((w) => !w.v1.ok);
  if (brokenOnboarded.length > 0) {
    P(`> [!CAUTION]`);
    P(`> Onboarded works that V1 fails on: ${brokenOnboarded.length}`);
    P();
    for (const w of brokenOnboarded) {
      P(`- ${code(w.workId)}: ${w.v1.category} — ${w.v1.detail}`);
    }
    P();
  }
  const buckets: Counter = new Map();
  for (const w of works) if (!w.v1.ok) inc(buckets, w.v1.category);
  P(`### First error, by bucket`);
  P();
  P(`| Bucket | Files |`);
  P(`| --- | ---: |`);
  for (const [k, v] of Object.entries(byCount(buckets))) {
    P(`| ${k.replaceAll("|", "\\|")} | ${v} |`);
  }
  P();

  P(`### Output checks (works V1 processes)`);
  P();
  P(`| Check | Failing works | Of which onboarded |`);
  P(`| --- | ---: | ---: |`);
  const checkNames = ["hasCitableRow", "arityOk", "pagesOrdered"] as const;
  for (const name of checkNames) {
    const failing = ok.filter((w) => w.checks?.[name] === false);
    P(
      `| ${name} | ${failing.length} | ${
        failing.filter((w) => w.onboarded).length
      } |`
    );
  }
  P();
  for (const name of checkNames) {
    const failing = ok.filter((w) => w.onboarded && w.checks?.[name] === false);
    if (failing.length === 0) continue;
    P(
      `Onboarded works failing \`${name}\`: ${failing
        .map((w) => code(w.workId))
        .join(", ")}`
    );
    P();
  }

  P(`## Markup census (inside \`<body>\`)`);
  P();
  const elems = tally(works, (c) => c.elements);
  const noteElems = tally(works, (c) => c.noteElements);
  P(`### Elements outside notes`);
  P();
  P(`| Element | Files | Occurrences | Onboarded files |`);
  P(`| --- | ---: | ---: | ---: |`);
  const onboardedElems = tally(onboarded, (c) => c.elements);
  for (const k of sortedByWorks(elems)) {
    P(
      `| ${code(k)} | ${elems.works.get(k)} | ${elems.occurrences.get(k)} | ${
        onboardedElems.works.get(k) ?? 0
      } |`
    );
  }
  P();
  P(`### Elements inside notes`);
  P();
  P(`| Element | Files | Occurrences |`);
  P(`| --- | ---: | ---: |`);
  for (const k of sortedByWorks(noteElems)) {
    P(
      `| ${code(k)} | ${noteElems.works.get(k)} | ${noteElems.occurrences.get(
        k
      )} |`
    );
  }
  P();
  const rends = tally(works, (c) => c.rends);
  P(`### element@rend outside notes`);
  P();
  P(`| element@rend | Files | Occurrences | \`isKnownRend\` |`);
  P(`| --- | ---: | ---: | --- |`);
  for (const k of sortedByWorks(rends)) {
    const rend = k.slice(k.indexOf("@") + 1);
    P(
      `| ${code(k)} | ${rends.works.get(k)} | ${rends.occurrences.get(k)} | ${
        isKnownRend(rend) ? "yes" : "**no**"
      } |`
    );
  }
  P();
  const noteRends = tally(works, (c) => c.noteRends);
  P(`### element@rend inside notes`);
  P();
  P(`| element@rend | Files | Occurrences |`);
  P(`| --- | ---: | ---: |`);
  for (const k of sortedByWorks(noteRends)) {
    P(
      `| ${code(k)} | ${noteRends.works.get(k)} | ${noteRends.occurrences.get(
        k
      )} |`
    );
  }
  P();
  for (const [title, pick] of [
    ["outside notes", (c: CensusCounts) => c.attrs],
    ["inside notes", (c: CensusCounts) => c.noteAttrs],
  ] as const) {
    const attrs = tally(works, pick);
    P(`### element@attr ${title} (excluding ${[...COMMON_ATTRS].join(", ")})`);
    P();
    P(`| element@attr | Files | Occurrences |`);
    P(`| --- | ---: | ---: |`);
    for (const k of sortedByWorks(attrs)) {
      if (COMMON_ATTRS.has(k.slice(k.indexOf("@") + 1))) continue;
      P(`| ${code(k)} | ${attrs.works.get(k)} | ${attrs.occurrences.get(k)} |`);
    }
    P();
  }
  const units = tally(works, (c) => c.milestoneUnits);
  P(`### Milestone units`);
  P();
  P(`| unit | Files | Occurrences |`);
  P(`| --- | ---: | ---: |`);
  for (const k of sortedByWorks(units)) {
    P(`| ${code(k)} | ${units.works.get(k)} | ${units.occurrences.get(k)} |`);
  }
  P();
  const divs = tally(works, (c) => c.divTypes);
  P(`### div type/subtype`);
  P();
  P(`| type/subtype | Files | Occurrences |`);
  P(`| --- | ---: | ---: |`);
  for (const k of sortedByWorks(divs)) {
    P(`| ${code(k)} | ${divs.works.get(k)} | ${divs.occurrences.get(k)} |`);
  }
  P();
  const depthShapes: Counter = new Map();
  for (const w of works) {
    if (w.census === undefined) continue;
    const depths = Object.keys(w.census.leafDepths).sort();
    inc(depthShapes, depths.length === 0 ? "(none)" : depths.join("+"));
  }
  P(`### Textpart leaf depths (per file: the set of depths its leaves sit at)`);
  P();
  P(`| Depths | Files |`);
  P(`| --- | ---: |`);
  for (const [k, v] of Object.entries(byCount(depthShapes)))
    P(`| ${k} | ${v} |`);
  P();

  P(`## Header / structure facts`);
  P();
  const withHeader = works.filter((w) => w.header !== undefined);
  const cnt = (f: (h: HeaderFacts, w: WorkSurvey) => boolean) =>
    withHeader.filter((w) => f(w.header!, w)).length;
  P(`| Fact | Files |`);
  P(`| --- | ---: |`);
  P(`| no \`<author>\` in titleStmt | ${cnt((h) => !h.hasAuthor)} |`);
  P(`| no \`<title>\` in titleStmt | ${cnt((h) => !h.hasTitle)} |`);
  for (const n of [0, 1, 2]) {
    P(`| ${n} refsDecl | ${cnt((h) => h.refsDeclCount === n)} |`);
  }
  P(`| 3+ refsDecl | ${cnt((h) => h.refsDeclCount >= 3)} |`);
  P(`| ≥2 non-CTS refsDecl | ${cnt((h) => h.nonCtsRefsDeclCount >= 2)} |`);
  P(`| has \`<citeStructure>\` | ${cnt((h) => h.hasCiteStructure)} |`);
  P(`| has \`<front>\` | ${cnt((h) => h.hasFront)} |`);
  P(`| has \`<back>\` | ${cnt((h) => h.hasBack)} |`);
  P(`| body count ≠ 1 | ${cnt((h) => h.bodyCount !== 1)} |`);
  P(
    `| textpart div(s) without @n | ${cnt(
      (_, w) => w.census!.textpartNoN > 0
    )} |`
  );
  P(
    `| non-uniform textpart leaf depth | ${cnt(
      (_, w) => Object.keys(w.census!.leafDepths).length > 1
    )} |`
  );
  P(
    `| unparseable XML | ${
      works.filter((w) => w.parseError !== undefined).length
    } |`
  );
  P();
  const langs: Counter = new Map();
  const licences: Counter = new Map();
  for (const w of withHeader) {
    inc(langs, w.header!.language ?? "(none)");
    inc(licences, w.header!.licence ?? "(none)");
  }
  P(`| text/@xml:lang | Files |`);
  P(`| --- | ---: |`);
  for (const [k, v] of Object.entries(byCount(langs)))
    P(`| ${code(k)} | ${v} |`);
  P();
  P(`| \`<licence>\` | Files |`);
  P(`| --- | ---: |`);
  for (const [k, v] of Object.entries(byCount(licences))) {
    P(`| ${k.slice(0, 100).replaceAll("|", "\\|")} | ${v} |`);
  }
  P();

  const chars = (ws: WorkSurvey[]) =>
    ws.reduce((s, w) => s + (w.census?.textChars ?? 0), 0);
  const total = chars(works);
  P(`## Size`);
  P();
  P(
    `Non-whitespace body characters: ${total.toLocaleString("en-US")} total; ` +
      `${chars(ok).toLocaleString("en-US")} in V1-OK files ` +
      `(${total === 0 ? 0 : ((100 * chars(ok)) / total).toFixed(1)}%); ` +
      `${chars(onboarded).toLocaleString("en-US")} onboarded.`
  );
  P();
  P(`## Per-file status`);
  P();
  P(
    `| Work | Onboarded | V1 | Rows | Pages | Citable | Outside pages | Range |`
  );
  P(`| --- | --- | --- | ---: | ---: | ---: | ---: | --- |`);
  for (const w of works) {
    const f = w.fingerprint;
    P(
      `| ${code(w.workId)} | ${w.onboarded ? "yes" : ""} | ${
        w.v1.ok ? "OK" : w.v1.category.replaceAll("|", "\\|")
      } | ` +
        `${f?.rows ?? ""} | ${f?.pages ?? ""} | ${f?.citableRows ?? ""} | ` +
        `${w.checks?.rowsOutsidePages ?? ""} | ` +
        `${
          f === undefined
            ? ""
            : `${f.firstCitation ?? "?"} – ${f.lastCitation ?? "?"}`
        } |`
    );
  }
  P();
  return lines.join("\n");
}
