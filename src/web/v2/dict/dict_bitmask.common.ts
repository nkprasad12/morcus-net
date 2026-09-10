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

/** Canonical alias lookup mapping variant keys/names to registry keys */
const ALIAS_TO_REGISTRY_KEY = new Map<string, string>();
for (const key of DICT_BIT_REGISTRY) {
  ALIAS_TO_REGISTRY_KEY.set(key.toUpperCase(), key);
  ALIAS_TO_REGISTRY_KEY.set(key.toLowerCase(), key);
  ALIAS_TO_REGISTRY_KEY.set(key.replace("&", "n").toUpperCase(), key);
  ALIAS_TO_REGISTRY_KEY.set(key.replace("&", "n").toLowerCase(), key);
}
// Add descriptive aliases
ALIAS_TO_REGISTRY_KEY.set("LS", "L&S");
ALIAS_TO_REGISTRY_KEY.set("SH", "S&H");
ALIAS_TO_REGISTRY_KEY.set("RA", "R&A");
ALIAS_TO_REGISTRY_KEY.set("GAFFIOT", "GAF");
ALIAS_TO_REGISTRY_KEY.set("GEORGES", "GRG");
ALIAS_TO_REGISTRY_KEY.set("POZO", "EGL");
ALIAS_TO_REGISTRY_KEY.set("GESNER", "GES");
ALIAS_TO_REGISTRY_KEY.set("FORCELLINI", "FOR");
ALIAS_TO_REGISTRY_KEY.set("NUMERAL", "NUM");

/**
 * Bitmask encoding for default active dictionaries:
 * All available dictionaries except Pozo (EGL):
 * L&S (1) + GAF (2) + GES (4) + FOR (8) + S&H (16) + R&A (32) + GRG (64) + NUM (256) = 383 -> "an" in base 36
 */
export const DEFAULT_DICT_BITMASK = "an";

export const DEFAULT_DICT_KEYS: readonly string[] = DICT_BIT_REGISTRY.filter(
  (k) => k !== "EGL"
);

/**
 * Latin-source dictionaries: all lexicons where source language is Latin (La) or wildcard (*):
 * L&S (1), GAF (2), GES (4), FOR (8), NUM (256).
 * (1 | 2 | 4 | 8 | 256) = 271 -> "7j" in base 36.
 */
export const LATIN_SOURCE_DICT_KEYS: readonly string[] = [
  "L&S",
  "GAF",
  "GES",
  "FOR",
  "NUM",
];
export const LATIN_SOURCE_DICT_BITMASK = "7j";

/**
 * Encodes an iterable of dictionary keys into a Base36 bitmask string.
 * Example: ["L&S", "GAF"] -> (1 | 2) = 3 -> "3"
 * Default all 8 enabled (everything except Pozo) -> 383 -> "an"
 */
export function encodeDictBitmask(activeKeys: Iterable<string>): string {
  let mask = 0;
  for (const rawKey of activeKeys) {
    const canonical = ALIAS_TO_REGISTRY_KEY.get(rawKey.trim().toUpperCase());
    if (!canonical) continue;
    const index = DICT_BIT_REGISTRY.indexOf(canonical);
    if (index >= 0) {
      mask |= 1 << index;
    }
  }
  return mask.toString(36);
}

/**
 * Decodes a Base36 bitmask string back into an array of canonical dictionary keys.
 * Forward-compatible: safely ignores bits beyond known registry without throwing errors.
 * Returns null if input is empty, non-numeric, or <= 0.
 */
export function decodeDictBitmask(
  encoded: string | null | undefined
): string[] | null {
  if (!encoded || typeof encoded !== "string") return null;
  const trimmed = encoded.trim().toLowerCase();
  if (!trimmed) return null;

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
