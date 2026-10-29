/**
 * Greek Unicode ranges:
 * - Basic Greek and Coptic: U+0370 to U+03FF
 * - Greek Extended (polytonic accents, breathings, etc.): U+1F00 to U+1FFF
 */
const GREEK_REGEX = /[\u0370-\u03ff\u1f00-\u1fff]/;

/**
 * Checks whether an input query contains any Greek characters.
 */
export function hasGreek(input: string): boolean {
  return GREEK_REGEX.test(input);
}

/**
 * Generates the external Logeion URL for a given Greek word.
 */
export function getLogeionUrl(word: string): string {
  return `https://logeion.uchicago.edu/${encodeURIComponent(word.trim())}`;
}
