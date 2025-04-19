import { removeDiacritics } from "@/common/text_cleaning";
import { ServerExtras } from "@/web/utils/rpc/server_rpc";
import { Vowels } from "@/common/character_utils";
import { setMap } from "@/common/data_structures/collect_map";
import type { StoredDictBacking } from "@/common/dictionaries/stored_dict_interface";

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
  private readonly table: Promise<Map<string, string[]>> | undefined;

  constructor(private readonly backing: StoredDictBacking<any>) {
    this.table = this.backing.lowMemory
      ? undefined
      : Promise.resolve(this.backing.allEntryNames()).then((entries) => {
          const lookup = setMap<string, string>();
          entries.forEach(({ orth, cleanOrth }) =>
            lookup.add(cleanOrth[0].toLowerCase(), orth)
          );
          return new Map(
            [...lookup.map.entries()].map((e) => [e[0], [...e[1]]])
          );
        });
  }

  /**
   * Returns the raw (serialized) entries for the given input
   * query.
   *
   * @param input the query to search against keys.
   * @param extras any server extras to pass to the function.
   */
  async getRawEntry(
    input: string,
    extras?: ServerExtras
  ): Promise<StoredEntryAndMetadata[]> {
    const request = removeDiacritics(input)
      .replaceAll("\u0304", "")
      .replaceAll("\u0306", "")
      .toLowerCase();
    const candidates = (await this.backing.matchesForCleanName(request)).filter(
      ({ orth }) => Vowels.haveCompatibleLength(input, orth)
    );
    extras?.log(`${request}_sqlCandidates`);
    if (candidates.length === 0) {
      return [];
    }

    const allIds = Array.from(new Set(candidates.map(({ id }) => id)));
    const entryStrings = await this.backing.entriesForIds(allIds);
    extras?.log(`${request}_entriesFetched`);
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
    const precomputed = (await this.table)?.get(prefix);
    if (precomputed !== undefined) {
      return precomputed;
    }
    return this.backing.entryNamesByPrefix(prefix);
  }
}
