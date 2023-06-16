import { XmlNode } from "@/common/lewis_and_short/xml_node";
import { ApiRoute } from "./api_route";
import { isArray, isString } from "./parsing";

export const MacronizeApi: ApiRoute<string, string> = {
  path: "/api/macronize",
  method: "POST",
  inputValidator: isString,
  outputValidator: isString,
};

export const DictsLsApi: ApiRoute<string, XmlNode[]> = {
  path: "/api/dict/ls",
  method: "GET",
  inputValidator: isString,
  outputValidator: isArray((n): n is XmlNode => n instanceof XmlNode),
};

export const EntriesByPrefixApi: ApiRoute<string, string[]> = {
  path: "/api/dicts/entriesByPrefix",
  method: "GET",
  inputValidator: isString,
  outputValidator: isArray(isString),
};

export const ReportApi: ApiRoute<string, any> = {
  path: "/api/report",
  method: "POST",
  inputValidator: isString,
  outputValidator: (x): x is any => true,
};
