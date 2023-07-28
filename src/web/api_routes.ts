import { ApiRoute } from "@/web/utils/rpc/rpc";
import {
  isAny,
  isArray,
  isString,
  matches,
  typeOf,
} from "@/web/utils/rpc/parsing";
import { LsResult } from "@/web/utils/rpc/ls_api_result";
import { LsDict } from "@/common/lewis_and_short/ls_xml_utils";

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
  registry: [LsDict.SERIALIZATION],
};

export const EntriesByPrefixApi: ApiRoute<string, string[]> = {
  path: "/api/dicts/entriesByPrefix",
  method: "GET",
  inputValidator: isString,
  outputValidator: isArray(typeOf("string")),
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
