import { EntryResult } from "@/common/dictionaries/dict_result";
import { XmlNode } from "@/common/xml_node";
import { isArray, isRecord, isString, matches } from "@/web/utils/rpc/parsing";
import { ServerExtras } from "@/web/utils/rpc/server_rpc";

export type DictLang = "La" | "En";

export interface DictType {
  from: DictLang;
  to: DictLang;
}

export type DictTags = "Classical" | "Other";

export interface DictInfo {
  key: string;
  displayName: string;
  languages: DictType;
  tags?: DictTags[];
}

export interface DictResult {
  entry: XmlNode;
}

export interface Dictionary {
  readonly info: DictInfo;
  getEntry(input: string, extras?: ServerExtras): Promise<EntryResult[]>;
  getCompletions(input: string, extras?: ServerExtras): Promise<string[]>;
}

export interface DictsFusedRequest {
  query: string;
  dicts: string[];
}

export namespace DictsFusedRequest {
  export const isMatch: (x: unknown) => x is DictsFusedRequest =
    matches<DictsFusedRequest>([
      ["query", isString],
      ["dicts", isArray<string>(isString)],
    ]);
}

export interface DictsFusedResponse {
  [key: string]: EntryResult[];
}

export namespace DictsFusedResponse {
  export const isMatch: (x: unknown) => x is DictsFusedResponse = isRecord(
    isArray(EntryResult.isMatch)
  );
}

export type CompletionMode = "Prefix";

export interface CompletionsFusedRequest {
  query: string;
  dicts: string[];
}

export namespace CompletionsFusedRequest {
  export const isMatch: (x: unknown) => x is CompletionsFusedRequest =
    matches<CompletionsFusedRequest>([
      ["query", isString],
      ["dicts", isArray<string>(isString)],
    ]);
}

export interface CompletionsFusedResponse {
  [key: string]: string[];
}

export namespace CompletionsFusedResponse {
  export const isMatch: (x: unknown) => x is CompletionsFusedResponse =
    isRecord(isArray(isString));
}
