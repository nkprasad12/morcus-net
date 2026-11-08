const TEXT_BREAK_CHAR_SET = new Set(
  " ()[];:.,?!'\n\t—\"†‘“”’<>–«»·…§°ʼʽ᾽′\u2329\u232a\u3008\u3009\u27e8\u27e9"
);

/**
 * Intra-word editorial bracket pairs in `[open, close]` order:
 * - Even index (`(bIdx & 1) === 0`) is an opening bracket; odd index is a
 *   closing bracket; `bIdx ^ 1` gives the matching delimiter.
 * - Indices `0..9` (`[] <> 〈〉 ⟨⟩`) are square/angle brackets eligible for
 *   both rule (a) and rule (b) in `isIntraWordBracket`.
 * - Indices `10..11` (`()`) must stay last: parentheses only join under rule
 *   (b) (a closed `(letters)` group), never rule (a) (`bIdx < 10`).
 */
const BRACKET_PAIRS = "[]<>\u2329\u232a\u3008\u3009\u27e8\u27e9()";

const LETTER_CHAR_RE = /\p{L}/u;
const COMBINING_MARK_CHAR_RE = /\p{M}/u;
const LETTER_OR_MARK_CHAR_RE = /[\p{L}\p{M}]/u;
const HAS_EDITORIAL_BRACKET_RE = /[[\]<>〈〉⟨⟩\u2329\u232a()]/u;
const SQUARE_BRACKET_DELETION_RE = /\[[^\]]*\]/g;
const EDITORIAL_BRACKET_CHAR_RE = /[[\]<>〈〉⟨⟩\u2329\u232a()]/gu;
const HAS_ROMAN_OR_LIGATURE_RE = /[æÆœŒǼǽǢǣ\u2160-\u217f]/;
const ROMAN_AND_LIGATURE_RE = /[æÆœŒ\u2160-\u217f]/gu;

const LIGATURE_MAP: Readonly<Record<string, string>> = {
  æ: "ae",
  Æ: "Ae",
  œ: "oe",
  Œ: "Oe",
};

export function isTextBreakChar(c: string): boolean {
  return TEXT_BREAK_CHAR_SET.has(c);
}

function hasLetterBefore(input: string, idx: number): boolean {
  let k = idx;
  while (k >= 0 && COMBINING_MARK_CHAR_RE.test(input[k])) {
    k--;
  }
  return k >= 0 && LETTER_CHAR_RE.test(input[k]);
}

function hasLetterAfter(input: string, idx: number): boolean {
  return idx < input.length && LETTER_CHAR_RE.test(input[idx]);
}

/**
 * Whether a bracket character (`[ ] < > 〈 〉 ⟨ ⟩ ( )`) at `input[i]` counts as
 * part of a word rather than a token break:
 * - (a) it is a square or angle bracket (`[ ] < > 〈 〉 ⟨ ⟩`) with a letter
 *   directly on both sides (`obsole[n]tior`, `fu〉ncturae`); or
 * - (b) it is part of a closed group containing only letters (and combining
 *   marks), and the group touches a letter on at least one outer side
 *   (`tacere[m]`, `[s]et`, `abolito〈que〉`, `<t>ibi`, `pr(aetoris)`).
 */
function isIntraWordBracket(input: string, i: number): boolean {
  const bIdx = BRACKET_PAIRS.indexOf(input[i]);
  if (bIdx < 0) {
    return false;
  }
  const left = hasLetterBefore(input, i - 1);
  const right = hasLetterAfter(input, i + 1);
  if (bIdx < 10 && left && right) {
    return true;
  }
  const isOpen = (bIdx & 1) === 0;
  const step = isOpen ? 1 : -1;
  let j = i + step;
  while (j >= 0 && j < input.length && LETTER_OR_MARK_CHAR_RE.test(input[j])) {
    j += step;
  }
  return (
    j !== i + step &&
    input[j] === BRACKET_PAIRS[bIdx ^ 1] &&
    hasLetterAfter(input, (isOpen ? i : j) + 1) &&
    (isOpen
      ? left || hasLetterAfter(input, j + 1)
      : right || hasLetterBefore(input, j - 1))
  );
}

/**
 * Strips intra-word editorial brackets from a word token:
 * - Drops closed `[…]` deletions together with their bracketed content
 *   (`obsole[n]tior` → `obsoletior`, `tacere[m]` → `tacere`, `[s]et` → `et`).
 * - Strips any remaining `[ ] < > 〈 〉 ⟨ ⟩ ( )` bracket characters while
 *   keeping their content (`<t>ibi` → `tibi`, `abolito〈que〉` → `abolitoque`,
 *   `pr(aetoris)` → `praetoris`, `pudor[is` → `pudoris`).
 */
export function stripEditorialBrackets(word: string): string {
  if (!HAS_EDITORIAL_BRACKET_RE.test(word)) {
    return word;
  }
  return word
    .replaceAll(SQUARE_BRACKET_DELETION_RE, "")
    .replaceAll(EDITORIAL_BRACKET_CHAR_RE, "");
}

/**
 * Folds Latin ligatures (`æ Æ œ Œ`, including precomposed `ǽ Ǽ ǣ Ǣ`) to ASCII
 * digraphs (`ae Ae oe Oe`) and Roman numeral codepoints U+2160–U+217F to ASCII
 * letters. When folding occurs, the returned string is NFD-normalized so any
 * combining mark decomposed from `ǽ`/`ǣ` sits on the second vowel of the
 * expanded digraph.
 */
export function foldLatinLigaturesAndNumerals(input: string): string {
  if (!HAS_ROMAN_OR_LIGATURE_RE.test(input)) {
    return input;
  }
  return input
    .normalize("NFD")
    .replaceAll(
      ROMAN_AND_LIGATURE_RE,
      (ch) => LIGATURE_MAP[ch] ?? ch.normalize("NFKD")
    );
}

function isTokenBreakAt(input: string, i: number): boolean {
  return isTextBreakChar(input[i]) && !isIntraWordBracket(input, i);
}

export function* processTokens(
  input: string
): Generator<[token: string, isWord: boolean]> {
  if (input.length === 0) {
    return;
  }
  let lastChunkStart = 0;
  let isInWord = !isTokenBreakAt(input, 0);
  for (let i = 0; i < input.length; i++) {
    const isBreak = isTokenBreakAt(input, i);
    const wordEnd = isInWord && isBreak;
    const breakEnd = !isInWord && !isBreak;
    if (wordEnd || breakEnd) {
      yield [input.substring(lastChunkStart, i), isInWord];
      isInWord = !isInWord;
      lastChunkStart = i;
    }
  }
  yield [input.substring(lastChunkStart), isInWord];
}

export function processWords<T>(
  input: string,
  handler: (word: string, i?: number) => T
): (string | T)[] {
  if (input.length === 0) {
    return [];
  }
  const results: (string | T)[] = [];
  for (const [token, isWord] of processTokens(input)) {
    results.push(isWord ? handler(token) : token);
  }
  return results;
}

export function removeDiacritics(input: string): string {
  return stripDiacritics(input).word;
}

/**
 * Removes only combining macrons (U+0304 and U+0305) from text and normalizes
 * back to NFC. Unlike removeDiacritics, preserves breves, accents, and other marks.
 */
export function removeMacrons(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0304\u0305]/g, "")
    .normalize("NFC");
}

export interface DiacriticStripped {
  word: string;
  diacritics?: string[];
  positions?: number[];
}

/**
 * Strips and stores diacritics from the input text.
 *
 * @param word The input word to strip diacritics from
 * @returns An object containing the stripped word and information to restore diacritics
 */
export function stripDiacritics(word: string): DiacriticStripped {
  // ASCII has no combining marks and is unchanged by NFD, so skip the
  // normalize and per-character walk for it (most Latin text).
  if (!/[\u0080-\uffff]/.test(word)) {
    return { word };
  }
  // Normalize the string to NFD to separate base characters from combining marks
  const normalized = word.normalize("NFD");
  const result: DiacriticStripped = { word: "" };
  const diacritics: string[] = [];
  const positions: number[] = [];

  let strippedPos = 0;

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (/[\u0300-\u036f\u1dc0-\u1dff\u20d0-\u20ff]/.test(char)) {
      diacritics.push(char);
      positions.push(strippedPos - 1); // Position is the last base character.
    } else {
      result.word += char;
      strippedPos++;
    }
  }

  if (diacritics.length > 0) {
    result.diacritics = diacritics;
    result.positions = positions;
  }

  return result;
}

/**
 * Removes leading and trailing clusters of punctuation, whitespace, and
 * dangling combining diacritic marks from a search query.
 */
export function trimRawQuery(query: string): string {
  const LEAD_TRIM_RE = /^(?:[\p{P}\p{Z}\s]+[\p{M}]*)/u;
  const TRAIL_TRIM_RE = /(?:[\p{M}]*[\p{P}\p{Z}\s]+)$/u;
  return query.replace(LEAD_TRIM_RE, "").replace(TRAIL_TRIM_RE, "");
}
