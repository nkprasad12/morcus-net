import { decomposeToken } from "@/morceus/decompose_token";
import { Analyzer } from "@/morceus/types";

export const analyzeLatin: Analyzer = (input: string[]) => {
  // @ts-ignore
  const possibleSplits = input.map(decomposeToken);
  // Before decomp:
  // TODO: Handle removing / converting accents
  // TODO: Handle trailing apostrophe (and similar) characters.
  /* now as for final n, this could be tacked on or could be hiding an s,
     but not if there is an analysis that includes that n  */
  /* ...s-ne -> ...n */
  /* ...Vne -> ...Vn */

  // TODO:  Capitalization
  // - Handle capitalization if the word is all caps.
  // - Handle capitalization if there first letter is a capital
  // Ensure that we handle V -> u,v etc...
  return [];
};
