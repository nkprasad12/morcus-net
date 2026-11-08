import { assert } from "@/common/assert";

const GREEK_CODEPOINT_RE = /[\u0370-\u03ff\u1f00-\u1fff]/u;
const COMBINING_MARK_RE = /\p{M}/gu;
const ROMAN_AND_LIGATURE_RE = /[æÆœŒ\u2160-\u217f]/gu;

const ROMAN_AND_LIGATURE_MAP: Readonly<Record<string, string>> = {
  æ: "ae",
  Æ: "Ae",
  œ: "oe",
  Œ: "Oe",
  "\u2160": "I",
  "\u2161": "II",
  "\u2162": "III",
  "\u2163": "IV",
  "\u2164": "V",
  "\u2165": "VI",
  "\u2166": "VII",
  "\u2167": "VIII",
  "\u2168": "IX",
  "\u2169": "X",
  "\u216a": "XI",
  "\u216b": "XII",
  "\u216c": "L",
  "\u216d": "C",
  "\u216e": "D",
  "\u216f": "M",
  "\u2170": "i",
  "\u2171": "ii",
  "\u2172": "iii",
  "\u2173": "iv",
  "\u2174": "v",
  "\u2175": "vi",
  "\u2176": "vii",
  "\u2177": "viii",
  "\u2178": "ix",
  "\u2179": "x",
  "\u217a": "xi",
  "\u217b": "xii",
  "\u217c": "l",
  "\u217d": "c",
  "\u217e": "d",
  "\u217f": "m",
};

/**
 * Normalizes a word token for corpus storage (`tokens[]` in
 * `latin_corpus_raw.txt`) and, when lowercased by the caller, the vocabulary
 * index key (`normalizedWord`).
 *
 * - **Greek path** (contains any Greek or Greek Extended codepoint, including
 *   mixed forms like `οἴνῳque`): NFD, strip only U+0304 (macron) and U+0306
 *   (breve), keeping Greek breathings, accents, and iota subscripts.
 * - **Latin path** (everything else):
 *   1. NFD (so precomposed ligatures with marks like `ǽ`/`ǣ` decompose to
 *      `æ` + mark before folding).
 *   2. Fold Roman numeral codepoints U+2160–U+217F to ASCII letters and
 *      ligatures `æ Æ œ Œ` to `ae Ae oe Oe`.
 *   3. Strip all combining marks `\p{M}`.
 * - Fallback: if stripping leaves an empty string (e.g. a standalone combining
 *   mark `\u0335`), keep the NFD-normalized `token` so every word token
 *   retains a non-empty slot aligned with the reader.
 */
export function normalizeCorpusToken(token: string): string {
  assert(token.length > 0, "Corpus word token must not be empty");
  const nfd = token.normalize("NFD");

  if (GREEK_CODEPOINT_RE.test(nfd)) {
    const greekStripped = nfd.replaceAll("\u0304", "").replaceAll("\u0306", "");
    return greekStripped.length > 0 ? greekStripped : nfd;
  }

  const folded = nfd.replaceAll(
    ROMAN_AND_LIGATURE_RE,
    (ch) => ROMAN_AND_LIGATURE_MAP[ch] ?? ch
  );
  const stripped = folded.replaceAll(COMBINING_MARK_RE, "");
  return stripped.length > 0 ? stripped : nfd;
}
