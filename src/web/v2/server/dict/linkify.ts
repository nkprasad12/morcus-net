import { processWords, removeDiacritics } from "@/common/text_cleaning";
import * as he from "he";

/**
 * Scans text and wraps Latin words in clickable hyperlinks pointing to the dictionary lookup route.
 */
export function linkifyText(text: string): string {
  const parts = processWords(text, (word) => {
    const cleanWord = removeDiacritics(word).replaceAll("-", "").trim();
    const isLatinWord = !/\d/.test(word) && /[a-zA-Z]/.test(cleanWord);
    if (isLatinWord) {
      const href = `/v2/dicts?q=${encodeURIComponent(cleanWord)}`;
      return `<a href="${he.encode(href)}" class="v2-lat-word">${he.encode(
        word
      )}</a>`;
    }
    return he.encode(word);
  });
  return parts.join("");
}
