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
 * @param text The Latin text to analyze
 * @returns A promise resolving to an array of analyzed tokens
 * @throws Error if the server request fails
 */
export async function latincyAnalysis(text: string): Promise<LatinToken[]> {
  const address = envVar("LATINCY_SERVER_ADDRESS");
  const request: RequestInit = {
    method: "POST",
    body: text,
    headers: { "Content-Type": "text/plain" },
  };
  const response = await fetch(address, request);
  const responseJson = await response.json();
  assertType(responseJson, isLatincyResponse);
  return responseJson;
}
