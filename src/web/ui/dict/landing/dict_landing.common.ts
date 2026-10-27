import {
  DICT_BIT_REGISTRY,
  DICT_SOURCE_LANG,
} from "@/web/ui/dict/settings/dict_bitmask.common";

/**
 * Formats natural language list with Oxford comma:
 * - ["English"] => "English"
 * - ["English", "German"] => "English and German"
 * - ["English", "German", "Spanish"] => "English, German, and Spanish"
 */
function formatLanguageList(languages: string[]): string {
  if (languages.length === 0) return "";
  if (languages.length === 1) return languages[0];
  if (languages.length === 2) return `${languages[0]} and ${languages[1]}`;
  return `${languages.slice(0, -1).join(", ")}, and ${
    languages[languages.length - 1]
  }`;
}

export function fullLangName(code: string): string {
  switch (code) {
    case "La":
      return "Latin";
    case "En":
      return "English";
    case "Fr":
      return "French";
    case "De":
      return "German";
    case "Es":
      return "Spanish";
    default:
      return code;
  }
}

/**
 * Generates the contextual welcome sentence based on active dictionary keys and inflection state.
 * Handles all combinations of Latin-source, inflection state, and reverse-source dictionaries:
 * - Inflected on + Latin + Modern: "Welcome to the dictionary. You can search Latin headwords and inflected forms, and words in English and German."
 * - Inflected off + Latin + Modern: "Welcome to the dictionary. You can search Latin headwords, and words in English and German."
 * - Inflected on + Latin only: "Welcome to the dictionary. You can search Latin headwords and inflected forms."
 * - Inflected off + Latin only: "Welcome to the dictionary. You can search Latin headwords."
 * - Modern only: "Welcome to the dictionary. You can search words in English."
 * - None: "Welcome to the dictionary. Please enable at least one dictionary in settings."
 */
export function buildWelcomeMessage(
  activeDictKeys: Iterable<string>,
  isInflected: boolean = true
): string {
  const activeKeysSet = new Set(
    Array.from(activeDictKeys).map((k) => k.toUpperCase())
  );

  let hasLatinSource = false;
  const reverseLanguagesSet = new Set<string>();

  for (const key of DICT_BIT_REGISTRY) {
    if (!activeKeysSet.has(key)) continue;
    const from = DICT_SOURCE_LANG[key];
    if (from === "La") {
      hasLatinSource = true;
    } else if (from && from !== "*") {
      reverseLanguagesSet.add(fullLangName(from));
    }
  }

  const reverseLanguages = Array.from(reverseLanguagesSet);

  if (!hasLatinSource && reverseLanguages.length === 0) {
    return "Welcome to the dictionary. Please enable at least one dictionary in settings.";
  }

  const latinScope = isInflected
    ? "Latin headwords and inflected forms"
    : "Latin headwords";

  if (hasLatinSource && reverseLanguages.length > 0) {
    return `Welcome to the dictionary. You can search ${latinScope}, and words in ${formatLanguageList(
      reverseLanguages
    )}.`;
  }

  if (hasLatinSource) {
    return `Welcome to the dictionary. You can search ${latinScope}.`;
  }

  return `Welcome to the dictionary. You can search words in ${formatLanguageList(
    reverseLanguages
  )}.`;
}
