// // @ts-ignore
// import { betaCodeToGreek } from "beta-code-js";
import { assert, assertEqual, checkPresent } from "@/common/assert";
import { arrayMap } from "@/common/data_structures/collect_map";
import { DocumentInfo } from "@/common/library/library_types";
import { safeParseInt } from "@/common/misc_utils";
import { XmlNode } from "@/common/xml/xml_node";
import type { DescendantNode } from "@/common/xml/xml_text_utils";
import { findXmlNodes } from "@/common/xml/xml_utils";

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

function extractInfo(teiRoot: XmlNode) {
  const titleStatement = findChild(teiRoot, TITLE_STATEMENT_PATH);
  return {
    title: XmlNode.getSoleText(titleStatement.findChildren("title")[0]),
    author: XmlNode.getSoleText(titleStatement.findChildren("author")[0]),
    editor: firstTextOfChild(titleStatement, "editor"),
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

interface RawTeiData {
  idx: number;
  id: string[];
  node: XmlNode;
  ofParent?: true;
}

export function parseCtsTeiXml(teiRoot: XmlNode): TeiCtsDocument {
  const ctsPatterns = findCtsEncoding(teiRoot);
  return {
    info: extractInfo(teiRoot),
    textParts: ctsPatterns
      .sort((a, b) => a.idSize - b.idSize)
      .map((p) => p.name),
    content: extractTeiContent(teiRoot, ctsPatterns),
  };
}

function extractTeiContent(
  teiRoot: XmlNode,
  ctsPatterns: CtsRefPattern[]
): TeiNode {
  const descendants = findXmlNodes(teiRoot);
  const toKeep: RawTeiData[] = [];
  for (let i = 0; i < descendants.length; i++) {
    const id = CtsRefPattern.match(descendants[i], ctsPatterns);
    if (id !== undefined) {
      toKeep.push({ idx: i, id, node: descendants[i][0] });
      continue;
    }
    const ancestors = descendants[i][1];
    if (ancestors.length === 0) {
      continue;
    }
    const parentId = CtsRefPattern.match(
      [ancestors[ancestors.length - 1], ancestors.slice(0, -1)],
      ctsPatterns
    );
    if (parentId !== undefined) {
      toKeep.push({
        idx: i,
        id: parentId,
        node: descendants[i][0],
        ofParent: true,
      });
    }
  }
  return assembleTeiData(toKeep, ctsPatterns);
}

function assembleTeiTree(
  rootKey: string,
  nodeLookup: Map<
    string,
    { id: string[]; children: RawTeiData[]; selfNode: XmlNode }
  >
): TeiNode {
  const rawData = checkPresent(nodeLookup.get(rootKey));
  const children = [...rawData.children]
    .sort((a, b) => a.idx - b.idx)
    .map((child) =>
      child.ofParent === true
        ? child.node
        : assembleTeiTree(child.id.join(","), nodeLookup)
    );
  return { id: rawData.id, children, selfNode: rawData.selfNode };
}

function assembleTeiData(
  rawData: RawTeiData[],
  patterns: CtsRefPattern[]
): TeiNode {
  patterns.sort((a, b) => a.idSize - b.idSize);
  assert(patterns[0].idSize > 0);
  for (let i = 0; i < patterns.length - 1; i++) {
    assert(patterns[i].idSize < patterns[i + 1].idSize);
  }
  rawData.forEach((data) =>
    data.id.forEach((part) => assert(!part.includes(",")))
  );
  const mains: RawTeiData[] = [];
  const extrasById = arrayMap<string, RawTeiData>();
  const nodeLookup = new Map<
    string,
    { id: string[]; children: RawTeiData[]; selfNode: XmlNode }
  >();
  // We verify above that every pattern has a non-empty id list.
  // Use this as the root element.
  nodeLookup.set("", {
    id: [],
    children: [],
    selfNode: new XmlNode(ROOT_NODE_NAME),
  });
  for (const data of rawData) {
    const combinedId = data.id.join(",");
    if (data.ofParent === true) {
      extrasById.add(combinedId, data);
      continue;
    }
    mains.push(data);
    assert(!nodeLookup.has(combinedId));
    nodeLookup.set(combinedId, {
      id: data.id,
      children: [],
      selfNode: data.node,
    });
  }
  for (const [combinedId, extras] of extrasById.map) {
    const parent = checkPresent(nodeLookup.get(combinedId));
    parent.children.push(...extras);
  }
  for (const main of mains) {
    const parentId = main.id.slice(0, -1).join(",");
    checkPresent(nodeLookup.get(parentId)).children.push(main);
  }
  return assembleTeiTree("", nodeLookup);
}
