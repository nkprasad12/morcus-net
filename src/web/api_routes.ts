import { ApiRoute } from "@/web/utils/rpc/rpc";
import {
  isAny,
  isArray,
  isString,
  matches,
  typeOf,
} from "@/web/utils/rpc/parsing";
import { LsResult } from "@/web/utils/rpc/ls_api_result";
import {
  CompletionsFusedRequest,
  CompletionsFusedResponse,
  DictsFusedRequest,
  DictsFusedResponse,
} from "@/common/dictionaries/dictionaries";
import { XmlNodeSerialization } from "@/common/xml_node_serialization";

export const MacronizeApi: ApiRoute<string, string> = {
  path: "/api/macronize",
  method: "POST",
  inputValidator: isString,
  outputValidator: isString,
};

export const DictsLsApi: ApiRoute<string, LsResult[]> = {
  path: "/api/dict/ls",
  method: "GET",
  inputValidator: isString,
  outputValidator: isArray(LsResult.isMatch),
  registry: [XmlNodeSerialization.DEFAULT],
};

export const DictsFusedApi: ApiRoute<DictsFusedRequest, DictsFusedResponse> = {
  path: "/api/dicts/fused",
  method: "GET",
  inputValidator: DictsFusedRequest.isMatch,
  outputValidator: DictsFusedResponse.isMatch,
  registry: [XmlNodeSerialization.DEFAULT],
};

export const EntriesByPrefixApi: ApiRoute<string, string[]> = {
  path: "/api/dicts/entriesByPrefix",
  method: "GET",
  inputValidator: isString,
  outputValidator: isArray(typeOf("string")),
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
}

export const ReportApi: ApiRoute<ReportApiRequest, any> = {
  path: "/api/report",
  method: "POST",
  inputValidator: matches<ReportApiRequest>([
    ["reportText", isString],
    ["commit", isString],
  ]),
  outputValidator: isAny,
};
