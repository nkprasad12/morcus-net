// // @ts-ignore
// import { betaCodeToGreek } from "beta-code-js";
import { assert, assertEqual, checkPresent } from "@/common/assert";
import { DocumentInfo } from "@/common/library/library_types";
import { safeParseInt } from "@/common/misc_utils";
import { XmlNode } from "@/common/xml/xml_node";
import { DescendantNode, parseRawXml } from "@/common/xml/xml_utils";
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

/** Returns the parsed content of a TEI XML file. */
export function parseTeiXml(filePath: string): TeiDocument {
  const teiRoot = parseRawXml(fs.readFileSync(filePath));
  const info = extractInfo(teiRoot);
  const textParts = findTextParts(teiRoot);
  const content = findChild(teiRoot, CONTENT_PATH);
  return { info, textParts, content };
}
