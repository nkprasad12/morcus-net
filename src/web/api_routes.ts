import { ApiRoute } from "@/web/utils/rpc/rpc";
import {
  isAny,
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
  ProcessedWork,
  WorkId,
} from "@/common/library/library_types";

export const MacronizeApi: ApiRoute<string, string> = {
  path: "/api/macronize",
  method: "POST",
  inputValidator: isString,
  outputValidator: isString,
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
}

export const ReportApi: ApiRoute<ReportApiRequest, any> = {
  path: "/api/report",
  method: "POST",
  inputValidator: matchesObject<ReportApiRequest>({
    reportText: isString,
    commit: isString,
    url: maybeUndefined(isString),
    userAgent: maybeUndefined(isString),
  }),
  outputValidator: isAny,
};

export const ListLibraryWorks: ApiRoute<any, ListLibraryWorksResponse> = {
  path: "/api/library/list",
  method: "GET",
  inputValidator: isAny,
  outputValidator: ListLibraryWorksResponse.isMatch,
};

export const GetWork: ApiRoute<WorkId, ProcessedWork> = {
  path: "/api/library/work",
  method: "GET",
  inputValidator: WorkId.isMatch,
  outputValidator: ProcessedWork.isMatch,
  registry: [XmlNodeSerialization.DEFAULT],
};

export const ScrapeUrlApi: ApiRoute<string, string> = {
  path: "/api/scrapeUrl",
  method: "GET",
  inputValidator: isString,
  outputValidator: isString,
};
