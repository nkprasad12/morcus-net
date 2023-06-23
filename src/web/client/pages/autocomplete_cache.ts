import { removeDiacritics } from "@/common/text_cleaning";
import { callApi } from "@/web/utils/rpc/client_rpc";
import { EntriesByPrefixApi } from "@/web/api_routes";

const EXTRA_KEY_LOOKUP = new Map<string, string>([
  ["u", "v"],
  ["v", "u"],
  ["i", "j"],
  ["j", "i"],
]);

export class AutocompleteCache {
  readonly cache: Map<string, string[]> = new Map();

  async getOptions(input: string): Promise<string[]> {
    if (input.length === 0) {
      return [];
    }
    const prefix = removeDiacritics(input).toLowerCase();
    const mainKey = prefix[0];
    const extra = EXTRA_KEY_LOOKUP.get(mainKey);
    const allKeys = extra === undefined ? [mainKey] : [mainKey, extra];
    allKeys.sort();

    if (!this.cache.has(allKeys.join(""))) {
      const allFetches = Promise.all(
        allKeys.map((key) => callApi(EntriesByPrefixApi, key))
      );
      try {
        this.cache.set(
          allKeys.join(""),
          (await allFetches).reduce((a, b) => a.concat(b), [])
        );
      } catch (e) {
        return [];
      }
    }

    let prefixes: string[] = [""];
    for (let i = 0; i < prefix.length; i++) {
      const nextChar = prefix.charAt(i);
      const altChar = EXTRA_KEY_LOOKUP.get(nextChar);
      const nextChars =
        altChar === undefined ? [nextChar] : [nextChar, altChar];
      prefixes = prefixes.flatMap((p) => nextChars.map((n) => p + n));
    }

    const allOptions = this.cache.get(allKeys.join(""))!;
    return allOptions.filter((option) =>
      prefixes.includes(
        removeDiacritics(option).toLowerCase().substring(0, prefix.length)
      )
    );
  }
}

let autocompleteCache: AutocompleteCache | undefined = undefined;

export namespace AutocompleteCache {
  export function get() {
    if (autocompleteCache === undefined) {
      autocompleteCache = new AutocompleteCache();
    }
    return autocompleteCache;
  }
}
