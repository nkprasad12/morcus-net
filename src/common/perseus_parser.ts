import { XMLParser } from 'fast-xml-parser';
import { readFileSync } from 'fs';

const REPO_ROOT = '/home/nkprasad/morcus/morcus-net'
const LATIN_ROOT = 'texts/latin'
const DBG_ROOT = 'data/phi0448/phi001/phi0448.phi001.perseus-lat2.xml'

function printDiv(div: any): void {
    console.log(div.head)
    console.log(div.type)
    let x = 0;
    for (const part of div.div) {
      console.log(part.div)
      x += 1;
      if (x > 1) {
        break;
      }
    }
}

function getAttr(element: any, name: string): any {
    return element[`@_${name}`]
}

function hasAttr(element: any, name: string): boolean {
    return element[`@_${name}`]
}

function isTextPart(element: any): boolean {
    if (!hasAttr(element, 'type')) {
        return false;
    }
    return getAttr(element,  'type') === 'textpart';
}

function printTextPart(textPart: any): void {
    console.log(`${getAttr(textPart, 'subtype')} ${getAttr(textPart, 'n')}`)
}

function readLatinFile(relativePath: string): void {
  const xmlFile = readFileSync(`${REPO_ROOT}/${LATIN_ROOT}/${relativePath}`)
  const options = {
    ignoreAttributes: false
  }
  const contents = new XMLParser(options).parse(xmlFile);
  const contentRoot = contents.TEI.text.body.div.div;
  // printDiv(contentRoot[0]);

  for (const part of contentRoot) {
    if (isTextPart(part)) {
        printTextPart(part);
        // TODO: Pri nt the rest rescursively
    }
  }
}

readLatinFile(DBG_ROOT);
