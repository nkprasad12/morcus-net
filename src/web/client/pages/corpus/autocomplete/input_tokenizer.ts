export type QueryToken = [
  tokenOrSpace: string,
  start: number,
  isSpace: boolean
];

/**
 * Tokenizes the input string into query tokens along with their start positions and statuses.
 *
 * Tokens are separated by spaces, with the exception of parentheses which are treated as separate tokens.
 * The end position is inclusive.
 *
 * For example, the input string " word1 (word2 word3)  " would be tokenized into:
 * ```
 * [
 *   [" ", 0, true],
 *   ["word1", 1, false],
 *   [" ", 6, true],
 *   ["(", 7, false],
 *   ["word2", 8, false],
 *   [" ", 13, true],
 *   ["word3", 14, false],
 *   [")", 19, false]
 *   ["  ", 20, true],
 * ]
 * ```
 *
 * @param input The input string to tokenize.
 * @returns An array of QueryToken tuples.
 */
export function tokenizeInput(input: string): QueryToken[] {
  const tokens: QueryToken[] = [];

  let currentToken = "";
  let tokenStart = 0;
  let isCurrentTokenSpace = false;

  const flushCurrentToken = () => {
    if (currentToken.length > 0) {
      tokens.push([currentToken, tokenStart, isCurrentTokenSpace]);
      currentToken = "";
    }
  };

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    const isSpace = c === " ";
    const isParenthesis = c === "(" || c === ")";

    if (isParenthesis) {
      // Flush any accumulated token
      flushCurrentToken();
      // Add parenthesis as its own token (not a space)
      tokens.push([c, i, false]);
      tokenStart = i + 1;
      continue;
    }

    if (currentToken.length === 0) {
      // Starting a new token
      tokenStart = i;
      isCurrentTokenSpace = isSpace;
      currentToken = c;
    } else if (isCurrentTokenSpace === isSpace) {
      // Continue building current token (space or non-space)
      currentToken += c;
    } else {
      // Type changed, flush and start new token
      flushCurrentToken();
      tokenStart = i;
      isCurrentTokenSpace = isSpace;
      currentToken = c;
    }
  }

  flushCurrentToken();

  return tokens;
}
