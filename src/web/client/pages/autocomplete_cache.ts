import { removeDiacritics } from "@/common/text_cleaning";
import { entriesByPrefix } from "@/web/api_routes";

async function fetchOptions(input: string): Promise<string[]> {
  const response = await fetch(`${location.origin}${entriesByPrefix(input)}`);
  if (!response.ok) {
    throw "Response not OK";
  }
  const rawText = await response.text();
  return JSON.parse(rawText);
}

export class AutocompleteCache {
  readonly cache: Map<string, string[]> = new Map();

  async getOptions(input: string): Promise<string[]> {
    if (input.length === 0) {
      return [];
    }
    const prefix = removeDiacritics(input).toLowerCase();
    const cacheKey = prefix[0];
    if (!this.cache.has(cacheKey)) {
      try {
        const results = await fetchOptions(cacheKey);
        this.cache.set(cacheKey, results);
      } catch (e) {
        return [];
      }
    }

    const results = this.cache.get(cacheKey)!;
    return results.filter((option) =>
      removeDiacritics(option).toLowerCase().startsWith(prefix)
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
