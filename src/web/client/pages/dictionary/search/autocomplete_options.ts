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

function getPrefixes(prefix: string): string[] {
  let prefixes: string[] = [""];
  for (let i = 0; i < prefix.length; i++) {
    const nextChar = prefix.charAt(i);
    const altChar = EXTRA_KEY_LOOKUP.get(nextChar);
    const nextChars = altChar === undefined ? [nextChar] : [nextChar, altChar];
    prefixes = prefixes.flatMap((p) => nextChars.map((n) => p + n));
  }
  return prefixes;
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
  const prefixes = getPrefixes(prefix);

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
      const filtered = options.filter(
        (option) =>
          // For suffix searches, we pass along the whole query rather than just the first letter.
          // Thus we only need to check matches for prefix searches.
          isSuffixSearch ||
          prefixes.includes(
            removeDiacritics(option).toLowerCase().substring(0, prefix.length)
          )
      );
      allFiltered.push([
        checkPresent(dicts.find((dict) => dict.key === dictKey)).languages.from,
        dictKey,
        filtered.slice(0, limit),
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
