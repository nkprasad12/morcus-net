// import { XmlNode } from "@/common/lewis_and_short/xml_node";
import { ApiRoute } from "./utils/rpc/api_route";

function isString(x: unknown): x is string {
  return typeof x === "string";
}

function isArray<T>(x: unknown, tVal: (t: unknown) => t is T): x is T[] {
  if (!Array.isArray(x)) {
    return false;
  }
  for (const t of x) {
    if (!tVal(t)) {
      return false;
    }
  }
  return true;
}

export const MacronizeApi: ApiRoute<string, string> = {
  path: "/api/macronize",
  method: "POST",
  inputValidator: isString,
  outputValidator: isString,
};

export function macronizeCall(): string {
  return `/api/macronize/`;
}

// export const DictsLsApi: ApiRoute<string, XmlNode[]> = {
//   path: "/api/dict/ls",
//   method: "GET",
//   inputValidator: isString,
//   outputValidator: isString,
// };

export function lsCall(entry: string): string {
  return `/api/dicts/ls/${entry}`;
}

export const EntriesByPrefixApi: ApiRoute<string, string[]> = {
  path: "/api/dicts/entriesByPrefix",
  method: "GET",
  inputValidator: isString,
  outputValidator: (x): x is string[] => isArray(x, isString),
};

export function entriesByPrefix(prefix: string): string {
  return `/api/dicts/entriesByPrefix/${prefix}`;
}

export const ReportApi: ApiRoute<string, any> = {
  path: "/api/report",
  method: "POST",
  inputValidator: isString,
  outputValidator: (x): x is any => true,
};

export function report(): string {
  return `/api/report/`;
}
