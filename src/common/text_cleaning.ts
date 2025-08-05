const TEXT_BREAK_CHAR_SET = new Set(" ()[];:.,?!'\n\t—\"†‘“”’<>");
export function isTextBreakChar(c: string): boolean {
  return TEXT_BREAK_CHAR_SET.has(c);
}

export function* processTokens(
  input: string
): Generator<[token: string, isWord: boolean]> {
  if (input.length === 0) {
    return;
  }
  let lastChunkStart = 0;
  let isInWord = !isTextBreakChar(input[0]);
  for (let i = 0; i < input.length; i++) {
    const isBreak = isTextBreakChar(input[i]);
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
