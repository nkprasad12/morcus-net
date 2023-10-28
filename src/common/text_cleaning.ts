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

export function removeDiacritics(input: string): string {
  let result = "";
  for (const c of input) {
    result += DIACRITICS.get(c) || c;
  }
  return result;
}
