import { LatinDict, LatinDictInfo } from "@/common/dictionaries/latin_dicts";
import { decodeDictBitmask } from "@/web/v2/dict/dict_bitmask.common";

/** Default dictionary selection: all available Latin dictionaries except Pozo (matches V1 default). */
export const DEFAULT_DICTS: LatinDictInfo[] = LatinDict.AVAILABLE.filter(
  (d) => d !== LatinDict.Pozo
);

export const DEFAULT_DICT_KEYS: string[] = DEFAULT_DICTS.map((d) => d.key);

/**
 * Normalizes a URL dictionary parameter into canonical LatinDict keys.
 * Supports:
 * - Hyphen, semicolon, or comma separated strings: "ls-gaffiot", "L&S,GAF", "L&S;GAF"
 * - Array of strings (e.g. from repeated `dict=ls&dict=gaffiot` query params)
 * - Safe mapping of 'n' <-> '&' (e.g. "LnS" <-> "L&S", "SnH" <-> "S&H")
 *
 * Deliberately does NOT interpret base36 bitmasks. Every short alphanumeric token is a valid
 * base36 integer, so guessing here silently mangled real keys: "GAF" parsed as 21111, whose bits
 * select six unrelated dictionaries, and "ls" parsed as 784, selecting S&H and NUM. Bitmasks
 * arrive only via `?d=` and are decoded by `decodeDictBitmask`.
 */
export function parseDictKeys(
  raw: string | string[] | undefined | null
): string[] | null {
  if (!raw) return null;

  // Delimiters are split per entry, not just for scalars: `getAll` and repeated query params both
  // hand us an array whose entries may still be delimited lists (`?dict=ls,gaffiot`).
  // No canonical key or alias contains ';', ',' or '-', so this split is always safe.
  const rawList: string[] = (Array.isArray(raw) ? raw : [raw]).flatMap((item) =>
    item.split(/[;,-]/)
  );

  const parsedKeys: string[] = [];
  for (const item of rawList) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    // Map URL safe representations 'LnS' / 'SnH' or 'RnA' back to '&'
    const unaliased = trimmed.replace(/([a-zA-Z])n([a-zA-Z])/g, "$1&$2");
    // Find matching dict in LatinDict.AVAILABLE by key (case-insensitive or exact)
    const match = LatinDict.AVAILABLE.find(
      (d) =>
        d.key.toLowerCase() === trimmed.toLowerCase() ||
        d.key.toLowerCase() === unaliased.toLowerCase() ||
        (trimmed.toLowerCase() === "ls" && d.key === "L&S") ||
        (trimmed.toLowerCase() === "sh" && d.key === "S&H") ||
        (trimmed.toLowerCase() === "gaffiot" && d.key === "GAF") ||
        (trimmed.toLowerCase() === "georges" && d.key === "GRG") ||
        (trimmed.toLowerCase() === "pozo" && d.key === "EGL") ||
        (trimmed.toLowerCase() === "gesner" && d.key === "GES") ||
        (trimmed.toLowerCase() === "forcellini" && d.key === "FOR") ||
        (trimmed.toLowerCase() === "riddle_arnold" && d.key === "R&A") ||
        (trimmed.toLowerCase() === "numeral" && d.key === "NUM")
    );
    if (match && !parsedKeys.includes(match.key)) {
      parsedKeys.push(match.key);
    }
  }

  return parsedKeys.length > 0 ? parsedKeys : null;
}

/**
 * Resolves inflection mode from URL query parameter(s).
 *
 * Handles scalar strings ("1" | "0" | "true" | "false") as well as the multi-value arrays produced
 * by No-JS HTML forms: the search bar pairs a hidden `o=0` with a checkbox `o=1`, so a checked box
 * submits `o=0&o=1`, which Express parses as `["0", "1"]`.
 *
 * Returns undefined when the parameter is absent or unrecognized, signalling callers to fall back
 * to their stored preference (cookie on the server, localStorage on the client).
 */
export function parseInflectionParam(
  raw: string | string[] | undefined | null
): boolean | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (Array.isArray(raw)) {
    if (raw.length === 0) return undefined;
    // The checkbox only submits when checked, so its presence anywhere wins over the hidden default.
    if (raw.includes("1") || raw.includes("true")) return true;
    if (raw.includes("0") || raw.includes("false")) return false;
    return undefined;
  }
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return undefined;
}

export interface DictParamsInput {
  /** Explicit keys from `?dict=`, i.e. the No-JS form checkboxes. Highest precedence. */
  dictParam?: string | string[] | null;
  /** Base36 bitmask from `?d=`, written by the JS client when it syncs the URL. */
  bitmaskParam?: string | null;
  /** Legacy `?in=` parameter. */
  inParam?: string | string[] | null;
}

function paramLength(raw: string | string[] | undefined | null): number {
  if (Array.isArray(raw)) return raw.length;
  return raw ? 1 : 0;
}

/**
 * Resolves active dictionary keys from URL query parameters, in strict precedence order:
 * 1. Form checkboxes / explicit keys (`?dict=`)
 * 2. Base36 bitmask (`?d=`)
 * 3. Legacy parameter (`?in=`)
 *
 * The checkboxes must outrank the bitmask: in No-JS mode they are the only controls the user can
 * actually change, while any bitmask in the same submission is frozen to the previous render.
 *
 * Returns null when no dictionary parameter was supplied at all, signalling callers to fall back
 * to their stored preference.
 */
export function resolveDictParams(input: DictParamsInput): string[] | null {
  if (paramLength(input.dictParam) > 0) {
    const fromDict = parseDictKeys(input.dictParam);
    if (fromDict && fromDict.length > 0) return fromDict;
  }
  if (input.bitmaskParam) {
    const fromBitmask = decodeDictBitmask(input.bitmaskParam);
    if (fromBitmask && fromBitmask.length > 0) return fromBitmask;
  }
  if (paramLength(input.inParam) > 0) {
    const fromIn = parseDictKeys(input.inParam);
    if (fromIn && fromIn.length > 0) return fromIn;
  }
  return null;
}
