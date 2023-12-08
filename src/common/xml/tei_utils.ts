// // @ts-ignore
// import { betaCodeToGreek } from "beta-code-js";
import { assert, assertEqual, checkPresent } from "@/common/assert";
import { DocumentInfo } from "@/common/library/library_types";
import { safeParseInt } from "@/common/misc_utils";
import { XmlChild, XmlNode } from "@/common/xml/xml_node";
import {
  DescendantNode,
  findXmlNodes,
  parseRawXml,
} from "@/common/xml/xml_utils";
import fs from "fs";

const XPATH_START = "#xpath(";
const CONTENT_PATH = ["text", "body", "div"];
const TITLE_STATEMENT_PATH = ["teiHeader", "fileDesc", "titleStmt"];

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
  children: (TeiNode | XmlChild)[];
}

export interface CtsPathData {
  /** The name of the XML node. */
  name: string;
  /** The data for the subpart of the identifier attached to this node, if present. */
  idInfo?: {
    /** The name of the attribute key to which the data is attched. */
    key: string;
    /** Which part of the match pattern is associated with this. */
    index: number;
  };
}
export namespace CtsPathData {
  export function test(
    descendantNode: DescendantNode,
    ctsPath: CtsPathData[]
  ): string[] | undefined {
    const chain = [...descendantNode[1], descendantNode[0]];
    if (chain.length !== ctsPath.length) {
      return undefined;
    }
    const idParts: [number, string][] = [];
    for (let i = 0; i < chain.length; i++) {
      if (chain[i].name !== ctsPath[i].name) {
        return undefined;
      }
      const idInfo = ctsPath[i].idInfo;
      if (idInfo === undefined) {
        continue;
      }
      const keyAttr = chain[i].getAttr(idInfo.key);
      if (keyAttr === undefined) {
        return undefined;
      }
      idParts.push([idInfo.index, keyAttr]);
    }
    idParts.sort((a, b) => a[0] - b[0]);
    return idParts.map(([_, v]) => v);
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

function parseXPath(xPath: string): CtsPathData[] {
  assert(xPath.startsWith(XPATH_START));
  assert(xPath.endsWith(")"));
  const path = xPath.slice(XPATH_START.length, -1);
  return path
    .split("/tei:")
    .filter((c) => c.length > 0)
    .map((c) => {
      const chunks = c.split("[@");
      if (chunks.length === 1) {
        return { name: c };
      }
      assert(chunks.length === 2);
      assert(chunks[1].endsWith("]"));
      const matches = checkPresent(chunks[1].match(/^(\w+)='\$(\d+)'\]$/));
      return {
        name: chunks[0],
        idInfo: {
          key: checkPresent(matches[1]),
          index: checkPresent(safeParseInt(matches[2])),
        },
      };
    });
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
  nodeLookup: Map<string, { id: string[]; children: RawTeiData[] }>
): TeiNode {
  const rawData = checkPresent(nodeLookup.get(rootKey));
  const children = [...rawData.children]
    .sort((a, b) => a.idx - b.idx)
    .map((child) =>
      child.ofParent === true
        ? child.node
        : assembleTeiTree(child.id.join(","), nodeLookup)
    );
  return { id: rawData.id, children };
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
  const extrasById = new Map<string, RawTeiData[]>();
  const nodeLookup = new Map<
    string,
    { id: string[]; children: RawTeiData[] }
  >();
  // We verify above that every pattern has a non-empty id list.
  // Use this as the root element.
  nodeLookup.set("", { id: [], children: [] });
  for (const data of rawData) {
    const combinedId = data.id.join(",");
    if (data.ofParent === true) {
      if (!extrasById.has(combinedId)) {
        extrasById.set(combinedId, []);
      }
      extrasById.get(combinedId)!.push(data);
      continue;
    }
    mains.push(data);
    assert(!nodeLookup.has(combinedId));
    nodeLookup.set(combinedId, { id: data.id, children: [] });
  }
  for (const [combinedId, extras] of extrasById) {
    const parent = checkPresent(nodeLookup.get(combinedId));
    parent.children.push(...extras);
  }
  for (const main of mains) {
    const parentId = main.id.slice(0, -1).join(",");
    checkPresent(nodeLookup.get(parentId)).children.push(main);
  }
  return assembleTeiTree("", nodeLookup);
}

function findTextParts(teiRoot: XmlNode): string[] {
  const encoding = findChild(teiRoot, ["teiHeader", "encodingDesc"]);
  const refsDeclTeis = encoding.children.filter(
    (c) => typeof c !== "string" && ["TEI", undefined].includes(c.getAttr("n"))
  );
  assert(refsDeclTeis.length === 1);
  const refsDeclTei = XmlNode.assertIsNode(refsDeclTeis[0]);
  const result: string[] = [];
  for (const refState of refsDeclTei.children) {
    const node = XmlNode.assertIsNode(refState);
    assert(["refState", "step"].includes(node.name), node.toString());
    result.push(checkPresent(node.getAttr("unit") || node.getAttr("refunit")));
  }
  return result;
}

/**
 * Returns the parsed content of a TEI XML file.
 *
 * @deprecated sda
 */
export function parseTeiXml(filePath: string): TeiDocument {
  const teiRoot = parseRawXml(fs.readFileSync(filePath));
  const info = extractInfo(teiRoot);
  const textParts = findTextParts(teiRoot);
  const content = findChild(teiRoot, CONTENT_PATH);
  return { info, textParts, content };
}
