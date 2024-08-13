import { XmlChild, XmlNode } from "@/common/xml/xml_node";
import { processWords, removeDiacritics } from "@/common/text_cleaning";
import { MorceusCruncher, type LatinWordAnalysis } from "@/morceus/crunch";

const EXTENDED_COMMON_ENGLISH_WORDS = ["di", "sum", "simple"];
const COMMON_ENGLISH_WORDS = new Set(
  [
    "a",
    "an",
    "as",
    "at",
    "i",
    "in",
    "is",
    "it",
    "do",
    "has",
    "his",
    "me",
    "of",
    "on",
    "the",
    "this",
  ].concat(...EXTENDED_COMMON_ENGLISH_WORDS)
);

export namespace LatinWords {
  const ENCLITICS = ["que", "ve", "ne"];

  export function resolveLatinWord<T>(
    input: string,
    resolver: (input: string) => [boolean, T],
    checkedEnclitic = false
  ): [string, T] | undefined {
    if (input.length === 0) {
      return undefined;
    }
    let [match, result] = resolver(input);
    if (match) {
      return [input, result];
    }
    const lowerCase = input.toLowerCase();
    [match, result] = resolver(lowerCase);
    if (match) {
      return [lowerCase, result];
    }
    const initialUpper = lowerCase[0].toUpperCase() + lowerCase.slice(1);
    [match, result] = resolver(initialUpper);
    if (match) {
      return [initialUpper, result];
    }

    if (!checkedEnclitic) {
      for (const enclitic of ENCLITICS) {
        if (lowerCase.endsWith(enclitic)) {
          return resolveLatinWord(
            input.slice(0, -enclitic.length),
            resolver,
            true
          );
        }
      }
    }
    return undefined;
  }

  export function analysesFor(term: string): LatinWordAnalysis[] {
    const tables = MorceusCruncher.CACHED_TABLES.get();
    return MorceusCruncher.make(tables)(term, { relaxCase: true });
  }

  export function isWord(term: string): boolean {
    return analysesFor(term).length > 0;
  }

  function linkifyLatinWords(input: string): XmlChild[] {
    const fragments = processWords(input, (word) => {
      if (COMMON_ENGLISH_WORDS.has(word)) {
        return word;
      }
      const noDiacritics = removeDiacritics(word);
      if (isWord(noDiacritics)) {
        return new XmlNode("span", [
          ["class", "latWord"],
          ["to", word],
        ]);
      }
      const lowerCase = noDiacritics.toLowerCase();
      if (isWord(lowerCase)) {
        return new XmlNode("span", [
          ["class", "latWord"],
          ["to", word.toLowerCase()],
          ["orig", word],
        ]);
      }
      return word;
    });
    // Combine strings that are immediately next to each other.
    const result: XmlChild[] = [];
    for (const fragment of fragments) {
      const topIndex = result.length - 1;
      const topChild = result[topIndex];
      if (typeof fragment !== "string" || typeof topChild !== "string") {
        result.push(fragment);
        continue;
      }
      result[topIndex] = topChild + fragment;
    }
    return result;
  }

  export function attachLatinLinks(root: XmlNode): XmlNode {
    const className = root.getAttr("class");
    if (
      className?.includes("lsHover") ||
      className?.includes("lsSenseBullet")
    ) {
      return root;
    }
    const linkified = root.children.flatMap((child) => {
      if (typeof child !== "string") {
        return attachLatinLinks(child);
      }
      return linkifyLatinWords(child);
    });
    return new XmlNode(root.name, root.attrs, linkified);
  }
}
