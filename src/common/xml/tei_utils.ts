import { assert, assertEqual, checkPresent } from "@/common/assert";
import { DocumentInfo } from "@/common/library/library_types";
import { safeParseInt } from "@/common/misc_utils";
import { XmlNode } from "@/common/xml/xml_node";
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

export function extractInfo(teiRoot: XmlNode) {
  const titleStatement = findChild(teiRoot, TITLE_STATEMENT_PATH);
  const editor: XmlNode | undefined = titleStatement.findChildren("editor")[0];
  const translator = editor?.getAttr("role") === "translator";
  return {
    title: XmlNode.getSoleText(titleStatement.findChildren("title")[0]),
    author: XmlNode.getSoleText(titleStatement.findChildren("author")[0]),
    editor: translator
      ? undefined
      : editor?.children.find((c) => typeof c === "string"),
    translator: translator ? XmlNode.getSoleText(editor) : undefined,
    sponsor: firstTextOfChild(titleStatement, "sponsor"),
    funder: firstTextOfChild(titleStatement, "funder"),
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
