import { assert } from "@/common/assert";
import {
  foldLatinLigaturesAndNumerals,
  stripEditorialBrackets,
} from "@/common/text_cleaning";

const NEEDS_CORPUS_NORMALIZATION_RE = /[\u0080-\uffff[\]<>()]/;
const GREEK_CODEPOINT_RE = /[\u0370-\u03ff\u1f00-\u1fff]/u;
const COMBINING_MARK_RE = /\p{M}/gu;

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
 *      `æ` + mark before folding, and `\u2329`/`\u232a` canonicalize to
 *      `〈`/`〉`).
 *   2. Drop closed `[…]` deletions together with their content (`obsole[n]tior`
 *      → `obsoletior`), and strip `< > 〈 〉 ⟨ ⟩ ( )` editorial bracket
 *      characters while keeping their content (`<t>ibi` → `tibi`,
 *      `abolito〈que〉` → `abolitoque`, `pr(aetoris)` → `praetoris`).
 *   3. Fold Roman numeral codepoints U+2160–U+217F to ASCII letters and
 *      ligatures `æ Æ œ Œ` to `ae Ae oe Oe`.
 *   4. Strip all combining marks `\p{M}`.
 * - Fallback: if stripping leaves an empty string (e.g. a standalone combining
 *   mark `\u0335`), keep the NFD-normalized `token` so every word token
 *   retains a non-empty slot aligned with the reader.
 */
export function normalizeCorpusToken(token: string): string {
  assert(token.length > 0, "Corpus word token must not be empty");
  // Plain ASCII without editorial brackets has no combining marks, ligatures,
  // or Roman numeral codepoints and is unchanged by NFD (most Latin words).
  if (!NEEDS_CORPUS_NORMALIZATION_RE.test(token)) {
    return token;
  }
  const nfd = token.normalize("NFD");

  if (GREEK_CODEPOINT_RE.test(nfd)) {
    const greekStripped = nfd.replaceAll("\u0304", "").replaceAll("\u0306", "");
    return greekStripped.length > 0 ? greekStripped : nfd;
  }

  const debracketed = stripEditorialBrackets(nfd);
  const folded = foldLatinLigaturesAndNumerals(debracketed);
  const stripped = folded.replaceAll(COMBINING_MARK_RE, "");
  return stripped.length > 0 ? stripped : nfd;
}
