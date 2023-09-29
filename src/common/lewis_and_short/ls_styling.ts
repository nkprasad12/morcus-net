import {
  StringTrie,
  findExpansionsOld,
} from "@/common/abbreviations/abbreviations";
import { checkPresent } from "@/common/assert";
import { XmlNode } from "@/common/xml/xml_node";

export function handleAbbreviationsInMessage(
  message: string,
  expansions: [number, number, string[]][],
  replace: boolean,
  expandedCssClasses?: string[]
): (XmlNode | string)[] {
  const chunks: (XmlNode | string)[] = [];
  let lastChunkEnd = 0;
  for (const [startIndex, length, expandedString] of expansions) {
    chunks.push(message.slice(lastChunkEnd, startIndex));
    const original = message.slice(startIndex, startIndex + length);
    lastChunkEnd = startIndex + length;
    if (expandedString.length === 1) {
      const toDisplay = replace ? expandedString[0] : original;
      const onHover = replace ? `Originally: ${original}` : expandedString[0];
      chunks.push(attachHoverText(toDisplay, onHover, expandedCssClasses));
    } else {
      chunks.push(
        attachHoverText(
          original,
          `Ambiguous: ${expandedString.join(" OR ")}`,
          expandedCssClasses
        )
      );
    }
  }
  chunks.push(message.slice(lastChunkEnd));
  return chunks;
}

export function handleAbbreviations(
  contentRoot: XmlNode,
  defaultTrie: StringTrie,
  replace: boolean = true,
  expandedCssClasses?: string[]
): XmlNode {
  const children: (XmlNode | string)[] = [];
  for (const child of contentRoot.children) {
    const rootClass = contentRoot.getAttr("class") || "";
    if (rootClass.includes("lsHover")) {
      // Do not abbreviate any part of a string that has already been expanded.
      children.push(child);
      continue;
    }
    if (typeof child === "string") {
      handleAbbreviationsInMessage(
        child,
        findExpansionsOld(child, defaultTrie),
        replace,
        expandedCssClasses
      ).forEach((x) => children.push(x));
      continue;
    }
    children.push(
      handleAbbreviations(child, defaultTrie, replace, expandedCssClasses)
    );
  }
  return new XmlNode(
    contentRoot.name,
    contentRoot.attrs.map(([k, v]) => [k, v]),
    children
  );
}

export function attachHoverText(
  displayText: XmlNode | string,
  hoverText: string,
  expandedCssClasses?: string[]
): XmlNode {
  const allClasses = ["lsHover"];
  for (const expandedCssClass of expandedCssClasses || []) {
    allClasses.push(expandedCssClass);
  }
  const attrs: [string, string][] = [
    ["title", hoverText],
    ["class", allClasses.join(" ")],
  ];

  return new XmlNode("span", attrs, [displayText]);
}

export function substituteAbbreviation(
  original: string,
  lookup: Map<string, string>,
  expandedCssClasses?: string[]
): XmlNode {
  const expanded = checkPresent(lookup.get(original));
  return attachHoverText(
    expanded,
    `Originally: ${original}`,
    expandedCssClasses
  );
}
