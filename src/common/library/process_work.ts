import { assert, assertEqual, checkPresent } from "@/common/assert";
import { LatinWords } from "@/common/lexica/latin_words";
import { TEXT_BREAK_CHARACTERS } from "@/common/text_cleaning";
import { DocumentInfo, TeiDocument } from "@/common/xml/xml_files";
import { XmlChild, XmlNode } from "@/common/xml/xml_node";
import { TextNodeData, findTextNodes } from "@/common/xml/xml_utils";
import {
  Validator,
  instanceOf,
  isArray,
  isNumber,
  isOneOf,
  isPair,
  isString,
  matches,
} from "@/web/utils/rpc/parsing";

const DEFAULT_TEXT_NODES = ["p"];
const KNOWN_ALT_NODES = ["add", "sic"];

function signaturesEqual(
  reference: string[],
  other: (string | undefined)[]
): boolean {
  if (reference.length !== other.length) {
    return false;
  }
  for (let i = 0; i < reference.length; i++) {
    if (reference[i] !== other[i]) {
      return false;
    }
  }
  return true;
}

function compare(previous: number[], next: number[]): number {
  assertEqual(previous.length, next.length);
  for (let i = 0; i < previous.length; i++) {
    if (previous[i] > next[i]) {
      return -1;
    }
    if (next[i] > previous[i]) {
      return 1;
    }
  }
  return 0;
}

function extractChunkId(
  data: TextNodeData,
  expectedParts: string[]
): number[] | undefined {
  const textParts: [string | undefined, string | undefined][] = data.ancestors
    .concat(data.parent)
    .filter((node) => node.getAttr("type") === "textpart")
    .map((node) => [node.getAttr("subtype"), node.getAttr("n")]);
  const signature = textParts.map(([subtype, _n]) => subtype);
  if (!signaturesEqual(expectedParts, signature)) {
    console.debug(`Invalid signature ${signature} for ${data.text}`);
    return undefined;
  }
  return textParts.map(([_subtype, n]) => parseInt(checkPresent(n)));
}

function markupText(text: string, parentName: string): XmlChild[] {
  const isAlt = !DEFAULT_TEXT_NODES.includes(parentName);
  assert(!isAlt || KNOWN_ALT_NODES.includes(parentName), parentName);
  const words = text.split(TEXT_BREAK_CHARACTERS).map((word) => {
    if (!LatinWords.allWords().has(word)) {
      return word;
    }
    return new XmlNode("libLat", [], [word]);
  });
  return isAlt ? [new XmlNode("span", [["alt", parentName]], words)] : words;
}

export interface ProcessedWork {
  info: DocumentInfo;
  textParts: string[];
  chunks: [number[], XmlChild[]][];
}

export namespace ProcessedWork {
  export const isMatch: Validator<ProcessedWork> = matches([
    ["info", DocumentInfo.isMatch],
    ["textParts", isArray(isString)],
    [
      "chunks",
      isArray(
        isPair(
          isArray(isNumber),
          isArray(isOneOf(isString, instanceOf(XmlNode)))
        )
      ),
    ],
  ]);
}

/** Returns the processed content of a TEI XML file. */
export function processTei(teiRoot: TeiDocument): ProcessedWork {
  const chunks: [number[], XmlChild[]][] = [];
  for (const textNode of findTextNodes(teiRoot.content)) {
    const chunkId = extractChunkId(textNode, teiRoot.textParts);
    if (chunkId === undefined) {
      continue;
    }
    const newMarkup = markupText(textNode.text, textNode.parent.name);
    if (chunks.length === 0) {
      chunks.push([chunkId, newMarkup]);
      continue;
    }
    const idComparison = compare(chunks[chunks.length - 1][0], chunkId);
    assert(idComparison >= 0);
    if (idComparison > 0) {
      chunks.push([chunkId, newMarkup]);
    } else {
      chunks[chunks.length - 1][1] =
        chunks[chunks.length - 1][1].concat(newMarkup);
    }
  }
  return {
    info: teiRoot.info,
    textParts: teiRoot.textParts,
    chunks,
  };
}
