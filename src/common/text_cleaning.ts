const DIACRITICS = new Map<string, string>([
  ["ā", "a"],
  ["ă", "a"],
  ["á", "a"],
  ["ē", "e"],
  ["ĕ", "e"],
  ["ë", "e"],
  ["è", "e"],
  ["é", "e"],
  ["ī", "i"],
  ["ĭ", "i"],
  ["ï", "i"],
  ["ì", "i"],
  ["ō", "o"],
  ["ŏ", "o"],
  ["ô", "o"],
  ["ö", "o"],
  ["ū", "u"],
  ["ŭ", "u"],
  ["ü", "u"],
  ["ú", "u"],
  ["ù", "u"],
  ["ȳ", "y"],
  ["ў", "y"],
  ["ÿ", "y"],
  // This is A with a tilde.
  ["Ã", "A"],
  // This is A with a macron.
  ["Ā", "A"],
  ["Ă", "A"],
  ["Ē", "E"],
  ["Ĕ", "E"],
  ["Ī", "I"],
  ["Ĭ", "I"],
  ["Ō", "O"],
  ["Õ", "O"],
  ["Ŏ", "O"],
  ["Ū", "U"],
  ["Ŭ", "U"],
]);

const TEXT_BREAK_CHAR_SET = new Set(" ()[];:.,?!'\n\t");
function isTextBreakChar(c: string): boolean {
  return TEXT_BREAK_CHAR_SET.has(c);
}

export function processWords<T>(
  input: string,
  handler: (word: string) => T
): (string | T)[] {
  if (input.length === 0) {
    return [];
  }
  const results: (string | T)[] = [];
  let lastChunkStart = 0;
  let isInWord = !isTextBreakChar(input[0]);
  for (let i = 0; i < input.length; i++) {
    const isBreak = isTextBreakChar(input[i]);
    if (isInWord && isBreak) {
      results.push(handler(input.substring(lastChunkStart, i)));
      isInWord = false;
      lastChunkStart = i;
    } else if (!isInWord && !isBreak) {
      results.push(input.substring(lastChunkStart, i));
      isInWord = true;
      lastChunkStart = i;
    }
  }
  const finalChunk = input.substring(lastChunkStart);
  results.push(isInWord ? handler(finalChunk) : finalChunk);
  return results;
}

export function removeDiacritics(input: string): string {
  let result = "";
  for (const c of input) {
    result += DIACRITICS.get(c) || c;
  }
  return result;
}
