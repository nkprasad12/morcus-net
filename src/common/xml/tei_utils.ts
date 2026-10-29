import fs from "fs";
import path from "path";

import { assert, assertEqual, checkPresent } from "@/common/assert";
import { DocumentInfo } from "@/common/library/library_types";
import { safeParseInt } from "@/common/misc_utils";
import { XmlNode } from "@/common/xml/xml_node";
import { parseRawXml } from "@/common/xml/xml_utils";
import type { DescendantNode } from "@/common/xml/xml_text_utils";

const XPATH_START = "#xpath(";
const TITLE_STATEMENT_PATH = ["teiHeader", "fileDesc", "titleStmt"];

export const ROOT_NODE_NAME = "__@ROOT";

export interface TeiDocument {
  /** Basic information about this document like title, author, and so on. */
  info: DocumentInfo;
  /** The names of the high levels divisions of this text. */
  textParts: string[];
  /** The node containing the actual document content. */
  content: XmlNode;
}

export interface TeiCtsDocument {
  /** Basic information about this document like title, author, and so on. */
  info: DocumentInfo;
  /** The names of the high levels divisions of this text. */
  textParts: string[];
  /** The node containing the extracted document content. */
  content: TeiNode;
}

export interface TeiNode {
  id: string[];
  children: (TeiNode | XmlNode)[];
  selfNode: XmlNode;
}

interface CtsIdInfo {
  /** The name of the attribute key to which the data is attched. */
  key: string;
  /** Which part of the match pattern is associated with this. */
  index: number;
}

export interface CtsPathData {
  /** The name of the XML node. */
  name: string;
  /** The data for the subpart of the identifier attached to this node, if present. */
  idInfo?: CtsIdInfo;
  /** The relation this node has to the parent. */
  relation?: "descendant";
}
export namespace CtsPathData {
  function testRecursive(
    chain: XmlNode[],
    ctsPath: CtsPathData[]
  ): [number, string][] | undefined {
    if (ctsPath.length === 0 && chain.length === 0) {
      // Both have been consumed, so return a success.
      return [];
    }
    if (ctsPath.length === 0) {
      // The entire path has been matched, so some ancestor matches, but not this node.
      return undefined;
    }
    if (chain.length === 0) {
      // The entire chain has been consumed but the xpath was not matched.
      return undefined;
    }
    const nameMatches =
      checkPresent(chain[0], "No chain").name === ctsPath[0].name;
    const idInfo = ctsPath[0].idInfo;
    let matchPart: [number, string] | undefined = undefined;
    if (idInfo !== undefined) {
      const key = chain[0].getAttr(idInfo.key);
      if (key !== undefined) {
        matchPart = [idInfo.index, key];
      }
    }
    const attrMatches = matchPart !== undefined;
    const isMatch = nameMatches && (idInfo === undefined || attrMatches);

    if (!isMatch && ctsPath[0].relation !== "descendant") {
      return undefined;
    }
    const tailResult = isMatch
      ? testRecursive(chain.slice(1), ctsPath.slice(1))
      : testRecursive(chain.slice(1), ctsPath);
    if (tailResult === undefined) {
      return undefined;
    }
    return matchPart === undefined
      ? tailResult
      : [matchPart].concat(tailResult);
  }

  export function test(
    descendantNode: DescendantNode,
    ctsPath: CtsPathData[]
  ): string[] | undefined {
    const chain = [...descendantNode[1], descendantNode[0]];
    return testRecursive(chain, ctsPath)
      ?.sort((a, b) => a[0] - b[0])
      ?.map(([_, v]) => v);
  }
}

export interface CtsRefPattern {
  name: string;
  idSize: number;
  nodePath: CtsPathData[];
}
export namespace CtsRefPattern {
  export function match(
    descendantNode: DescendantNode,
    patterns: CtsRefPattern[]
  ): string[] | undefined {
    let candidate: undefined | string[] = undefined;
    for (const pattern of patterns) {
      const id = CtsPathData.test(descendantNode, pattern.nodePath);
      if (id === undefined) {
        continue;
      }
      assertEqual(id.length, pattern.idSize);
      assertEqual(candidate, undefined);
      candidate = id;
    }
    return candidate;
  }
}

function findChild(root: XmlNode, sequence: string[]) {
  let result = root;
  for (const part of sequence) {
    const candidates = result.findChildren(part);
    assert(candidates.length === 1, `Expected exactly one ${part} child.`);
    result = candidates[0];
  }
  return result;
}

function firstTextOfChild(
  root: XmlNode,
  childName: string
): string | undefined {
  const content = root.findChildren(childName)[0]?.children[0];
  return typeof content === "string" ? content : undefined;
}

function findSourceRef(teiRoot: XmlNode): string[] | undefined {
  const biblStruct = teiRoot.findDescendants("biblStruct");
  if (biblStruct.length === 0) {
    return undefined;
  }
  assertEqual(biblStruct.length, 1, "Expected exactly one biblStruct child.");
  const ref = biblStruct[0].findChildren("ref");
  if (ref.length === 0) {
    return undefined;
  }
  const refs = ref.filter((r) => r.getAttr("target") !== undefined);
  const targets: string[] = [];
  for (const ref of refs) {
    let target = ref.getAttr("target");
    if (target === undefined) {
      continue;
    }
    if (target === "Open Content Alliance") {
      target = XmlNode.getSoleText(ref);
    }
    assert(target.startsWith("http"), target);
    targets.push(target);
  }
  return targets;
}

/**
 * The file's own licence statement: the text of
 * `publicationStmt/availability/licence`, if it names its licence with a
 * `target` URL. Some files carry placeholders (Juvenal's `<licence>Test`),
 * which do not count.
 */
function findLicence(teiRoot: XmlNode): string | undefined {
  const publicationStmt = teiRoot
    .findChildren("teiHeader")[0]
    ?.findChildren("fileDesc")[0]
    ?.findChildren("publicationStmt")[0];
  const licences =
    publicationStmt
      ?.findChildren("availability")
      .flatMap((availability) => availability.findChildren("licence")) ?? [];
  for (const licence of licences) {
    if (!licence.getAttr("target")?.startsWith("http")) {
      continue;
    }
    const text = licence.children
      .filter((child): child is string => typeof child === "string")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length > 0) {
      return text;
    }
  }
  return undefined;
}

/**
 * Work metadata from the CapiTainS `__cts__.xml` files next to a TEI file:
 * `data/<textgroup>/__cts__.xml` names the author (`<ti:groupname>`) and
 * `data/<textgroup>/<work>/__cts__.xml` the title (`<ti:title>`).
 */
export interface CtsMetadata {
  author?: string;
  title?: string;
}

function textOf(node: XmlNode): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : textOf(child)))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** The text of the first `<ti:name>` (or unprefixed `<name>`) under `root`. */
function firstCtsText(root: XmlNode, name: string): string | undefined {
  for (const candidate of [`ti:${name}`, name]) {
    const node = root.findDescendants(candidate)[0];
    const text = node === undefined ? undefined : textOf(node);
    if (text !== undefined && text.length > 0) {
      return text;
    }
  }
  return undefined;
}

/**
 * Reads `CtsMetadata` from parsed `__cts__.xml` documents: the textgroup's
 * (for `author`) and the work's (for `title`). Either may be absent.
 */
export function parseCtsMetadata(
  textgroupCts: XmlNode | undefined,
  workCts: XmlNode | undefined
): CtsMetadata {
  return {
    author: textgroupCts && firstCtsText(textgroupCts, "groupname"),
    title: workCts && firstCtsText(workCts, "title"),
  };
}

/** Parses the `__cts__.xml` at `ctsPath`, if there is a readable one. */
function readCtsFile(ctsPath: string): XmlNode | undefined {
  if (!fs.existsSync(ctsPath)) {
    return undefined;
  }
  try {
    // Drop any XML declaration or comments before the root element.
    const xml = fs
      .readFileSync(ctsPath, "utf8")
      .replace(/^\uFEFF?(\s*(<\?[\s\S]*?\?>|<!--[\s\S]*?-->))*/, "");
    return parseRawXml(xml);
  } catch (e) {
    console.warn(`Could not parse ${ctsPath}: ${e}`);
    return undefined;
  }
}

/**
 * The CapiTainS metadata for the TEI file at `workPath`
 * (`data/<textgroup>/<work>/<id>.xml`): the author from
 * `data/<textgroup>/__cts__.xml` and the title from
 * `data/<textgroup>/<work>/__cts__.xml`. Used where the TEI header lacks them.
 */
export function readCtsMetadata(workPath: string): CtsMetadata {
  const workDir = path.dirname(workPath);
  return parseCtsMetadata(
    readCtsFile(path.join(path.dirname(workDir), "__cts__.xml")),
    readCtsFile(path.join(workDir, "__cts__.xml"))
  );
}

/**
 * Basic information from the TEI header's `titleStmt`. Some headers have no
 * `<author>` (all of the Historia Augusta and the Appendix Vergiliana) or no
 * `<title>`; those come from `fallback` (the work's `__cts__.xml`) instead.
 * The `__cts__.xml` title also wins when the header's `<title>` is just the
 * text group's name (the Appendix Vergiliana's *Ciris*, *Priapea* and
 * *Elegiae in Maecenatem* are all titled "Appendix Vergiliana"), and a
 * trailing ", <text group name>" is dropped ("Dirae, Appendix Vergiliana").
 */
export function extractInfo(teiRoot: XmlNode, fallback?: CtsMetadata) {
  const titleStatement = findChild(teiRoot, TITLE_STATEMENT_PATH);
  const editor: XmlNode | undefined = titleStatement.findChildren("editor")[0];
  const translator = editor?.getAttr("role") === "translator";
  // Some headers pad these (`<author>Valerius Flaccus </author>`) or break
  // them across lines, which would otherwise leak into author codes and URL
  // slugs.
  const normalize = (text: string | undefined) =>
    text?.replace(/\s+/g, " ").trim() ?? "";
  const fromHeaderOr = (field: "title" | "author"): string => {
    const node: XmlNode | undefined = titleStatement.findChildren(field)[0];
    if (node !== undefined) {
      return normalize(XmlNode.getSoleText(node));
    }
    const value = normalize(fallback?.[field]);
    assert(
      value.length > 0,
      () => `No <${field}> in titleStmt, and none in __cts__.xml`
    );
    return value;
  };
  const headerTitle = fromHeaderOr("title");
  const groupName = normalize(fallback?.author).toLowerCase();
  const ctsTitle = normalize(fallback?.title);
  const groupSuffix = `, ${groupName}`;
  let title = headerTitle;
  if (groupName.length > 0) {
    const lowerTitle = headerTitle.toLowerCase();
    if (lowerTitle === groupName && ctsTitle.length > 0) {
      title = ctsTitle;
    } else if (
      lowerTitle.endsWith(groupSuffix) &&
      lowerTitle.length > groupSuffix.length
    ) {
      // "Dirae, Appendix Vergiliana" -> "Dirae".
      title = headerTitle.slice(0, -groupSuffix.length).trim();
    }
  }
  return {
    title,
    author: fromHeaderOr("author"),
    editor: translator
      ? undefined
      : editor?.children.find((c) => typeof c === "string"),
    translator: translator ? XmlNode.getSoleText(editor) : undefined,
    sponsor: firstTextOfChild(titleStatement, "sponsor"),
    funder: firstTextOfChild(titleStatement, "funder"),
    sourceRef: findSourceRef(teiRoot),
    licence: findLicence(teiRoot),
  };
}

export function parseXPath(xPath: string): CtsPathData[] {
  assert(xPath.startsWith(XPATH_START));
  assert(xPath.endsWith(")"));
  const path = xPath.slice(XPATH_START.length, -1);
  const pathParts = path.split("/");
  assert(pathParts[0].length === 0);

  const result: CtsPathData[] = [];
  let nextIsDescendant = false;
  for (const pathPart of pathParts.slice(1)) {
    if (pathPart.length === 0) {
      nextIsDescendant = true;
      continue;
    }
    assert(pathPart.startsWith("tei:"));
    const part = pathPart.substring(4);
    const chunks = part.split("[@");

    if (chunks.length === 1) {
      result.push({ name: part });
    } else {
      assert(chunks.length === 2);
      assert(chunks[1].endsWith("]"));
      const matches = checkPresent(
        chunks[1].match(/^(?<key>\w+)='(?<value>[^']+)'\]$/),
        part
      );
      const value = matches.groups?.value;
      let idInfo: CtsIdInfo | undefined = undefined;
      if (value && value.startsWith("$")) {
        // TODO: We should respect properties even if they aren't part
        // of the CTS identifier.
        idInfo = {
          key: checkPresent(matches.groups?.key),
          index: checkPresent(safeParseInt(value.substring(1))),
        };
      }
      result.push({ name: chunks[0], idInfo });
    }

    if (nextIsDescendant) {
      result[result.length - 1].relation = "descendant";
      nextIsDescendant = false;
    }
  }
  return result;
}

export function findCtsEncoding(teiRoot: XmlNode): CtsRefPattern[] {
  const encoding = findChild(teiRoot, ["teiHeader", "encodingDesc"]);
  const refsDecls = encoding
    .findChildren("refsDecl")
    .filter((child) => child.getAttr("n") === "CTS");
  assert(refsDecls.length === 1, "Expected exactly 1 CTS refsDecl");
  return refsDecls[0]
    .findChildren("cRefPattern")
    .map((refPattern) => ({
      name: checkPresent(refPattern.getAttr("n")),
      matchPattern: checkPresent(refPattern.getAttr("matchPattern")),
      replacementPattern: checkPresent(
        refPattern.getAttr("replacementPattern")
      ),
    }))
    .map((p) => {
      // Assuming every open parenthesis starts a capture group.
      const idSize = (p.matchPattern.match(/\(/g) || []).length;
      const nodePath = parseXPath(p.replacementPattern);
      const idNodes = nodePath.filter((n) => n.idInfo !== undefined);
      assertEqual(idNodes.length, idSize);
      return { name: p.name, idSize, nodePath };
    });
}
