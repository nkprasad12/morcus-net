import { LatinDict } from "@/common/dictionaries/latin_dicts";

/**
 * Formats natural language list with Oxford comma:
 * - ["English"] => "English"
 * - ["English", "German"] => "English and German"
 * - ["English", "German", "Spanish"] => "English, German, and Spanish"
 */
export function formatLanguageList(languages: string[]): string {
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
 * Generates the contextual welcome sentence based on active dictionary keys.
 * Handles all combinations of Latin-source and reverse-source dictionaries:
 * - Latin + Modern: "Welcome to the dictionary. You can search Latin headwords and inflected forms, and words in English and German."
 * - Latin only: "Welcome to the dictionary. You can search Latin headwords and inflected forms."
 * - Modern only: "Welcome to the dictionary. You can search words in English."
 * - None: "Welcome to the dictionary. Please enable at least one dictionary in settings."
 */
export function buildWelcomeMessage(activeDictKeys: Iterable<string>): string {
  const activeKeysSet = new Set(
    Array.from(activeDictKeys).map((k) => k.toUpperCase())
  );

  let hasLatinSource = false;
  const reverseLanguagesSet = new Set<string>();

  for (const dict of LatinDict.AVAILABLE) {
    if (dict.key === "NUM") continue;
    if (!activeKeysSet.has(dict.key.toUpperCase())) continue;

    if (dict.languages.from === "La") {
      hasLatinSource = true;
    } else if (dict.languages.to === "La") {
      reverseLanguagesSet.add(fullLangName(dict.languages.from));
    }
  }

  const reverseLanguages = Array.from(reverseLanguagesSet);

  if (!hasLatinSource && reverseLanguages.length === 0) {
    return "Welcome to the dictionary. Please enable at least one dictionary in settings.";
  }

  if (hasLatinSource && reverseLanguages.length > 0) {
    return `Welcome to the dictionary. You can search Latin headwords and inflected forms, and words in ${formatLanguageList(
      reverseLanguages
    )}.`;
  }

  if (hasLatinSource) {
    return "Welcome to the dictionary. You can search Latin headwords and inflected forms.";
  }

  return `Welcome to the dictionary. You can search words in ${formatLanguageList(
    reverseLanguages
  )}.`;
}
