import { checkPresent } from "@/common/assert";
import { Vowels } from "@/common/character_utils";
import { arrayMap } from "@/common/data_structures/collect_map";
import { DictInfo, type DictLang } from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { removeDiacritics } from "@/common/text_cleaning";
import { FusedAutocompleteFetcher } from "@/web/client/pages/dictionary/search/fused_autocomplete_fetcher";

const EXTRA_KEY_LOOKUP = new Map<string, string>([
  ["u", "v"],
  ["v", "u"],
  ["i", "j"],
  ["j", "i"],
]);

function getPrefixes(prefix: string, fromLang: DictLang): string[] {
  if (fromLang === "La") {
    // This results in exponential blowup if it's too long, so only go up to 25.
    // Anything longer is likely a mistake.
    const maxDepth = Math.min(25, prefix.length);
    let prefixes: string[] = [""];
    for (let i = 0; i < maxDepth; i++) {
      const nextChar = prefix.charAt(i);
      const altChar = EXTRA_KEY_LOOKUP.get(nextChar);
      const nextChars =
        altChar === undefined ? [nextChar] : [nextChar, altChar];
      prefixes = prefixes.flatMap((p) => nextChars.map((n) => p + n));
    }
    return prefixes;
  }
  if (fromLang === "De") {
    return [prefix.replaceAll("ß", "ss")];
  }
  return [prefix];
}

function fetchResults(input: string | undefined, dicts: DictInfo[]) {
  if (input === undefined) {
    const result: Record<string, string[]> = {};
    for (const dict of dicts) {
      result[dict.key] = [];
    }
    return Promise.resolve(result);
  }
  return FusedAutocompleteFetcher.get().getOptions({
    query: input,
    dicts: dicts.map((d) => d.key),
  });
}

function filterRawResults(
  options: string[],
  limit: number,
  isSuffixSearch: boolean,
  fromLang: DictLang,
  query: string
): string[] {
  // For suffix searches, we pass along the whole query rather than just the first letter.
  // Thus we only need to check matches for prefix searches.
  if (isSuffixSearch) {
    return options.slice(0, limit);
  }
  const prefixes = getPrefixes(query, fromLang);
  const prefixLength = checkPresent(prefixes[0]).length;
  const filtered: string[] = [];
  for (const option of options) {
    if (filtered.length >= limit) {
      break;
    }
    let normalized = removeDiacritics(option).toLowerCase();
    if (fromLang === "De") {
      normalized = normalized.replaceAll("ß", "ss");
    }
    const optionPrefix = normalized.substring(0, prefixLength);
    if (prefixes.includes(optionPrefix)) {
      filtered.push(option);
    }
  }
  return filtered;
}

export async function autocompleteOptions(
  input: string,
  dicts: DictInfo[],
  limit: number = 200
): Promise<[DictLang, string][]> {
  if (input.length === 0) {
    return [];
  }

  const fromLatin = dicts.filter((dict) => dict.languages.from === "La");
  const prefix = removeDiacritics(input).toLowerCase();

  const isSuffixSearch = prefix.length > 1 && prefix.startsWith("-");
  const mainQuery = prefix[0];
  const extraQuery =
    fromLatin.length > 0 ? EXTRA_KEY_LOOKUP.get(mainQuery) : undefined;
  const allPending = isSuffixSearch
    ? [fetchResults(prefix, dicts)]
    : [fetchResults(mainQuery, dicts), fetchResults(extraQuery, fromLatin)];

  const allFiltered: [DictLang, DictInfo["key"], string[]][] = [];
  for (const pending of allPending) {
    const allOptions = await pending;
    for (const dictKey in allOptions) {
      const options = allOptions[dictKey];
      const fromLang = checkPresent(dicts.find((dict) => dict.key === dictKey))
        .languages.from;
      allFiltered.push([
        fromLang,
        dictKey,
        filterRawResults(options, limit, isSuffixSearch, fromLang, prefix),
      ]);
    }
  }

  const groupsByLang = new Map<
    DictLang,
    ReturnType<typeof arrayMap<string, [DictInfo["key"], string]>>
  >();
  // Group filtered options by language and form
  for (const [lang, dict, options] of allFiltered) {
    if (!groupsByLang.has(lang)) {
      groupsByLang.set(lang, arrayMap<string, [DictInfo["key"], string]>());
    }
    for (const option of options) {
      groupsByLang.get(lang)!.add(removeDiacritics(option), [dict, option]);
    }
  }

  const optionsByLang = arrayMap<DictLang, string>();
  // Group options by language and ensure compatibility of vowel lengths
  for (const [lang, formMap] of groupsByLang.entries()) {
    for (const [_, options] of formMap.map.entries()) {
      const formGroups: [DictInfo["key"], string][][] = [];
      for (const [dict, option] of options) {
        let foundGroup = false;
        for (const group of formGroups) {
          const compatible = group.every((member) =>
            Vowels.haveCompatibleLength(member[1], option)
          );
          if (compatible) {
            group.push([dict, option]);
            foundGroup = true;
            break;
          }
        }
        if (!foundGroup) {
          formGroups.push([[dict, option]]);
        }
      }

      // Select the leader option for each group
      for (const group of formGroups) {
        const leader =
          group.find(([key, _]) => key === LatinDict.Gaffiot.key) ?? group[0];
        optionsByLang.add(lang, leader[1]);
      }
    }
  }

  // Flatten and sort the options by language and return the top results
  return Array.from(optionsByLang.map.entries())
    .flatMap(([lang, words]) =>
      Array.from(words).map((w): [DictLang, string] => [lang, w])
    )
    .sort((a, b) =>
      removeDiacritics(a[1])
        .toLowerCase()
        .localeCompare(removeDiacritics(b[1]).toLowerCase())
    )
    .slice(0, limit);
}
