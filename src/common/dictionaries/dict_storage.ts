import { removeDiacritics } from "@/common/text_cleaning";
import { ServerExtras } from "@/web/utils/rpc/server_rpc";
import { Vowels } from "@/common/character_utils";
import { setMap } from "@/common/data_structures/collect_map";
import type { StoredDictBacking } from "@/common/dictionaries/stored_dict_interface";

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
  async getRawEntry(input: string, extras?: ServerExtras): Promise<string[]> {
    const request = removeDiacritics(input).toLowerCase();
    const candidates = await this.backing.matchesForCleanName(request);
    extras?.log(`${request}_sqlCandidates`);
    if (candidates.length === 0) {
      return [];
    }

    const allIds = candidates
      .filter(({ orth }) => Vowels.haveCompatibleLength(input, orth))
      .map(({ id }) => id);
    const entryStrings = await this.backing.entriesForIds(allIds);
    extras?.log(`${request}_entriesFetched`);
    return entryStrings.map(({ entry }) => entry);
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
    const prefix = removeDiacritics(input).toLowerCase();
    const precomputed = (await this.table)?.get(prefix);
    if (precomputed !== undefined) {
      return precomputed;
    }
    return this.backing.entryNamesByPrefix(prefix);
  }
}
