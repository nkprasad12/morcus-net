import { XMLParser } from 'fast-xml-parser';
import { readFileSync } from 'fs';

const REPO_ROOT = '/home/nkprasad/morcus/morcus-net'
const LATIN_ROOT = 'texts/latin'
const DBG_ROOT = 'data/phi0448/phi001/phi0448.phi001.perseus-lat2.xml'

class Section {
  constructor(readonly passage: string, readonly num: number) { }

  toString(): string {
    return `${this.num}: ${this.passage}`;
  }
}

class Chapter {
  constructor(readonly sections: Section[], readonly num: number) { }

  toString(): string {
    const results = []
    results.push(`Chapter ${this.num}`);
    for (const section of this.sections) {
      results.push(`  ${section}`);
    }
    return results.join('\n');
  }
}

class Book {
  constructor(readonly chapters: Chapter[], readonly num: number) { }

  toString(): string {
    const results = []
    results.push('======')
    results.push(`Book ${this.num}`);
    results.push('======')
    for (const chapter of this.chapters) {
      results.push(`${chapter}\n`);
    }
    return results.join('\n');
  }
}

class FullText {
  constructor(readonly books: Book[]) { }

  toString(): string {
    return this.books.map((book) => book.toString()).join('\n\n');
  }
}

function getAttr(element: any, name: string): any {
  return element[`@_${name}`]
}

function isTextPart(element: any): boolean {
  const elementType = getAttr(element, 'type');
  if (!elementType) {
    return false;
  }
  return elementType === 'textpart';
}

function assertTextType(textPart: any, textType: string): void {
  const subtype = getAttr(textPart, 'subtype');
  if (subtype !== textType) {
    throw new Error(`Expected ${textType}, but got ${textPart}`)
  }
}

function assertHasDiv(textPart: any) {
  if (!textPart.div) {
    console.log(textPart);
    throw new Error(`Expected to have div element: ${textPart}`)
  }
}

function getChildren(textPart: any) {
  assertHasDiv(textPart);
  if (typeof textPart.div[Symbol.iterator] !== 'function') {
    return [textPart.div];
  }
  return textPart.div;
}

function parseSection(textPart: any): Section {
  assertTextType(textPart, 'section');
  const n = getAttr(textPart, 'n');
  const text = textPart.p['#text'] || textPart.p;
  return new Section(text, n);
}

function parseChapter(textPart: any): Chapter {
  assertTextType(textPart, 'chapter');
  const n = getAttr(textPart, 'n');
  const children = getChildren(textPart);
  return new Chapter(children.map(parseSection), n);
}

function parseBook(textPart: any): Book {
  assertTextType(textPart, 'book');
  const n = getAttr(textPart, 'n');
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
    const subtype = getAttr(part, 'subtype');
    if (subtype !== 'book') {
      console.log(`Expected textpart book, but got ${part}`);
      continue;
    }
    books.push(parseBook(part));
  }
  return new FullText(books);
}

function readLatinFile(relativePath: string): FullText {
  const xmlFile = readFileSync(`${REPO_ROOT}/${LATIN_ROOT}/${relativePath}`)
  const options = {
    ignoreAttributes: false
  }
  const contents = new XMLParser(options).parse(xmlFile);
  const contentRoot = contents.TEI.text.body.div;
  return parseFullText(contentRoot);
}

console.log(readLatinFile(DBG_ROOT).toString());
