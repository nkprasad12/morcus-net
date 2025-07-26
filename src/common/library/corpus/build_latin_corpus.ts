import { ProcessedWork2 } from "@/common/library/library_types";
import type { XmlNode } from "@/common/xml/xml_node";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import { parseMessage } from "@/web/utils/rpc/parsing";

import fs from "fs";

function extractRowText(node: XmlNode | string): string {
  if (typeof node === "string") {
    return node;
  }
  return node.children.map(extractRowText).join("");
}

export function buildCorpusFromProcessedWorks(filePaths: string[]) {
  const startTime = Date.now();
  let totalWords = 0;
  for (const workPath of filePaths) {
    const work = parseMessage(
      fs.readFileSync(workPath, "utf8"),
      ProcessedWork2.isMatch,
      [XmlNodeSerialization.DEFAULT]
    );
    if (work.info.isTranslation) {
      continue;
    }
    let wordsInWork = 0;
    for (const [_, section] of work.rows) {
      const rowText = extractRowText(section);
      const words = rowText.split(/\s+/).filter((w) => w.length > 0);
      wordsInWork += words.length;
    }
    totalWords += wordsInWork;
  }
  console.log(`Total words in corpus: ${totalWords}`);
  console.log(`Corpus indexing runtime: ${Date.now() - startTime}ms`);
}
