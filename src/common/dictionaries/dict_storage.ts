import { removeDiacritics } from "@/common/text_cleaning";
import { ServerExtras } from "@/web/utils/rpc/server_rpc";
import { Vowels } from "@/common/character_utils";
import type { StoredDictBacking } from "@/common/dictionaries/stored_dict_interface";
import type { DictLang } from "@/common/dictionaries/dictionaries";

interface Subsection {
  id: string;
  name: string;
}

export interface StoredEntryAndMetadata {
  /** The unique ID of this entry. */
  id: string;
  /** The raw entry data. */
  entry: string;
  /** Whether the main entry (e.g. `Roma`) should be a result. */
  includeMain?: boolean;
  /** Sub-entries (e.g. `Romanus` from `Roma`) that should be results. */
  subsections?: Subsection[];
}

/** A generic stored dictionary. */
export class StoredDict {
  constructor(private readonly backing: StoredDictBacking<any>) {}

  /**
   * Returns the raw (serialized) entries for the given input
   * query.
   *
   * @param input the query to search against keys.
   * @param lang the language of the input.
   * @param extras any server extras to pass to the function.
   * @param entryCache optional per-query cache of `id -> raw entry` to avoid
   *   fetching the same parent entry XML twice when a query matches both a
   *   main entry and one of its sub-entries or variant headwords.
   */
  async getRawEntry(
    input: string,
    lang: DictLang = "La",
    extras?: ServerExtras,
    entryCache?: Map<string, string>
  ): Promise<StoredEntryAndMetadata[]> {
    const request = removeDiacritics(input)
      .replaceAll("\u0304", "")
      .replaceAll("\u0306", "")
      .toLowerCase();
    let candidates = await this.backing.matchesForCleanName(request);
    if (lang === "La") {
      candidates = candidates.filter(({ orth }) =>
        Vowels.haveCompatibleLength(input, orth)
      );
    }
    // TODO: Re-enable this if we run into performance issues.
    // extras?.log(`${request}_sqlCandidates`);
    if (candidates.length === 0) {
      return [];
    }

    const allIds = Array.from(new Set(candidates.map(({ id }) => id)));
    const entryStrings = await this.entriesForIds(allIds, entryCache);
    // TODO: Re-enable this if we run into performance issues.
    // extras?.log(`${request}_entriesFetched`);
    const results: StoredEntryAndMetadata[] = [];
    for (const { id, entry } of entryStrings) {
      const subsections: Subsection[] = [];
      let includeMain: boolean = false;

      for (const row of candidates) {
        if (row.id !== id) {
          continue;
        }
        if (row.senseId === undefined) {
          includeMain = true;
          continue;
        }
        subsections.push({ id: row.senseId, name: row.orth });
      }

      const result: StoredEntryAndMetadata = { id, entry, includeMain };
      if (subsections.length > 0) {
        result.subsections = subsections;
      }
      results.push(result);
    }
    return results;
  }

  /**
   * Fetches the raw entries for `ids`, reading from and populating
   * `entryCache` if provided. Results are in the order of `ids`, skipping
   * any that don't exist.
   */
  private async entriesForIds(
    ids: string[],
    entryCache?: Map<string, string>
  ): Promise<{ id: string; entry: string }[]> {
    if (entryCache === undefined) {
      return this.backing.entriesForIds(ids);
    }
    const missingIds = ids.filter((id) => !entryCache.has(id));
    if (missingIds.length > 0) {
      const fetched = await this.backing.entriesForIds(missingIds);
      for (const { id, entry } of fetched) {
        entryCache.set(id, entry);
      }
    }
    return ids.flatMap((id) => {
      const entry = entryCache.get(id);
      return entry === undefined ? [] : [{ id, entry }];
    });
  }

  /** Returns the entry with the given ID, if present. */
  async getById(id: string): Promise<string | undefined> {
    const result = await this.backing.entriesForIds([id]);
    if (result.length === 0) {
      return undefined;
    }
    return result[0].entry;
  }

  /** Returns the possible completions for the given prefix. */
  async getCompletions(input: string): Promise<string[]> {
    // If the input starts with a hyphen, we want to treat it as a suffix.
    // However, if we have *just* a hyphen, we want to avoid doing a full table
    // scan (because that would return everything) and just return the
    // entries that explicitly start with a hyphen.
    return input.startsWith("-") && input.length > 1
      ? this.backing.entryNamesBySuffix(input.substring(1))
      : this.getPrefixCompletions(input);
  }

  /** Returns the possible completions for the given prefix. */
  async getPrefixCompletions(input: string): Promise<string[]> {
    const prefix = removeDiacritics(input).toLowerCase();
    return this.backing.entryNamesByPrefix(prefix);
  }
}
