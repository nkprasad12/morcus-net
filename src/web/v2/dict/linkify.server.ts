import { processWords, removeDiacritics } from "@/common/text_cleaning";
import * as he from "he";

/**
 * Scans text and wraps Latin words in clickable hyperlinks pointing to the dictionary lookup route.
 */
export function linkifyText(
  text: string,
  urlBuilder?: (cleanWord: string) => string,
  activeWord?: string
): string {
  const cleanActiveWord = activeWord
    ? removeDiacritics(activeWord).replaceAll("-", "").trim().toLowerCase()
    : undefined;

  const parts = processWords(text, (word) => {
    const cleanWord = removeDiacritics(word).replaceAll("-", "").trim();
    const isLatinWord = !/\d/.test(word) && /[a-zA-Z]/.test(cleanWord);
    if (isLatinWord) {
      const href = urlBuilder
        ? urlBuilder(cleanWord)
        : `/v2/dicts?q=${encodeURIComponent(cleanWord)}`;
      const isActive =
        cleanActiveWord !== undefined &&
        cleanWord.toLowerCase() === cleanActiveWord;
      const activeClass = isActive ? " v2-word-active" : "";
      return `<a href="${he.encode(
        href
      )}" class="v2-lat-word${activeClass}">${he.encode(word)}</a>`;
    }
    return he.encode(word);
  });
  return parts.join("");
}
