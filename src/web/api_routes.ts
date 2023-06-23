import { XmlNode } from "@/common/lewis_and_short/xml_node";
import { ApiRoute } from "./utils/rpc/rpc";
import {
  instanceOf,
  isAny,
  isArray,
  isString,
  typeOf,
} from "./utils/rpc/parsing";

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
  outputValidator: isArray(instanceOf(XmlNode)),
  registry: [XmlNode.SERIALIZATION],
};

export const EntriesByPrefixApi: ApiRoute<string, string[]> = {
  path: "/api/dicts/entriesByPrefix",
  method: "GET",
  inputValidator: isString,
  outputValidator: isArray(typeOf("string")),
};

export const ReportApi: ApiRoute<string, any> = {
  path: "/api/report",
  method: "POST",
  inputValidator: isString,
  outputValidator: isAny,
};
