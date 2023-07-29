import { DictInfo } from "@/common/dictionaries/dictionaries";
import { removeDiacritics } from "@/common/text_cleaning";
import { FusedAutocompleteFetcher } from "@/web/client/pages/dictionary/autocomplete/fused_autocomplete_fetcher";

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
): Promise<[DictInfo, string][]> {
  if (input.length === 0) {
    return [];
  }

  const fromLatin = dicts.filter((dict) => dict.languages.from === "La");
  const prefix = removeDiacritics(input).toLowerCase();
  const prefixes = getPrefixes(prefix);

  const mainQuery = prefix[0];
  const extraQuery =
    fromLatin.length > 0 ? EXTRA_KEY_LOOKUP.get(mainQuery) : undefined;
  const allPending = [
    fetchResults(mainQuery, dicts),
    fetchResults(extraQuery, fromLatin),
  ];

  const allFiltered: [DictInfo, string[]][] = [];
  for (const pending of allPending) {
    const allOptions = await pending;
    for (const dictKey in allOptions) {
      const options = allOptions[dictKey];
      const filtered = options.filter((option) =>
        prefixes.includes(
          removeDiacritics(option).toLowerCase().substring(0, prefix.length)
        )
      );
      allFiltered.push([
        dicts.filter((dict) => dict.key === dictKey)[0],
        filtered.slice(0, limit),
      ]);
    }
  }

  const formatted: [DictInfo, string][] = [];
  for (const [info, options] of allFiltered) {
    for (const option of options) {
      formatted.push([info, option]);
    }
  }
  return formatted
    .sort((a, b) =>
      removeDiacritics(a[1])
        .toLowerCase()
        .localeCompare(removeDiacritics(b[1]).toLowerCase())
    )
    .slice(0, limit);
}
