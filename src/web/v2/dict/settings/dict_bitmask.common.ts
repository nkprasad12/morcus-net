/**
 * PERMANENT APPEND-ONLY REGISTRY.
 * Indices must NEVER be altered, shifted, or re-ordered.
 * New dictionaries must strictly be appended to the end of this array.
 *
 * Current 9 dictionaries:
 * 0: Lewis & Short (L&S) -> bit 0 (value: 1)
 * 1: Gaffiot (GAF)       -> bit 1 (value: 2)
 * 2: Gesner (GES)        -> bit 2 (value: 4)
 * 3: Forcellini (FOR)    -> bit 3 (value: 8)
 * 4: Smith & Hall (S&H)  -> bit 4 (value: 16)
 * 5: Riddle & Arnold (R&A)-> bit 5 (value: 32)
 * 6: Georges (GRG)       -> bit 6 (value: 64)
 * 7: Pozo (EGL)          -> bit 7 (value: 128)
 * 8: Numeral (NUM)       -> bit 8 (value: 256)
 */
export const DICT_BIT_REGISTRY: readonly string[] = [
  "L&S",
  "GAF",
  "GES",
  "FOR",
  "S&H",
  "R&A",
  "GRG",
  "EGL",
  "NUM",
] as const;

/**
 * Bitmask encoding for default active dictionaries:
 * All available dictionaries except Pozo (EGL):
 * L&S (1) + GAF (2) + GES (4) + FOR (8) + S&H (16) + R&A (32) + GRG (64) + NUM (256) = 383 -> "an" in base 36
 */
export const DEFAULT_DICT_BITMASK = "an";

/** Default dictionary selection: all available Latin dictionaries except Pozo (matches V1 default). */
export const DEFAULT_DICT_KEYS: readonly string[] = DICT_BIT_REGISTRY.filter(
  (k) => k !== "EGL"
);

/**
 * Encodes an iterable of canonical dictionary keys into a Base36 bitmask string.
 * Example: ["L&S", "GAF"] -> (1 | 2) = 3 -> "3"
 * Default all 8 enabled (everything except Pozo) -> 383 -> "an"
 */
export function encodeDictBitmask(activeKeys: Iterable<string>): string {
  let mask = 0;
  for (const key of activeKeys) {
    const index = DICT_BIT_REGISTRY.indexOf(key);
    if (index >= 0) {
      mask |= 1 << index;
    }
  }
  return mask.toString(36);
}

/** A canonical encoded bitmask: lowercase base36 only, as `encodeDictBitmask` writes it. */
const CANONICAL_BITMASK = /^[0-9a-z]{1,3}$/;

/**
 * Decodes a Base36 bitmask string back into an array of canonical dictionary keys.
 * Forward-compatible: safely ignores bits beyond known registry without throwing errors.
 * Returns null if input is empty, non-base36, <= 0, or matches no known dictionaries.
 */
export function decodeDictBitmask(
  encoded: string | null | undefined
): string[] | null {
  if (!encoded || typeof encoded !== "string") return null;
  const trimmed = encoded.trim().toLowerCase();
  if (!trimmed || !CANONICAL_BITMASK.test(trimmed)) return null;

  const mask = parseInt(trimmed, 36);
  if (isNaN(mask) || mask <= 0) return null;

  const keys: string[] = [];
  for (let i = 0; i < DICT_BIT_REGISTRY.length; i++) {
    if ((mask & (1 << i)) !== 0) {
      keys.push(DICT_BIT_REGISTRY[i]);
    }
  }

  return keys.length > 0 ? keys : null;
}

/**
 * Like `decodeDictBitmask`, but rejects anything `encodeDictBitmask` could not have written.
 *
 * Use this for values we stored ourselves (the preference cookie). `parseInt` stops at the first
 * non-base36 character instead of failing, so a stale or foreign value such as `"L&S;GAF"` would
 * otherwise decode as `"l"` = 21, i.e. a plausible but wrong selection (L&S + GES + S&H).
 */
export function decodeStoredDictBitmask(
  encoded: string | null | undefined
): string[] | null {
  if (!encoded || !CANONICAL_BITMASK.test(encoded)) return null;
  return decodeDictBitmask(encoded);
}

export interface NormalizedDictParams {
  readonly o: "0" | "1";
  readonly d: string | undefined;
}

/**
 * Normalizes raw `o` and `d` URL parameters:
 * - `o`: `"1"` only for `"1"` (or `"true"`), otherwise `"0"`.
 * - `d`: canonical base36 bitmask if it decodes to at least one known dictionary,
 *   otherwise `undefined` (fall back to saved cookie or default dictionaries).
 */
export function normalizeDictParams(
  params:
    | URLSearchParams
    | { readonly o?: string | null; readonly d?: string | null }
): NormalizedDictParams {
  const rawO =
    params instanceof URLSearchParams ? params.get("o") : params.o ?? null;
  const rawD =
    params instanceof URLSearchParams ? params.get("d") : params.d ?? null;
  const o: "0" | "1" = rawO === "1" || rawO === "true" ? "1" : "0";
  const decodedKeys = decodeDictBitmask(rawD);
  const d = decodedKeys ? encodeDictBitmask(decodedKeys) : undefined;
  return { o, d };
}
