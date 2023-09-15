import { assert, checkPresent } from "@/common/assert";
import { XmlNode } from "@/common/xml/xml_node";
import { parseRawXml } from "@/common/xml/xml_utils";
import fs from "fs";

const CONTENT_PATH = ["text", "body", "div"];
const TITLE_STATEMENT_PATH = ["teiHeader", "fileDesc", "titleStmt"];

interface DocumentInfo {
  title: string;
  author: string;
  editor?: string;
  sponsor?: string;
  funder?: string;
}

// interface TextPart {
//   type: string;
//   n: number;
//   metadata?: string[];
//   header?: string;
//   content: (string | TextPart)[];
// }

interface TeiDocument {
  info: DocumentInfo;
  textParts: string[];
  content: XmlNode;
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
    assert(node.name === "refState", node.toString());
    result.push(checkPresent(node.getAttr("unit")));
  }
  return result;
}

// function getLineText(lineRoot: XmlNode): string {
//   const child = lineRoot.children[0];
//   if (typeof child === "string") {
//     return child;
//   } else if (child.name === "del") {
//     return child.toString();
//   } else if (child.name === "quote") {
//     return `"${XmlNode.getSoleText(child)}"`;
//   }
//   throw Error("Unhandled line");
// }

// function printPoem(root: XmlNode) {
//   if (root.name === "head") {
//     assert(root.children.length === 1);
//     const text = XmlNode.assertIsString(root.children[0]);
//     console.log();
//     console.log(text);
//     console.log();
//     return;
//   }
//   if (root.name === "speaker") {
//     assert(root.children.length === 1);
//     const text = XmlNode.assertIsString(root.children[0]);
//     console.log(text);
//     return;
//   }
//   if (root.name === "l") {
//     assert(root.children.length === 1);
//     const lineNum = +checkPresent(root.getAttr("n"));
//     const lineNumText = lineNum % 5 === 0 ? lineNum.toString() : "";
//     const lineText = getLineText(root);
//     console.log(`${lineNumText.padEnd(4)}${lineText}`);
//     return;
//   }
//   for (const child of root.children) {
//     printPoem(XmlNode.assertIsNode(child));
//   }
// }

/** Returns the parsed content of a TEI XML file. */
export function parseTeiXml(filePath: string): TeiDocument {
  const teiRoot = parseRawXml(fs.readFileSync(filePath));
  const info = extractInfo(teiRoot);
  const textParts = findTextParts(teiRoot);
  const content = findChild(teiRoot, CONTENT_PATH);
  return { info, textParts, content };
}
