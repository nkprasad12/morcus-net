/* istanbul ignore file */

/**
 * Onboards works from thelatinlibrary.com into $THELATINLIBRARY_ROOT:
 *
 *   raw/<page>         the HTML exactly as fetched (+ <page>.meta.json)
 *   works/<id>.json    the converted work (read by process_thelatinlibrary.ts)
 *   manifest.json      source URL, retrieval date, hash and checks per page
 *
 * Usage:
 *   npm run tsnp src/scripts/thelatinlibrary/onboard.ts -- [--refetch] [--cltk <dir>] [workId...]
 *
 * Without --refetch, an existing raw/<page> is reused so conversion is
 * reproducible offline. --cltk points at a clone of cltk/lat_text_latin_library
 * for an independent cross-check of the extracted text.
 */

import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { envVar } from "@/common/env_vars";
import { toAuthorCode } from "@/common/library/corpus/corpus_library_utils";
import type { CitationStyle } from "@/common/library/library_types";
import {
  convertTheLatinLibraryWork,
  THE_LATIN_LIBRARY_ROOT_ENV,
  type TheLatinLibraryWork,
} from "@/common/library/process_thelatinlibrary";
import { convertBracketedChapters } from "@/scripts/thelatinlibrary/bracketed_chapters";
import { convertDeclamation } from "@/scripts/thelatinlibrary/declamation";
import { convertDigestBook } from "@/scripts/thelatinlibrary/digest";
import { convertGaiusCommentary } from "@/scripts/thelatinlibrary/gaius";
import {
  convertJustinBook,
  convertJustinPraefatio,
  convertTrogusPrologi,
} from "@/scripts/thelatinlibrary/justin";
import {
  crossCheck,
  findProvenanceStatements,
} from "@/scripts/thelatinlibrary/checks";
import type { PageConversion } from "@/scripts/thelatinlibrary/page";

interface PageSpec {
  /** Path on thelatinlibrary.com, e.g. `justin/11.html`. */
  page: string;
  convert: (html: string) => PageConversion;
  /** Path of the same text in the CLTK dump, for the cross-check. */
  cltkPath?: string;
  /**
   * Exact-string fixes applied to the raw HTML before conversion, for
   * typos on the site. Each `from` must occur exactly once.
   */
  patches?: [from: string, to: string, why: string][];
}

interface WorkSpec {
  workId: string;
  author: string;
  title: string;
  textParts: string[];
  citationStyle?: CitationStyle;
  /** Reader page depth, when not one level above the leaf. */
  pageDepth?: number;
  pages: PageSpec[];
}

const BASE_URL = "https://www.thelatinlibrary.com/";
const MIN_CROSS_CHECK = 0.95;
/** Politeness delay between page fetches (Decision #9: >= 2000 ms). */
const FETCH_DELAY_MS = 2000;

/** Declamationes Maiores on the site: 1-19 except 3, which is lost there. */
const DECLAMATIONS = Array.from({ length: 19 }, (_, i) => i + 1).filter(
  (n) => n !== 3
);
const JUSTIN_BOOKS = Array.from({ length: 44 }, (_, i) => i + 1);
const DIGEST_PATCHES: Record<number, [string, string, string][]> = {
  48: [
    [
      "<B>Dig. 48.1.0. De publicis iudiciis.</B>\n</P>\n\n<P>\n Macer",
      "<B>Dig. 48.1.0. De publicis iudiciis.</B>\n</P>\n\n<P>Dig. 48.1.1</P>\n\n<P>\n Macer",
      "citation of 48.1.1 missing before its inscription",
    ],
  ],
  50: [
    [
      "<B>Dig. 50.1.0. Ad municipalem et de incolis.</B>\n</P>\n\n<P>\nUlpianus",
      "<B>Dig. 50.1.0. Ad municipalem et de incolis.</B>\n</P>\n\n<P>Dig. 50.1.1pr.</P>\n\n<P>\nUlpianus",
      "citation of 50.1.1pr missing before its inscription (50.1.1.1 follows)",
    ],
  ],
};
const JUSTIN_PATCHES: Record<number, [string, string, string][]> = {
  13: [
    ["putares; I1 quippe", "putares; 11 quippe", "section number typed as I1"],
  ],
  21: [
    [
      "<FONT SIZE=2>l0</FONT>",
      "<FONT SIZE=2>10</FONT>",
      "section number typed as l0",
    ],
  ],
  24: [
    [
      "convenere. 8, Prius",
      "convenere. 8 Prius",
      "stray comma after a section number",
    ],
  ],
  28: [
    [
      "supervenit<FONT size=2>8</FONT>",
      "supervenit <FONT size=2>8</FONT>",
      "no space before a section number",
    ],
  ],
  29: [
    [
      "rex I1lyriorum",
      "rex Illyriorum",
      "digit 1 for the letter l in Illyriorum",
    ],
  ],
  44: [["LIBER XIVL", "LIBER XLIV", "book number misprinted as XIVL"]],
};

const WORKS: WorkSpec[] = [
  {
    workId: "thelatinlibrary-augustus-resgestae",
    author: "Augustus",
    title: "Res Gestae Divi Augusti",
    textParts: ["chapter"],
    pages: [
      {
        page: "resgestae.html",
        convert: convertBracketedChapters,
        cltkPath: "resgestae.txt",
      },
    ],
  },
  {
    workId: "thelatinlibrary-quintilian-declamationesmaiores",
    // Grouped with the Institutio Oratoria; the attribution is ancient but
    // doubtful, as the title page of every edition notes.
    author: "Quintilian",
    title: "Declamationes Maiores",
    textParts: ["declamation", "section"],
    pages: DECLAMATIONS.map((n) => ({
      page: `quintilian/quintilian.decl.mai${n}.shtml`,
      convert: (html: string) => convertDeclamation(html, n),
      cltkPath: `quintilian/quintilian.decl.mai${n}.txt`,
    })),
  },
  {
    workId: "thelatinlibrary-justin-epitoma",
    author: "Justin",
    title: "Epitoma Historiarum Philippicarum Pompei Trogi",
    // Sections are not used: the site's section numbers are missing from
    // books 1-7 and 13 and inconsistent elsewhere (see justin.ts).
    textParts: ["book", "chapter"],
    pages: [
      {
        page: "justin/praefatio.html",
        convert: convertJustinPraefatio,
        cltkPath: "justin/praefatio.txt",
      },
      ...JUSTIN_BOOKS.map((n) => ({
        page: `justin/${n}.html`,
        convert: (html: string) => convertJustinBook(html, n),
        cltkPath: `justin/${n}.txt`,
        patches: JUSTIN_PATCHES[n],
      })),
    ],
  },
  {
    workId: "thelatinlibrary-gaius-institutiones",
    author: "Gaius",
    title: "Institutiones",
    textParts: ["commentarius", "section"],
    citationStyle: "roman_law",
    pages: [1, 2, 3, 4].map((n) => ({
      page: `gaius${n}.html`,
      convert: (html: string) => convertGaiusCommentary(html, n),
      cltkPath: `gaius${n}.txt`,
    })),
  },
  {
    workId: "thelatinlibrary-justinian-digesta",
    author: "Justinian",
    title: "Digesta",
    textParts: ["book", "title", "lex", "paragraph"],
    citationStyle: "roman_law",
    // One reader page per title, not per law (about 9,000 laws).
    pageDepth: 2,
    pages: Array.from({ length: 50 }, (_, i) => i + 1).map((n) => ({
      page: `justinian/digest${n}.shtml`,
      convert: (html: string) => convertDigestBook(html, n),
      cltkPath: `justinian/digest${n}.txt`,
      patches: DIGEST_PATCHES[n],
    })),
  },
  {
    workId: "thelatinlibrary-trogus-prologi",
    author: "Pompeius Trogus",
    title: "Prologi Historiarum Philippicarum",
    textParts: ["book"],
    pages: [
      {
        page: "justin/prologi.html",
        convert: convertTrogusPrologi,
        cltkPath: "justin/prologi.txt",
      },
    ],
  },
];

interface ManifestEntry {
  url: string;
  retrieved: string;
  sha256: string;
  workId: string;
  provenance: "noStatement" | "statementFound";
  provenanceStatements: string[];
  checks: string[];
}

/** Retrieval record written next to each raw page when it is fetched. */
interface RawMeta {
  url: string;
  retrieved: string;
}

async function loadRaw(root: string, page: string, refetch: boolean) {
  const rawPath = path.join(root, "raw", page);
  const metaPath = `${rawPath}.meta.json`;
  if (!refetch && fs.existsSync(rawPath) && fs.existsSync(metaPath)) {
    const meta: RawMeta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    return { bytes: fs.readFileSync(rawPath), retrieved: meta.retrieved };
  }
  const url = BASE_URL + page;
  console.log(`Fetching ${url}`);
  await new Promise((r) => setTimeout(r, FETCH_DELAY_MS));
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const meta: RawMeta = {
    url,
    retrieved: new Date().toISOString().slice(0, 10),
  };
  fs.mkdirSync(path.dirname(rawPath), { recursive: true });
  fs.writeFileSync(rawPath, bytes);
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
  return { bytes, retrieved: meta.retrieved };
}

async function onboard(
  root: string,
  spec: WorkSpec,
  refetch: boolean,
  cltkDir?: string
) {
  const rows: TheLatinLibraryWork["rows"] = [];
  const manifestUpdates: Record<string, ManifestEntry> = {};
  const retrievedDates = new Set<string>();
  const workHash = createHash("sha256");
  for (const pageSpec of spec.pages) {
    const { bytes, retrieved } = await loadRaw(root, pageSpec.page, refetch);
    retrievedDates.add(retrieved);
    workHash.update(bytes);
    const label = pageSpec.page;
    let html = bytes.toString("utf8");
    const patchChecks: string[] = [];
    for (const [from, to, why] of pageSpec.patches ?? []) {
      const count = html.split(from).length - 1;
      if (count !== 1) {
        throw new Error(`${label}: patch '${from}' matched ${count} times.`);
      }
      html = html.replace(from, to);
      patchChecks.push(`patch: '${from}' -> '${to}' (${why})`);
    }
    let result: PageConversion;
    try {
      result = pageSpec.convert(html);
    } catch (e) {
      throw new Error(`${label}: ${e instanceof Error ? e.message : e}`, {
        cause: e,
      });
    }

    const provenanceStatements = findProvenanceStatements(result.bodyText);
    if (provenanceStatements.length > 0) {
      throw new Error(
        `${label}: page names a source/edition; review before onboarding:\n  ${provenanceStatements.join(
          "\n  "
        )}`
      );
    }
    const checks = [
      ...patchChecks,
      ...result.report,
      "provenance: no edition, copyright or permission statement",
    ];
    if (cltkDir !== undefined && pageSpec.cltkPath !== undefined) {
      const reference = fs.readFileSync(
        path.join(cltkDir, pageSpec.cltkPath),
        "utf8"
      );
      const { oursInRef, refInOurs } = crossCheck(result.rows, reference);
      const line = `cltk: ${(oursInRef * 100).toFixed(
        1
      )}% of our 5-grams in CLTK, ${(refInOurs * 100).toFixed(
        1
      )}% of CLTK's in ours`;
      if (oursInRef < MIN_CROSS_CHECK) {
        throw new Error(`${label}: cross-check failed (${line})`);
      }
      checks.push(line);
    }
    rows.push(...result.rows);
    manifestUpdates[pageSpec.page] = {
      url: BASE_URL + pageSpec.page,
      retrieved,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      workId: spec.workId,
      provenance: "noStatement",
      provenanceStatements,
      checks,
    };
  }

  const isMultiPage = spec.pages.length > 1;
  const work: TheLatinLibraryWork = {
    workId: spec.workId,
    author: spec.author,
    title: spec.title,
    source: {
      // Multi-page works link the author's index page on the site.
      url: isMultiPage
        ? BASE_URL + spec.pages[0].page.split("/")[0] + ".html"
        : BASE_URL + spec.pages[0].page,
      retrieved: [...retrievedDates].sort().at(-1)!,
      sha256: workHash.digest("hex"),
      statedEdition: null,
    },
    textParts: spec.textParts,
    rows,
  };
  if (spec.citationStyle !== undefined) work.citationStyle = spec.citationStyle;
  if (spec.pageDepth !== undefined) work.pageDepth = spec.pageDepth;
  // Work-level checks (unique ids, valid depths, every row on a reader page)
  // are the processor's own; run them now so a bad conversion never lands.
  convertTheLatinLibraryWork(work);
  // The corpus needs a short code for multi-word author names.
  toAuthorCode(work.author);

  const worksDir = path.join(root, "works");
  fs.mkdirSync(worksDir, { recursive: true });
  fs.writeFileSync(
    path.join(worksDir, `${spec.workId}.json`),
    JSON.stringify(work, null, 1) + "\n"
  );
  const manifestPath = path.join(root, "manifest.json");
  const manifest: Record<string, ManifestEntry & Record<string, unknown>> =
    fs.existsSync(manifestPath)
      ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
      : {};
  for (const [page, entry] of Object.entries(manifestUpdates)) {
    manifest[page] = {
      ...manifest[page],
      ...entry,
    };
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  console.log(
    `${spec.workId}: ${spec.pages.length} page(s) -> ${work.rows.length} rows`
  );
  for (const [page, entry] of Object.entries(manifestUpdates)) {
    if (spec.pages.length <= 3) {
      console.log(`  ${page}`);
      entry.checks.forEach((c) => console.log(`    ✓ ${c}`));
    }
  }
  const reviews = Object.values(manifestUpdates).flatMap((e) =>
    e.checks.filter((c) => c.startsWith("review:"))
  );
  reviews.forEach((r) => console.log(`  ? ${r}`));
  if (spec.pages.length > 3) {
    const cltk = Object.values(manifestUpdates)
      .flatMap((e) => e.checks.filter((c) => c.startsWith("cltk:")))
      .map((c) => Number(/([\d.]+)% of our/.exec(c)?.[1]));
    console.log(
      `  ✓ all ${spec.pages.length} pages passed structure, text-loss and provenance checks`
    );
    if (cltk.length > 0) {
      console.log(
        `  ✓ cltk: min ${Math.min(...cltk).toFixed(
          1
        )}% of our 5-grams in CLTK across ${cltk.length} pages`
      );
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const refetch = args.includes("--refetch");
  const cltkIdx = args.indexOf("--cltk");
  const cltkDir = cltkIdx >= 0 ? args[cltkIdx + 1] : undefined;
  const ids = args.filter(
    (a, i) => !a.startsWith("--") && args[i - 1] !== "--cltk"
  );
  const root = envVar(THE_LATIN_LIBRARY_ROOT_ENV);
  const specs =
    ids.length === 0 ? WORKS : WORKS.filter((w) => ids.includes(w.workId));
  if (specs.length === 0) {
    throw new Error(`No known work for: ${ids.join(", ")}`);
  }
  for (const spec of specs) {
    await onboard(root, spec, refetch, cltkDir);
  }
}

void main();
