import { removeDiacritics } from "@/common/text_cleaning";
import { callApi } from "@/web/utils/rpc/client_rpc";
import {
  CompletionsFusedRequest,
  CompletionsFusedResponse,
} from "@/common/dictionaries/dictionaries";
import { CompletionsFusedApi } from "@/web/api_routes";
import { checkPresent } from "@/common/assert";

interface CachePair {
  dictKey: string;
  queryKey: string;
}

export class FusedAutocompleteFetcher {
  private readonly perDictCache: Map<string, Map<string, Promise<string[]>>> =
    new Map();

  private get(key: CachePair): Promise<string[]> | undefined {
    if (!this.perDictCache.has(key.dictKey)) {
      this.perDictCache.set(key.dictKey, new Map());
    }
    return this.perDictCache.get(key.dictKey)!.get(key.queryKey);
  }

  private set(key: CachePair, value: Promise<string[]>): void {
    if (!this.perDictCache.has(key.dictKey)) {
      this.perDictCache.set(key.dictKey, new Map());
    }
    this.perDictCache.get(key.dictKey)!.set(key.queryKey, value);
  }

  private delete(key: CachePair): void {
    this.perDictCache.get(key.dictKey)?.delete(key.queryKey);
  }

  private fetchMissing(
    missing: CachePair[]
  ): Promise<CompletionsFusedResponse> {
    if (missing.length === 0) {
      // This is fine since we'll never read this.
      return Promise.resolve({});
    }
    const params = {
      query: missing[0].queryKey,
      dicts: missing.map((m) => m.dictKey),
    };
    return callApi(CompletionsFusedApi, params);
  }

  async getOptions(
    request: CompletionsFusedRequest
  ): Promise<CompletionsFusedResponse> {
    const queryKey = removeDiacritics(request.query).toLowerCase();
    const response: Record<string, string[]> = {};
    for (const dictKey of request.dicts) {
      response[dictKey] = [];
    }
    if (queryKey.length !== 1) {
      return response;
    }

    const allKeys = request.dicts.map((dictKey) => ({ dictKey, queryKey }));
    const allCurrent: [CachePair, Promise<string[]> | undefined][] =
      allKeys.map((key) => [key, this.get(key)]);
    const missing = allCurrent.filter(([_, result]) => result === undefined);

    const fetchResult = this.fetchMissing(missing.map((m) => m[0]));
    const allResults: [CachePair, Promise<string[]>][] = allCurrent.map(
      ([key, maybeResult]) => {
        if (maybeResult !== undefined) {
          return [key, maybeResult];
        }
        const result = fetchResult.then((fused) =>
          checkPresent(fused[key.dictKey])
        );
        this.set(key, result);
        return [key, result];
      }
    );

    const missingSet = new Set(missing.map((p) => p[0].dictKey));
    for (const [key, result] of allResults) {
      try {
        response[key.dictKey] = await result;
      } catch (e) {
        if (missingSet.has(key.dictKey)) {
          this.delete(key);
        }
      }
    }

    return response;
  }
}

let fusedAutocomplete: FusedAutocompleteFetcher | undefined = undefined;

export namespace FusedAutocompleteFetcher {
  export function get() {
    if (fusedAutocomplete === undefined) {
      fusedAutocomplete = new FusedAutocompleteFetcher();
    }
    return fusedAutocomplete;
  }
}
