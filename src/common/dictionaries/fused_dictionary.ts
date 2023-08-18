import { checkPresent } from "@/common/assert";
import {
  CompletionsFusedRequest,
  CompletionsFusedResponse,
  Dictionary,
  DictsFusedRequest,
  DictsFusedResponse,
} from "@/common/dictionaries/dictionaries";
import { ServerExtras } from "@/web/utils/rpc/server_rpc";

interface FusedRequest {
  query: string;
  dicts: string[];
}

export class FusedDictionary {
  private readonly dictMap = new Map<string, Dictionary>();

  constructor(readonly dictionaries: Dictionary[]) {
    for (const dictionary of dictionaries) {
      this.dictMap.set(dictionary.info.key, dictionary);
    }
  }

  private async collectResults<Req extends FusedRequest, Res>(
    request: Req,
    invocation: (dict: Dictionary, query: string) => Promise<Res>
  ): Promise<Record<string, Res>> {
    const allPending: Promise<[string, Res]>[] = request.dicts
      .filter((dictKey) => this.dictMap.has(dictKey))
      .map((dictKey) => checkPresent(this.dictMap.get(dictKey)))
      .map((dict) =>
        invocation(dict, request.query).then((result) => [
          dict.info.key,
          result,
        ])
      );
    const result: Record<string, Res> = {};
    for (const pending of allPending) {
      try {
        const dictResult = await pending;
        result[dictResult[0]] = dictResult[1];
      } catch (e) {
        console.log(e);
      }
    }
    return result;
  }

  async getEntry(
    request: DictsFusedRequest,
    extras?: ServerExtras
  ): Promise<DictsFusedResponse> {
    const callable = (dict: Dictionary, query: string) =>
      dict.getEntry(query, extras);
    return this.collectResults(request, callable);
  }

  async getCompletions(
    request: CompletionsFusedRequest,
    extras?: ServerExtras
  ): Promise<CompletionsFusedResponse> {
    const callable = (dict: Dictionary, query: string) =>
      dict.getCompletions(query, extras);
    return this.collectResults(request, callable);
  }
}
