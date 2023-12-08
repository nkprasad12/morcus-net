import { assert, checkPresent } from "@/common/assert";
import { LatinWords } from "@/common/lexica/latin_words";
import { ProcessedWork } from "@/common/library/library_types";
import { safeParseInt } from "@/common/misc_utils";
import { TEXT_BREAK_CHARACTERS } from "@/common/text_cleaning";
import { TeiCtsDocument, TeiNode } from "@/common/xml/tei_utils";
import { XmlChild, XmlNode } from "@/common/xml/xml_node";
import { findTextNodes } from "@/common/xml/xml_utils";
import { instanceOf } from "@/web/utils/rpc/parsing";

const DEFAULT_TEXT_NODES = ["p"];
const KNOWN_ALT_NODES = ["add", "sic"];

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

function getChunks(root: TeiNode, idSize: number): [number[], XmlChild[]][] {
  if (root.id.length > idSize) {
    return [];
  }
  if (root.id.length < idSize) {
    return root.children
      .filter((c): c is TeiNode => !(c instanceof XmlNode))
      .flatMap((c) => getChunks(c, idSize));
  }
  return [
    [
      root.id.map((part) => checkPresent(safeParseInt(part))),
      root.children
        .filter(instanceOf(XmlNode))
        .flatMap((node) =>
          findTextNodes(node).flatMap((textNode) =>
            markupText(textNode.text, textNode.parent.name)
          )
        ),
    ],
  ];
}

/** Returns the processed content of a TEI XML file. */
export function processTei(teiRoot: TeiCtsDocument): ProcessedWork {
  const chunks = getChunks(teiRoot.content, teiRoot.textParts.length);
  return {
    info: teiRoot.info,
    textParts: teiRoot.textParts,
    chunks: chunks.map(([s, n]) => [s, new XmlNode("div", [], n)]),
  };
}
