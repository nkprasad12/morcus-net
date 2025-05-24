import { EntryResult } from "@/common/dictionaries/dict_result";
import { XmlNode } from "@/common/xml/xml_node";
import {
  isArray,
  isRecord,
  isString,
  matchesObject,
  maybeUndefined,
} from "@/web/utils/rpc/parsing";
import { ServerExtras } from "@/web/utils/rpc/server_rpc";

const DICT_LANGS = ["La", "En", "Fr", "De", "Es", "*"] as const;
const DICT_LANGS_SET = new Set<string>(DICT_LANGS);
export type DictLang = (typeof DICT_LANGS)[number];

export function isDictLang(input: string): input is DictLang {
  return DICT_LANGS_SET.has(input);
}

export interface DictType {
  from: DictLang;
  to: DictLang;
}

export type DictTags = "Classical" | "Other" | "Numeral";

export interface DictInfo {
  key: string;
  displayName: string;
  languages: DictType;
  tags?: DictTags[];
}

export interface DictResult {
  entry: XmlNode;
}

export interface DictOptions {
  handleInflections: boolean;
}

export interface Dictionary {
  /** Basic information about this dictionary. */
  readonly info: DictInfo;
  /** Returns entries with keys matching the input. */
  getEntry(
    input: string,
    extras?: ServerExtras,
    options?: DictOptions
  ): Promise<EntryResult[]>;
  /** Returns the entry, if any, with the given id. */
  getEntryById(
    id: string,
    extras?: ServerExtras
  ): Promise<EntryResult | undefined>;
  /** Returns all entry keys matching the input prefix. */
  getCompletions(input: string, extras?: ServerExtras): Promise<string[]>;
}

export type DictRequestMode =
  | 0 // Search by keys only
  | 1 // Search by keys and inflected forms
  | 2; // Search by ids only

function isDictRequestMode(x: unknown): x is DictRequestMode {
  return x === 0 || x === 1 || x === 2;
}

export interface DictsFusedRequest {
  query: string;
  dicts: string[];
  mode?: DictRequestMode;
  commitHash?: string;
}

export namespace DictsFusedRequest {
  export const isMatch: (x: unknown) => x is DictsFusedRequest =
    matchesObject<DictsFusedRequest>({
      query: isString,
      dicts: isArray(isString),
      mode: maybeUndefined(isDictRequestMode),
      commitHash: maybeUndefined(isString),
    });
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
    matchesObject<CompletionsFusedRequest>({
      query: isString,
      dicts: isArray(isString),
    });
}

export interface CompletionsFusedResponse {
  [key: string]: string[];
}

export namespace CompletionsFusedResponse {
  export const isMatch: (x: unknown) => x is CompletionsFusedResponse =
    isRecord(isArray(isString));
}
