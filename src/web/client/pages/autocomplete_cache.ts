import { removeDiacritics } from "@/common/text_cleaning";
import { callApi } from "@/web/utils/rpc/client_rpc";
import { EntriesByPrefixApi } from "@/web/api_routes";

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

export class AutocompleteCache {
  readonly cache: Map<string, Promise<string[]>> = new Map();

  async getOptions(input: string): Promise<string[]> {
    if (input.length === 0) {
      return [];
    }
    const prefix = removeDiacritics(input).toLowerCase();
    const mainKey = prefix[0];
    const extra = EXTRA_KEY_LOOKUP.get(mainKey);
    const allKeys = extra === undefined ? [mainKey] : [mainKey, extra];
    const cacheKey = allKeys.sort().join("");

    let madeApiCall = false;
    if (!this.cache.has(cacheKey)) {
      const allFetches = Promise.all(
        allKeys.map((key) => callApi(EntriesByPrefixApi, key))
      ).then((r) => r.reduce((a, b) => a.concat(b), []));
      this.cache.set(cacheKey, allFetches);
      madeApiCall = true;
    }

    try {
      const allOptions = await this.cache.get(cacheKey)!;
      const prefixes = getPrefixes(prefix);
      return allOptions.filter((option) =>
        prefixes.includes(
          removeDiacritics(option).toLowerCase().substring(0, prefix.length)
        )
      );
    } catch (e) {
      if (madeApiCall) {
        this.cache.delete(cacheKey);
      }
      return [];
    }
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
