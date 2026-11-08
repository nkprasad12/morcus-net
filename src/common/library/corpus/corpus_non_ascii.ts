import fs from "fs";
import path from "path";

import { assert } from "@/common/assert";
import type { CorpusInputWork } from "@/common/library/corpus/corpus_common";
import { latinWorksFromLibrary } from "@/common/library/corpus/corpus_library_utils";
import { normalizeCorpusToken } from "@/common/library/corpus/corpus_normalization";
import { processTokens } from "@/common/text_cleaning";

export const NON_ASCII_RATCHET_SCHEMA_VERSION = 1;

export const DEFAULT_NON_ASCII_RATCHET_PATH =
  "src/common/library/corpus/non_ascii_ratchet.json";
export const DEFAULT_NON_ASCII_REPORT_DIR = ".cache/corpus-non-ascii";

export const NON_ASCII_CATEGORIES = [
  "latinCombiningMarks",
  "greek",
  "editorialBracketsAndPunctuation",
  "corrupted",
  "ligaturesAndRomanNumerals",
  "other",
] as const;

export type NonAsciiCategory = (typeof NON_ASCII_CATEGORIES)[number];

export const NON_ASCII_CATEGORY_LABELS: Readonly<
  Record<NonAsciiCategory, string>
> = {
  latinCombiningMarks:
    "Latin with combining marks (ictus, diaeresis, circumflex, underdots, overlines, …)",
  greek: "Greek",
  editorialBracketsAndPunctuation:
    "Editorial brackets and punctuation glued to words",
  corrupted:
    "Corrupted source text (Cyrillic, U+FFFD, â— garbling, accented typos, mixed Greek/Latin look-alikes, stray symbols)",
  ligaturesAndRomanNumerals:
    "Ligatures and Roman numeral codepoints (æ/œ, U+2160–U+217F)",
  other:
    "Other non-ASCII tokens (apostrophus numerals ↄ, ∞, Vitruvius fraction marks)",
};

const COMBINING_MARK_RE = /\p{M}/gu;
const GREEK_BASE_RE = /[\u0370-\u03ff\u1f00-\u1fff]/u;
const ASCII_LATIN_RE = /[a-zA-Z]/;
const CYRILLIC_RE = /[\u0400-\u04ff]/u;
const STRAY_CORRUPTED_RE = /[£©¦˜\ufffd]/u;
const CORRUPTED_LATIN_COMBINING_RE = /[\u0300\u0303\u030a]|a\u0302/iu;
const EDITORIAL_PUNCT_RE = /[〈〉⟨⟩–«»·…§°ʼʽ᾽′]/u;
const LIGATURES_AND_ROMAN_RE = /[æÆœŒ\u2160-\u217f]/u;
const APOSTROPHUS_RE = /\u2184/u;
const ASCII_BRACKET_ONLY_RE = /^[[\]<>()]+$/;

export function makeCategoryRecord<T>(
  fn: (category: NonAsciiCategory) => T
): Record<NonAsciiCategory, T> {
  return {
    latinCombiningMarks: fn("latinCombiningMarks"),
    greek: fn("greek"),
    editorialBracketsAndPunctuation: fn("editorialBracketsAndPunctuation"),
    corrupted: fn("corrupted"),
    ligaturesAndRomanNumerals: fn("ligaturesAndRomanNumerals"),
    other: fn("other"),
  };
}

export function isNonAsciiWord(word: string): boolean {
  for (let i = 0; i < word.length; i++) {
    if (word.charCodeAt(i) > 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Whether `rawNfdWord` (NFD-normalized, lowercased) is a Latin word carrying
 * one of the corrupted combining marks from plan §4b (grave `\u0300`, tilde
 * `\u0303`, ring above `\u030a`, or SHA's `â—` garbling `a\u0302`).
 *
 * Checked both in `categorizeNonAsciiToken` and on the raw NFD token in
 * `analyzeCorpusNonAscii` so that Phase 1's `\p{M}` stripping does not hide
 * these source corruptions before Phase 4 fixes them in upstream TEI.
 */
export function hasCorruptedLatinCombiningMark(rawNfdWord: string): boolean {
  const baseChars = rawNfdWord.replaceAll(COMBINING_MARK_RE, "");
  return (
    !isNonAsciiWord(baseChars) &&
    baseChars.length !== rawNfdWord.length &&
    CORRUPTED_LATIN_COMBINING_RE.test(rawNfdWord)
  );
}

/**
 * Categorizes a non-ASCII normalized corpus token into one of the taxonomy
 * categories from the corpus non-ASCII plan.
 */
export function categorizeNonAsciiToken(word: string): NonAsciiCategory {
  assert(
    isNonAsciiWord(word),
    `Expected non-ASCII word in categorizeNonAsciiToken, got "${word}"`
  );

  const baseChars = word.replaceAll(COMBINING_MARK_RE, "");
  const hasCombiningMark = baseChars.length !== word.length;
  if (!isNonAsciiWord(baseChars) && hasCombiningMark) {
    if (CORRUPTED_LATIN_COMBINING_RE.test(word)) {
      return "corrupted";
    }
    return "latinCombiningMarks";
  }

  if (CYRILLIC_RE.test(baseChars) || STRAY_CORRUPTED_RE.test(word)) {
    return "corrupted";
  }

  if (GREEK_BASE_RE.test(baseChars)) {
    const hasAsciiLatin = ASCII_LATIN_RE.test(baseChars);
    if (
      !hasAsciiLatin ||
      (word.toLowerCase().endsWith("que") &&
        !ASCII_LATIN_RE.test(word.slice(0, -3)))
    ) {
      return "greek";
    }
    return "corrupted";
  }

  if (EDITORIAL_PUNCT_RE.test(word)) {
    return "editorialBracketsAndPunctuation";
  }

  if (!APOSTROPHUS_RE.test(word) && LIGATURES_AND_ROMAN_RE.test(word)) {
    return "ligaturesAndRomanNumerals";
  }

  return "other";
}

export interface NonAsciiWorkSummary {
  readonly workId: string;
  readonly author: string;
  readonly workName: string;
  readonly vocabCount: number;
  readonly tokenCount: number;
  readonly examples: readonly { word: string; count: number }[];
}

export interface NonAsciiCategorySummary {
  readonly category: NonAsciiCategory;
  readonly vocabCount: number;
  readonly tokenCount: number;
  readonly topWords: readonly { word: string; count: number }[];
  readonly perWork: readonly NonAsciiWorkSummary[];
}

export interface NonAsciiAnalysis {
  readonly totalWorks: number;
  readonly totalVocab: number;
  readonly totalTokens: number;
  readonly nonAsciiVocab: number;
  readonly nonAsciiTokens: number;
  readonly intraWordBracketSplits: number;
  readonly vocabCounts: Readonly<Record<NonAsciiCategory, number>>;
  readonly tokenCounts: Readonly<Record<NonAsciiCategory, number>>;
  readonly categories: Readonly<
    Record<NonAsciiCategory, NonAsciiCategorySummary>
  >;
}

export interface NonAsciiRatchet {
  readonly schema: typeof NON_ASCII_RATCHET_SCHEMA_VERSION;
  readonly tokenCounts: Readonly<Record<NonAsciiCategory, number>>;
  readonly intraWordBracketSplits: number;
}

export interface NonAsciiRatchetViolation {
  readonly category: NonAsciiCategory | "intraWordBracketSplits";
  readonly metric: "tokenCounts" | "intraWordBracketSplits";
  readonly kind: "regression" | "stale";
  readonly expected: number;
  readonly actual: number;
  readonly examples: readonly string[];
}

export interface NonAsciiRatchetReport {
  readonly passed: boolean;
  readonly regressions: readonly NonAsciiRatchetViolation[];
  readonly stale: readonly NonAsciiRatchetViolation[];
}

interface MutableCategoryBucket {
  wordCounts: Map<string, number>;
  workWordCounts: Map<
    string,
    {
      author: string;
      workName: string;
      tokenCount: number;
      words: Map<string, number>;
    }
  >;
  tokenCount: number;
}

function recordBucketOccurrence(
  bucket: MutableCategoryBucket,
  work: CorpusInputWork,
  wordKey: string
): void {
  bucket.tokenCount += 1;
  bucket.wordCounts.set(wordKey, (bucket.wordCounts.get(wordKey) ?? 0) + 1);

  let workEntry = bucket.workWordCounts.get(work.id);
  if (workEntry === undefined) {
    workEntry = {
      author: work.author,
      workName: work.workName,
      tokenCount: 0,
      words: new Map(),
    };
    bucket.workWordCounts.set(work.id, workEntry);
  }
  workEntry.tokenCount += 1;
  workEntry.words.set(wordKey, (workEntry.words.get(wordKey) ?? 0) + 1);
}

/**
 * Runs over `works` using the exact same `processTokens` and
 * `normalizeTokenForCorpus` path as `buildCorpus`, categorizing every
 * non-ASCII vocabulary entry without requiring a full corpus build.
 */
export function analyzeCorpusNonAscii(
  works: Iterable<CorpusInputWork>,
  options?: { maxTopWords?: number; maxWorkExamples?: number }
): NonAsciiAnalysis {
  const maxTopWords = options?.maxTopWords ?? 20;
  const maxWorkExamples = options?.maxWorkExamples ?? 8;

  const allVocab = new Set<string>();
  let totalWorks = 0;
  let totalTokens = 0;
  let intraWordBracketSplits = 0;

  const buckets = makeCategoryRecord<MutableCategoryBucket>(() => ({
    wordCounts: new Map(),
    workWordCounts: new Map(),
    tokenCount: 0,
  }));

  const wordCategoryCache = new Map<string, NonAsciiCategory | null>();

  for (const work of works) {
    totalWorks += 1;
    for (const rowText of work.rows) {
      const rowTokens = Array.from(processTokens(rowText));
      for (let idx = 0; idx < rowTokens.length; idx++) {
        const [token, isWord] = rowTokens[idx];
        if (!isWord) {
          if (
            idx > 0 &&
            idx + 1 < rowTokens.length &&
            rowTokens[idx - 1][1] &&
            rowTokens[idx + 1][1] &&
            ASCII_BRACKET_ONLY_RE.test(token)
          ) {
            intraWordBracketSplits += 1;
          }
          continue;
        }
        const stripped = normalizeCorpusToken(token);
        const normalizedWord = stripped.toLowerCase();
        totalTokens += 1;
        allVocab.add(normalizedWord);

        let category = wordCategoryCache.get(normalizedWord);
        if (category === undefined) {
          category = isNonAsciiWord(normalizedWord)
            ? categorizeNonAsciiToken(normalizedWord)
            : null;
          wordCategoryCache.set(normalizedWord, category);
        }
        if (category !== null) {
          recordBucketOccurrence(buckets[category], work, normalizedWord);
          continue;
        }

        // If Phase 1 stripped combining marks from a corrupted source token
        // (e.g. `quàa` -> `quaa`, SHA `commendatâ` -> `commendata`), keep
        // counting the raw NFD form under `corrupted` until Phase 4 fixes the
        // source text.
        if (isNonAsciiWord(token)) {
          const rawNfd = token.normalize("NFD").toLowerCase();
          if (hasCorruptedLatinCombiningMark(rawNfd)) {
            recordBucketOccurrence(buckets.corrupted, work, rawNfd);
          }
        }
      }
    }
  }

  let nonAsciiVocab = 0;
  let nonAsciiTokens = 0;

  const categories = makeCategoryRecord<NonAsciiCategorySummary>((cat) => {
    const bucket = buckets[cat];
    const vocabCount = bucket.wordCounts.size;
    const tokenCount = bucket.tokenCount;
    nonAsciiVocab += vocabCount;
    nonAsciiTokens += tokenCount;

    const topWords = [...bucket.wordCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, maxTopWords)
      .map(([word, count]) => ({ word, count }));

    const perWork: NonAsciiWorkSummary[] = [...bucket.workWordCounts.entries()]
      .sort(
        (a, b) => b[1].tokenCount - a[1].tokenCount || a[0].localeCompare(b[0])
      )
      .map(([workId, info]) => ({
        workId,
        author: info.author,
        workName: info.workName,
        vocabCount: info.words.size,
        tokenCount: info.tokenCount,
        examples: [...info.words.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, maxWorkExamples)
          .map(([word, count]) => ({ word, count })),
      }));

    return {
      category: cat,
      vocabCount,
      tokenCount,
      topWords,
      perWork,
    };
  });

  const vocabCounts = makeCategoryRecord((cat) => categories[cat].vocabCount);
  const tokenCounts = makeCategoryRecord((cat) => categories[cat].tokenCount);

  return {
    totalWorks,
    totalVocab: allVocab.size,
    totalTokens,
    nonAsciiVocab,
    nonAsciiTokens,
    intraWordBracketSplits,
    vocabCounts,
    tokenCounts,
    categories,
  };
}

export function buildNonAsciiRatchet(
  analysis: NonAsciiAnalysis
): NonAsciiRatchet {
  return {
    schema: NON_ASCII_RATCHET_SCHEMA_VERSION,
    tokenCounts: makeCategoryRecord((cat) => analysis.tokenCounts[cat]),
    intraWordBracketSplits: analysis.intraWordBracketSplits,
  };
}

export function serializeNonAsciiRatchet(ratchet: NonAsciiRatchet): string {
  return `${JSON.stringify(
    {
      schema: NON_ASCII_RATCHET_SCHEMA_VERSION,
      tokenCounts: makeCategoryRecord((cat) => ratchet.tokenCounts[cat]),
      intraWordBracketSplits: ratchet.intraWordBracketSplits,
    },
    null,
    2
  )}\n`;
}

export function evaluateNonAsciiRatchet(
  ratchet: NonAsciiRatchet,
  analysis: NonAsciiAnalysis
): NonAsciiRatchetReport {
  const regressions: NonAsciiRatchetViolation[] = [];
  const stale: NonAsciiRatchetViolation[] = [];

  for (const cat of NON_ASCII_CATEGORIES) {
    const summary = analysis.categories[cat];
    const sampleWords = summary.topWords
      .slice(0, 6)
      .map((item) => `${item.word} (${item.count})`);

    const expected = ratchet.tokenCounts[cat];
    const actual = analysis.tokenCounts[cat];
    if (actual > expected) {
      regressions.push({
        category: cat,
        metric: "tokenCounts",
        kind: "regression",
        expected,
        actual,
        examples: sampleWords,
      });
    } else if (actual < expected) {
      stale.push({
        category: cat,
        metric: "tokenCounts",
        kind: "stale",
        expected,
        actual,
        examples: sampleWords,
      });
    }
  }

  if (analysis.intraWordBracketSplits > ratchet.intraWordBracketSplits) {
    regressions.push({
      category: "intraWordBracketSplits",
      metric: "intraWordBracketSplits",
      kind: "regression",
      expected: ratchet.intraWordBracketSplits,
      actual: analysis.intraWordBracketSplits,
      examples: [],
    });
  } else if (analysis.intraWordBracketSplits < ratchet.intraWordBracketSplits) {
    stale.push({
      category: "intraWordBracketSplits",
      metric: "intraWordBracketSplits",
      kind: "stale",
      expected: ratchet.intraWordBracketSplits,
      actual: analysis.intraWordBracketSplits,
      examples: [],
    });
  }

  return {
    passed: regressions.length === 0 && stale.length === 0,
    regressions,
    stale,
  };
}

export function formatNonAsciiRatchetReport(
  report: NonAsciiRatchetReport
): string {
  if (report.passed) {
    return "";
  }
  const lines: string[] = ["Corpus non-ASCII ratchet check failed:"];
  if (report.regressions.length > 0) {
    lines.push(
      `  Non-ASCII count regressions (${report.regressions.length} ceiling(s) exceeded):`
    );
    for (const reg of report.regressions) {
      const ex =
        reg.examples.length > 0 ? ` — e.g. ${reg.examples.join(", ")}` : "";
      lines.push(
        `    - [${reg.metric}] ${reg.category}: ${reg.expected} → ${reg.actual}${ex}`
      );
    }
  }
  if (report.stale.length > 0) {
    lines.push(
      `  Stale non-ASCII ratchet ceilings (${report.stale.length} count(s) dropped — lower the ceiling):`
    );
    for (const st of report.stale) {
      lines.push(
        `    - [${st.metric}] ${st.category}: ${st.expected} → ${st.actual}`
      );
    }
    lines.push("  Run: ./morcus.sh corpus --non_ascii_report --update");
  }
  return lines.join("\n");
}

export function renderNonAsciiMarkdownReport(
  analysis: NonAsciiAnalysis,
  ratchet?: NonAsciiRatchet
): string {
  const lines: string[] = [
    "# Corpus Non-ASCII Vocabulary Report",
    "",
    `- **Works scanned**: ${analysis.totalWorks}`,
    `- **Total vocabulary**: ${analysis.totalVocab.toLocaleString(
      "en-US"
    )} (${analysis.totalTokens.toLocaleString("en-US")} tokens)`,
    `- **Non-ASCII vocabulary**: ${analysis.nonAsciiVocab.toLocaleString(
      "en-US"
    )} (${analysis.nonAsciiTokens.toLocaleString("en-US")} tokens)`,
    `- **Intra-word ASCII bracket splits (\`[]<>()\`)**: ${analysis.intraWordBracketSplits.toLocaleString(
      "en-US"
    )}`,
    "",
    "## Summary by Category",
    "",
    "| Category | Description | Vocab | Tokens | Ceiling (Tokens) | Sample Words |",
    "| :--- | :--- | ---: | ---: | ---: | :--- |",
  ];

  for (const cat of NON_ASCII_CATEGORIES) {
    const summary = analysis.categories[cat];
    const label = NON_ASCII_CATEGORY_LABELS[cat];
    const ceilingStr =
      ratchet === undefined ? "—" : String(ratchet.tokenCounts[cat]);
    const samples = summary.topWords
      .slice(0, 5)
      .map((w) => `\`${w.word}\` (${w.count})`)
      .join(", ");
    lines.push(
      `| \`${cat}\` | ${label} | ${summary.vocabCount} | ${
        summary.tokenCount
      } | ${ceilingStr} | ${samples || "—"} |`
    );
  }

  for (const cat of NON_ASCII_CATEGORIES) {
    const summary = analysis.categories[cat];
    lines.push("");
    lines.push(`## \`${cat}\` — ${NON_ASCII_CATEGORY_LABELS[cat]}`);
    lines.push("");
    lines.push(
      `- **Unique words**: ${summary.vocabCount} | **Total tokens**: ${summary.tokenCount} | **Works affected**: ${summary.perWork.length}`
    );
    if (summary.topWords.length > 0) {
      const topList = summary.topWords
        .map((w) => `\`${w.word}\` (${w.count})`)
        .join(", ");
      lines.push(`- **Top words**: ${topList}`);
    }
    if (summary.perWork.length > 0) {
      lines.push("");
      lines.push("| Work | Vocab | Tokens | Examples |");
      lines.push("| :--- | ---: | ---: | :--- |");
      for (const work of summary.perWork) {
        const ex = work.examples
          .map((w) => `\`${w.word}\` (${w.count})`)
          .join(", ");
        lines.push(
          `| ${work.author} — *${work.workName}* (\`${work.workId}\`) | ${work.vocabCount} | ${work.tokenCount} | ${ex} |`
        );
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

export async function runNonAsciiReportCli(options?: {
  inputDir?: string;
  outDir?: string;
  ratchetPath?: string;
  update?: boolean;
}): Promise<boolean> {
  const outDir = path.resolve(
    process.cwd(),
    options?.outDir ?? DEFAULT_NON_ASCII_REPORT_DIR
  );
  const ratchetPath = path.resolve(
    process.cwd(),
    options?.ratchetPath ?? DEFAULT_NON_ASCII_RATCHET_PATH
  );

  const analysis = analyzeCorpusNonAscii(
    latinWorksFromLibrary(options?.inputDir)
  );
  const newRatchet = buildNonAsciiRatchet(analysis);

  if (options?.update || !fs.existsSync(ratchetPath)) {
    fs.writeFileSync(ratchetPath, serializeNonAsciiRatchet(newRatchet), "utf8");
    console.log(`Updated ${path.relative(process.cwd(), ratchetPath)}`);
  }

  const committedRatchet: NonAsciiRatchet = JSON.parse(
    fs.readFileSync(ratchetPath, "utf8")
  );

  fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, "report.md");
  const countsPath = path.join(outDir, "counts.json");

  fs.writeFileSync(
    reportPath,
    renderNonAsciiMarkdownReport(analysis, committedRatchet),
    "utf8"
  );
  fs.writeFileSync(
    countsPath,
    `${JSON.stringify(analysis, null, 2)}\n`,
    "utf8"
  );

  console.log(
    `Non-ASCII corpus report (${analysis.nonAsciiVocab} vocab, ${analysis.nonAsciiTokens} tokens, ${analysis.intraWordBracketSplits} intra-word bracket splits across ${analysis.totalWorks} works):`
  );
  for (const cat of NON_ASCII_CATEGORIES) {
    console.log(
      `  ${cat.padEnd(32)} ${String(analysis.vocabCounts[cat]).padStart(
        6
      )} vocab | ${String(analysis.tokenCounts[cat]).padStart(7)} tokens`
    );
  }
  console.log(
    `  ${"intraWordBracketSplits".padEnd(32)} ${String(
      analysis.intraWordBracketSplits
    ).padStart(6)} splits`
  );
  console.log(
    `Wrote ${path.relative(process.cwd(), reportPath)} and ${path.relative(
      process.cwd(),
      countsPath
    )}`
  );

  const comparison = evaluateNonAsciiRatchet(committedRatchet, analysis);
  if (!comparison.passed) {
    console.error(formatNonAsciiRatchetReport(comparison));
    return false;
  }
  return true;
}
