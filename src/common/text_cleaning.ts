const TEXT_BREAK_CHAR_SET = new Set(
  " ()[];:.,?!'\n\t—\"†‘“”’<>–«»·…§°ʼʽ᾽′\u2329\u232a\u3008\u3009\u27e8\u27e9"
);

const OPEN_BRACKET_TO_CLOSE: Readonly<Record<string, string>> = {
  "[": "]",
  "<": ">",
  "\u2329": "\u232a",
  "\u3008": "\u3009",
  "\u27e8": "\u27e9",
  "(": ")",
};

const CLOSE_BRACKET_TO_OPEN: Readonly<Record<string, string>> = {
  "]": "[",
  ">": "<",
  "\u232a": "\u2329",
  "\u3009": "\u3008",
  "\u27e9": "\u27e8",
  ")": "(",
};

const EDITORIAL_BRACKET_SET = new Set([
  "[",
  "]",
  "<",
  ">",
  "\u2329",
  "\u232a",
  "\u3008",
  "\u3009",
  "\u27e8",
  "\u27e9",
  "(",
  ")",
]);

const LETTER_CHAR_RE = /\p{L}/u;
const COMBINING_MARK_CHAR_RE = /\p{M}/u;
const LETTER_OR_MARK_CHAR_RE = /[\p{L}\p{M}]/u;
const HAS_EDITORIAL_BRACKET_RE = /[[\]<>〈〉⟨⟩\u2329\u232a()]/u;
const SQUARE_BRACKET_DELETION_RE = /\[[^\]]*\]/g;
const EDITORIAL_BRACKET_CHAR_RE = /[[\]<>〈〉⟨⟩\u2329\u232a()]/gu;
const HAS_ROMAN_OR_LIGATURE_RE = /[æÆœŒǼǽǢǣ\u2160-\u217f]/;
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
  const ch = input[i];
  if (!EDITORIAL_BRACKET_SET.has(ch)) {
    return false;
  }
  if (
    ch !== "(" &&
    ch !== ")" &&
    hasLetterBefore(input, i - 1) &&
    hasLetterAfter(input, i + 1)
  ) {
    return true;
  }
  const closeCh = OPEN_BRACKET_TO_CLOSE[ch];
  if (closeCh !== undefined) {
    if (!hasLetterAfter(input, i + 1)) {
      return false;
    }
    let j = i + 1;
    while (j < input.length && LETTER_OR_MARK_CHAR_RE.test(input[j])) {
      j++;
    }
    return (
      j > i + 1 &&
      input[j] === closeCh &&
      (hasLetterBefore(input, i - 1) || hasLetterAfter(input, j + 1))
    );
  }
  const openCh = CLOSE_BRACKET_TO_OPEN[ch];
  if (openCh !== undefined) {
    let k = i - 1;
    while (k >= 0 && LETTER_OR_MARK_CHAR_RE.test(input[k])) {
      k--;
    }
    return (
      k < i - 1 &&
      input[k] === openCh &&
      hasLetterAfter(input, k + 1) &&
      (hasLetterBefore(input, k - 1) || hasLetterAfter(input, i + 1))
    );
  }
  return false;
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
      (ch) => ROMAN_AND_LIGATURE_MAP[ch] ?? ch
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
