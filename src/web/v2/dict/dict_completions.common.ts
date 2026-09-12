import { type DictLang } from "@/common/dictionaries/dictionaries";
import { trimRawQuery } from "@/common/text_cleaning";

export interface CompletionItem {
  lang: DictLang;
  word: string;
}

export interface CleanedCompletionQuery {
  query: string;
  isSuffix: boolean;
}

/**
 * Normalizes an autocomplete search query, preserving leading '-' for suffix searches
 * (e.g. '-arum', '-ibus') while stripping outer quotes and punctuation.
 */
export function cleanCompletionQuery(rawQuery: string): CleanedCompletionQuery {
  const trimmed = rawQuery.trim();
  const isSuffix = trimmed.startsWith("-") && trimmed.length > 1;
  if (isSuffix) {
    // Strip trailing punctuation, whitespace, and dangling marks
    const stripped = trimmed
      .substring(1)
      .replace(/(?:[\p{M}]*[\p{P}\p{Z}\s]+)$/u, "")
      .trim();
    if (!stripped) {
      return { query: "", isSuffix: false };
    }
    return { query: `-${stripped}`, isSuffix: true };
  }
  return {
    query: trimRawQuery(trimmed),
    isSuffix: false,
  };
}
