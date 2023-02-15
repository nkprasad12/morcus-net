import { XMLParser } from "fast-xml-parser";
import { readFileSync } from "fs";
import { Section, Chapter, Book, FullText } from "@/common/texts";

function getAttr(element: any, name: string): any {
  return element[`@_${name}`];
}

function isTextPart(element: any): boolean {
  const elementType = getAttr(element, "type");
  if (!elementType) {
    return false;
  }
  return elementType === "textpart";
}

function assertTextType(textPart: any, textType: string): void {
  const subtype = getAttr(textPart, "subtype");
  if (subtype !== textType) {
    throw new Error(`Expected ${textType}, but got ${textPart}`);
  }
}

function assertHasDiv(textPart: any) {
  if (!textPart.div) {
    console.log(textPart);
    throw new Error(`Expected to have div element: ${textPart}`);
  }
}

function getChildren(textPart: any) {
  assertHasDiv(textPart);
  if (typeof textPart.div[Symbol.iterator] !== "function") {
    return [textPart.div];
  }
  return textPart.div;
}

function parseSection(textPart: any): Section {
  assertTextType(textPart, "section");
  const n = getAttr(textPart, "n");
  const text = textPart.p["#text"] || textPart.p;
  return new Section(text, n);
}

function parseChapter(textPart: any): Chapter {
  assertTextType(textPart, "chapter");
  const n = getAttr(textPart, "n");
  const children = getChildren(textPart);
  return new Chapter(children.map(parseSection), n);
}

function parseBook(textPart: any): Book {
  assertTextType(textPart, "book");
  const n = getAttr(textPart, "n");
  const children = getChildren(textPart);
  return new Book(children.map(parseChapter), n);
}

function parseFullText(root: any): FullText {
  const children = getChildren(root);
  const books = [];
  for (const part of children) {
    if (!isTextPart(part)) {
      console.log(`Expected textpart, but got ${part}`);
      continue;
    }
    const subtype = getAttr(part, "subtype");
    if (subtype !== "book") {
      console.log(`Expected textpart book, but got ${part}`);
      continue;
    }
    books.push(parseBook(part));
  }
  return new FullText(books);
}

export function readFile(relativePath: string): FullText {
  const xmlFile = readFileSync(relativePath);
  const options = {
    ignoreAttributes: false,
  };
  const contents = new XMLParser(options).parse(xmlFile);
  const contentRoot = contents.TEI.text.body.div;
  return parseFullText(contentRoot);
}
