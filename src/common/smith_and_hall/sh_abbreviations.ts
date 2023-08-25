import {
  AbbreviationTrie,
  TextExpansion,
  areExpansionsDisjoint,
  findExpansions,
} from "@/common/abbreviations/abbreviations";
import { assert } from "@/common/assert";

function hoverSpan(mainText: string, hoverText: string): string {
  return `<span class="lsHover" title="${hoverText}">${mainText}</span>`;
}

function expand(
  target: string,
  replacement: string,
  options?: { prefix?: string; postfix?: string }
): [string, string] {
  const before = options?.prefix || "";
  const after = options?.postfix || "";
  return [
    before + target + after,
    before + hoverSpan(replacement, `Originally: ${target}`) + after,
  ];
}

const SH_EXPANSIONS = AbbreviationTrie.forMap(
  new Map<string, string>([expand("v.", "see", { postfix: " <f>" })])
);

const GENERIC_SH_HOVERS = AbbreviationTrie.forMap(
  new Map<string, string>([["q. v.", "quod videas (look it up in that entry)"]])
);

export function expandShAbbreviationsIn(input: string): string {
  const expansions = findExpansions(input, SH_EXPANSIONS);
  const hovers = findExpansions(input, GENERIC_SH_HOVERS);
  assert(areExpansionsDisjoint(expansions.concat(hovers)));

  const allResults = expansions
    .map((x): [boolean, TextExpansion] => [true, x])
    .concat(hovers.map((x) => [false, x]));
  allResults.sort((a, b) => b[1][0] - a[1][0]);

  let result = input;
  for (const [isExpansion, [i, length, replacements]] of allResults) {
    assert(replacements.length === 1, input);
    const replacement = isExpansion
      ? replacements[0]
      : hoverSpan(result.substring(i, i + length), replacements[0]);
    result =
      result.substring(0, i) + replacement + result.substring(i + length);
  }
  return result;
}
