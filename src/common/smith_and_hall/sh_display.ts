import { ShEntry, ShSense } from "@/common/smith_and_hall/sh_entry";
import { XmlChild, XmlNode } from "@/common/xml/xml_node";
import { parseXmlStrings } from "../xml/xml_utils";
import { assertEqual } from "@/common/assert";
import { LINK_EDGE_CASES, SH_SKIPS } from "@/common/smith_and_hall/sh_links";
import { expandShAbbreviationsIn } from "@/common/smith_and_hall/sh_abbreviations";

const FILLER_WORDS = new Set<string>([
  "OF",
  "IN",
  "BE",
  "UP",
  "ON",
  "WITH",
  "BY",
  "TO",
  "FOR",
  "AT",
  "THE",
  "OVER",
  "OFF",
  "ONESELF",
]);

const SUFFIX_REPLACEMENTS = [
  ["ISE", "IZE"],
  ["IES", "Y"],
];

interface ShKeyData {
  normalized: string;
  original: string;
}

function removeParenText(input: string): string {
  let result = "";
  let inParen = false;
  for (const c of input) {
    if (c === "(" || c === "[") {
      inParen = true;
    }
    if (c === ")" || c === "]") {
      inParen = false;
    }
    if (!inParen) {
      result += c;
    }
  }
  return result.replaceAll("  ", " ").trim();
}

export class ShLinkResolver {
  private readonly keysByStart: Map<string, ShKeyData[]> = new Map();

  constructor(readonly entries: ShEntry[]) {
    entries.forEach((entry) => {
      entry.keys.forEach((key) => {
        const keyLower = key.toLowerCase();
        if (!this.keysByStart.has(keyLower[0])) {
          this.keysByStart.set(keyLower[0], []);
        }
        this.keysByStart
          .get(keyLower[0])!
          .push({ normalized: keyLower, original: key });
        const dashIndex = key.indexOf("-");
        if (dashIndex > 0) {
          this.keysByStart
            .get(keyLower[0])!
            .push({ normalized: keyLower.replaceAll("-", ""), original: key });
        }
      });
    });
  }

  private resolveHelper(originalTerm: string): string | undefined {
    const edgeCaseResult = LINK_EDGE_CASES.get(originalTerm);
    if (edgeCaseResult !== undefined) {
      return edgeCaseResult;
    }
    let term = originalTerm;
    if (term.startsWith("TO ")) {
      term = term.substring(3);
    }
    const ingRemoved = term.endsWith("ING");
    if (ingRemoved) {
      term = term.slice(0, -3);
    }
    const termLower = term.toLowerCase();

    const sublist = this.keysByStart.get(termLower[0]) || [];
    const candidates = sublist.filter(
      (key) =>
        key.normalized.startsWith(termLower) ||
        termLower.startsWith(key.normalized)
    );
    if (candidates.length === 0) {
      for (const [end, newEnd] of SUFFIX_REPLACEMENTS) {
        if (term.endsWith(end)) {
          return this.resolve(term.slice(0, -end.length) + newEnd);
        }
      }
      return undefined;
    }
    for (const candidate of candidates) {
      const target = termLower + (ingRemoved ? "ing" : "");
      if (candidate.normalized === target) {
        return candidate.original;
      }
    }
    if (ingRemoved) {
      for (const candidate of candidates) {
        const target = termLower + "e";
        if (candidate.normalized === target) {
          return candidate.original;
        }
      }
    }
    if (termLower.endsWith("s")) {
      for (const candidate of candidates) {
        const target = termLower.slice(0, -1);
        if (candidate.normalized === target) {
          return candidate.original;
        }
      }
    }

    const longer = candidates.filter((candidate) =>
      candidate.normalized.startsWith(termLower)
    );
    if (longer.length === 0) {
      return undefined;
    }
    const shortest = longer.reduce((shortest, current) =>
      current.normalized.length < shortest.normalized.length
        ? current
        : shortest
    );
    return shortest.original;
  }

  resolve(term: string): string | undefined {
    let result = this.resolveHelper(term);
    if (result !== undefined) {
      return result;
    }
    let simplified = removeParenText(term.replaceAll("-*", "-").split(",")[0]);
    if (simplified.endsWith(".")) {
      simplified = simplified.slice(0, -1);
    }
    result = this.resolveHelper(simplified);
    if (result !== undefined) {
      return result;
    }
    if (simplified.includes("-")) {
      simplified = simplified.replaceAll("-", "");
      result = this.resolveHelper(simplified);
      if (result !== undefined) {
        return result;
      }
    }
    if (simplified.endsWith("LY")) {
      result = this.resolveHelper(simplified.slice(0, -2));
      if (result !== undefined) {
        return result;
      }
    }
    simplified = term
      .split(" ")
      .filter(
        (word) =>
          !FILLER_WORDS.has(word) &&
          !word.startsWith("(") &&
          !word.startsWith("[")
      )
      .join(" ");
    result = this.resolveHelper(simplified);
    if (result !== undefined) {
      return result;
    }
    return undefined;
  }
}

function markupText(senseRoot: XmlNode, resolver: ShLinkResolver): XmlNode {
  let name = senseRoot.name;
  if (["b"].includes(senseRoot.name)) {
    name = "span";
  }
  if (["f"].includes(senseRoot.name)) {
    name = "span";
  }
  if (["sc"].includes(senseRoot.name)) {
    name = "i";
  }
  const attrs: [string, string][] = senseRoot.attrs.map((x) => x);
  if (senseRoot.name === "b") {
    attrs.push(["class", "lsOrth"]);
  }
  if (senseRoot.name === "f") {
    assertEqual(senseRoot.children.length, 1);
    const child = senseRoot.children[0];
    let linkText = "";
    if (typeof child !== "string") {
      assertEqual(child.children.length, 1);
      linkText = XmlNode.assertIsString(child.children[0]);
    } else {
      linkText = child;
    }
    if (
      !linkText.startsWith("i. e.") &&
      !linkText.startsWith("i.e.") &&
      !SH_SKIPS.has(linkText)
    ) {
      const linkTo = resolver.resolve(linkText);
      if (linkTo === undefined) {
        // If trying to debug edge cases, uncomment this so
        // anything unresolved will throw.
        //
        // if (/[a-z]/.test(linkText[0])) {
        //   return new XmlNode("span", [], [linkText]);
        // }
        // throw linkText;
        return new XmlNode("span", [], [linkText]);
      }
      attrs.push(["class", "dLink"]);
      attrs.push(["to", linkTo]);
      attrs.push(["text", linkText.toLowerCase()]);
      return new XmlNode(name, attrs, []);
    }
  }
  const children = senseRoot.children.map((child) =>
    typeof child === "string" ? child : markupText(child, resolver)
  );
  return new XmlNode(name, attrs, children);
}

function getMarkedUpText(
  senses: string[],
  resolver: ShLinkResolver
): XmlChild[][] {
  return parseXmlStrings(
    senses.map((sense) =>
      new XmlNode("div", [], expandShAbbreviationsIn(sense)).toString()
    )
  ).map((parsedXml) => markupText(parsedXml, resolver).children);
}

function formatSenseList(
  senses: ShSense[],
  entryId: number,
  resolver: ShLinkResolver
): XmlNode {
  if (senses.length === 0) {
    return new XmlNode("div");
  }
  const stack: XmlNode[] = [];
  const parsedText = getMarkedUpText(
    senses.map((s) => s.text),
    resolver
  );

  for (let i = 0; i < senses.length; i++) {
    const sense = senses[i];
    const level = sense.level;
    const id = `sh${entryId}.${i}`;

    while (stack.length < level) {
      const attrs: [string, string][] =
        level === 1 ? [["class", "lsTopSense"]] : [];
      const newList = new XmlNode("ol", attrs, []);
      if (stack.length > 0) {
        stack[stack.length - 1].children.push(newList);
      }
      stack.push(newList);
    }
    while (stack.length > level) {
      stack.pop();
    }
    stack[stack.length - 1].children.push(
      new XmlNode(
        "li",
        [["id", id]],
        [
          new XmlNode(
            "span",
            [
              ["class", "lsSenseBullet"],
              ["senseid", id],
            ],
            [` ${sense.bullet} `]
          ),
          ...parsedText[i],
        ]
      )
    );
  }
  return stack[0];
}

export function displayShEntry(
  entry: ShEntry,
  id: number,
  resolver: ShLinkResolver
): XmlNode {
  const mainBlurbButton: XmlChild[] = [
    new XmlNode(
      "span",
      [
        ["class", "lsSenseBullet"],
        ["senseid", `sh${id}`],
      ],
      ["  •  "]
    ),
    " ",
  ];
  const blurbText = new XmlNode(
    "div",
    [["id", `sh${id}`]],
    mainBlurbButton.concat(...getMarkedUpText([entry.blurb], resolver))
  );
  return new XmlNode(
    "div",
    [],
    [blurbText, formatSenseList(entry.senses, id, resolver)]
  );
}
