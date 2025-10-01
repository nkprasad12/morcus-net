import { ApiRoute } from "@/web/utils/rpc/rpc";
import {
  isAny,
  isArray,
  isNumber,
  isOneOf,
  isString,
  matchesObject,
  maybeUndefined,
} from "@/web/utils/rpc/parsing";
import {
  CompletionsFusedRequest,
  CompletionsFusedResponse,
  DictsFusedRequest,
  DictsFusedResponse,
} from "@/common/dictionaries/dictionaries";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import {
  ListLibraryWorksResponse,
  ProcessedWork2,
  WorkId,
} from "@/common/library/library_types";
import type { ClientEventData } from "@/web/telemetry/telemetry";
import { CorpusQueryResult } from "@/common/library/corpus/corpus_common";

export interface FormOptions {
  lemma: string;
  morph: string[];
}

export interface MacronizedWord {
  word: string;
  options: {
    form: string;
    options: FormOptions[];
  }[];
  suggested?: number;
}

export type MacronizedResult = (MacronizedWord | string)[];

export const MacronizeApi: ApiRoute<string, MacronizedResult> = {
  path: "/api/macronize",
  method: "POST",
  inputValidator: isString,
  outputValidator: isArray(
    isOneOf(
      isString,
      matchesObject<MacronizedWord>({
        word: isString,
        options: isArray(isAny),
        suggested: maybeUndefined(isNumber),
      })
    )
  ),
};

export const DictsFusedApi: ApiRoute<DictsFusedRequest, DictsFusedResponse> = {
  path: "/api/dicts/fused",
  method: "GET",
  inputValidator: DictsFusedRequest.isMatch,
  outputValidator: DictsFusedResponse.isMatch,
  registry: [XmlNodeSerialization.DEFAULT],
};

export const CompletionsFusedApi: ApiRoute<
  CompletionsFusedRequest,
  CompletionsFusedResponse
> = {
  path: "/api/completions/fused",
  method: "GET",
  inputValidator: CompletionsFusedRequest.isMatch,
  outputValidator: CompletionsFusedResponse.isMatch,
};

export interface ReportApiRequest {
  reportText: string;
  commit: string;
  url?: string;
  userAgent?: string;
  tags?: string[];
}

export const ReportApi: ApiRoute<ReportApiRequest, any> = {
  path: "/api/report",
  method: "POST",
  inputValidator: matchesObject<ReportApiRequest>({
    reportText: isString,
    commit: isString,
    url: maybeUndefined(isString),
    userAgent: maybeUndefined(isString),
    tags: maybeUndefined(isArray(isString)),
  }),
  outputValidator: isAny,
};

export const ListLibraryWorks: ApiRoute<any, ListLibraryWorksResponse> = {
  path: "/api/library/list",
  method: "GET",
  inputValidator: isAny,
  outputValidator: ListLibraryWorksResponse.isMatch,
};

export const GetWork: ApiRoute<WorkId, ProcessedWork2> = {
  path: "/api/library/work",
  method: "GET",
  inputValidator: WorkId.isMatch,
  outputValidator: ProcessedWork2.isMatch,
  registry: [XmlNodeSerialization.DEFAULT],
};

export const ScrapeUrlApi: ApiRoute<string, string> = {
  path: "/api/scrapeUrl",
  method: "GET",
  inputValidator: isString,
  outputValidator: isString,
};

export const LogClientEventApi: ApiRoute<ClientEventData, any> = {
  path: "/api/logClientEvent",
  method: "POST",
  inputValidator: matchesObject<ClientEventData>({
    name: isString,
    extras: isAny,
  }),
  outputValidator: isAny,
};

export interface CorpusQueryRequest {
  query: string;
  commitHash?: string;
  pageStart?: number;
  pageSize?: number;
  contextLen?: number;
}

export const QueryCorpusApi: ApiRoute<CorpusQueryRequest, CorpusQueryResult> = {
  path: "/api/corpus/query",
  method: "GET",
  inputValidator: matchesObject<CorpusQueryRequest>({
    query: isString,
    commitHash: maybeUndefined(isString),
    pageStart: maybeUndefined(isNumber),
    pageSize: maybeUndefined(isNumber),
    contextLen: maybeUndefined(isNumber),
  }),
  outputValidator: CorpusQueryResult.isMatch,
};

export interface GetCorpusAuthorsRequest {
  commitHash?: string;
}

export const GetCorpusAuthorsApi: ApiRoute<GetCorpusAuthorsRequest, string[]> =
  {
    path: "/api/corpus/authors",
    method: "GET",
    inputValidator: matchesObject<GetCorpusAuthorsRequest>({
      commitHash: maybeUndefined(isString),
    }),
    outputValidator: isArray(isString),
  };
