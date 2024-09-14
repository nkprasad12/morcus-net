import { removeDiacritics } from "@/common/text_cleaning";
import { ServerExtras } from "@/web/utils/rpc/server_rpc";
import { Vowels } from "@/common/character_utils";
import { setMap } from "@/common/data_structures/collect_map";
import type { StoredDictBacking } from "@/common/dictionaries/stored_dict_interface";

/** A generic stored dictionary. */
export class StoredDict {
  private readonly table: Promise<Map<string, string[]>>;

  constructor(private readonly backing: StoredDictBacking<any>) {
    this.table = Promise.resolve(this.backing.allEntryNames()).then(
      (entries) => {
        const lookup = setMap<string, string>();
        entries.forEach(({ orth, cleanOrth }) =>
          lookup.add(cleanOrth[0].toLowerCase(), orth)
        );
        return new Map([...lookup.map.entries()].map((e) => [e[0], [...e[1]]]));
      }
    );
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
    return toRegularArray(entryStrings, ({ entry }) => entry);
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
    const precomputed = (await this.table).get(prefix);
    if (precomputed !== undefined) {
      return precomputed;
    }
    const rows = await this.backing.entryNamesByPrefix(prefix);
    return toRegularArray(rows, (row) => row.orth);
  }
}

function toRegularArray<T, U>(input: T[], mapper: (t: T) => U) {
  // Somehow, the native result from `.all()` isn't quite a regular array.
  // This makes the jest checks for strict equality fail, so manually do
  // the map.
  const result: U[] = Array(input.length);
  input.forEach((value, i) => {
    result[i] = mapper(value);
  });
  return result;
}
