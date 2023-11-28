// // @ts-ignore
// import { betaCodeToGreek } from "beta-code-js";
import { assert, checkPresent } from "@/common/assert";
import { DocumentInfo } from "@/common/library/library_types";
import { XmlNode } from "@/common/xml/xml_node";
import { parseRawXml } from "@/common/xml/xml_utils";
import fs from "fs";

const CONTENT_PATH = ["text", "body", "div"];
// For the commentary.
// const CONTENT_PATH = ["text", "body"];
const TITLE_STATEMENT_PATH = ["teiHeader", "fileDesc", "titleStmt"];

// interface TextPart {
//   type: string;
//   n: number;
//   metadata?: string[];
//   header?: string;
//   content: (string | TextPart)[];
// }

export interface TeiDocument {
  /** Basic information about this document like title, author, and so on. */
  info: DocumentInfo;
  /** The names of the high levels divisions of this text. */
  textParts: string[];
  /** The node containing the actual document content. */
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
    assert(["refState", "step"].includes(node.name), node.toString());
    result.push(checkPresent(node.getAttr("unit") || node.getAttr("refunit")));
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

// Code for the commentary
// export function extractChildContent(child: XmlChild): string {
//   if (typeof child === "string") {
//     return child
//       .replace(/-\n\s*/g, "")
//       .replaceAll("\n", "")
//       .replace(/\s+/g, " ");
//   }
//   if (child.name === "foreign") {
//     assertEqual(child.getAttr("lang"), "greek");
//     assertEqual(child.children.length, 1);
//     return betaCodeToGreek(extractChildContent(child.children[0]));
//   }
//   if (child.name === "pb") {
//     return " ";
//   }
//   if (child.name === "hi") {
//     const rend = child.getAttr("rend");
//     const text = child.children.map(extractChildContent).join(" ");
//     if (rend === "caps") {
//       return text.toUpperCase();
//     } else if (rend === "italics") {
//       return `<i>${text}</i>`;
//     }
//     throw new Error("Unknown rend: " + rend);
//   }
//   throw new Error("Unknown child: " + child.name);
// }

// export function printCommline(root: XmlNode) {
//   assert(root.children.length === 1);
//   const content = XmlNode.assertIsNode(root.children[0]);
//   assert(content.name === "p");
//   console.log(content.children.map(extractChildContent).join(" "));
// }

// export function printCommentaryPart(root: XmlNode) {
//   for (const child of root.children) {
//     const node = XmlNode.assertIsNode(child);
//     if (node.name === "head") {
//       console.log(XmlNode.getSoleText(node));
//       console.log("\n");
//       continue;
//     }
//     assert(node.name === "div2");
//     assert(node.getAttr("type") === "commline");
//     console.log(`\nLine ${node.getAttr("n")}`);
//     printCommline(node);
//   }
// }

// export function printCommentary(root: XmlNode) {
//   for (const child of root.children) {
//     const node = XmlNode.assertIsNode(child);
//     if (node.name === "head") {
//       console.log(XmlNode.getSoleText(node));
//       console.log("\n");
//       continue;
//     }
//     assert(node.name === "div1");
//     assert(node.getAttr("type") === "poem");
//     console.log(`\n*****\nPoem: ${node.getAttr("n")}\n*****`);
//     printCommentaryPart(node);
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
