import { assertType } from "@/common/assert";
import { envVar } from "@/common/env_vars";
import { isArray, isString, matchesObject } from "@/web/utils/rpc/parsing";

/**
 * Interface representing a parsed token from the LatinCy server
 */
export interface LatinToken {
  /** The original text of the token. */
  text: string;
  /** The lemma form of the token. */
  lemma: string;
  /** Morphological information about the token. */
  morph: string;
}

const isLatinToken = matchesObject<LatinToken>({
  text: isString,
  lemma: isString,
  morph: isString,
});

const isLatincyResponse = isArray(isLatinToken);

/**
 * Analyze Latin text using the LatinCy server
 * @param words The Latin text to analyze
 * @param spaces An array of booleans indicating whether each token is a non-work character.
 *
 * @returns A promise resolving to an array of analyzed tokens
 * @throws Error if the server request fails
 */
export async function latincyAnalysis(
  words: string[],
  spaces: boolean[]
): Promise<LatinToken[]> {
  const address = envVar("LATINCY_SERVER_ADDRESS");
  const request: RequestInit = {
    method: "POST",
    body: JSON.stringify({ words, spaces }),
    headers: { "Content-Type": "application/json" },
  };
  const response = await fetch(address, request);
  const responseJson = await response.json();
  assertType(responseJson, isLatincyResponse);
  return responseJson;
}
