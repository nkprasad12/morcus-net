/* istanbul ignore file */

// import { parseTeiXml } from "@/common/xml/xml_files";
import { parse } from "@/common/lewis_and_short/ls_parser";
import { LS_PATH } from "@/common/lewis_and_short/ls_scripts";
import { findTextNodes } from "@/common/lewis_and_short/ls_write";
import { Tally } from "@/common/misc_utils";
import { XmlNode } from "@/common/xml/xml_node";
import * as dotenv from "dotenv";

dotenv.config();

// const DOC_PATH =
//   "/home/nitin/Downloads/raw.githubusercontent.com_PerseusDL_canonical-latinLit_master_data_phi0690_phi001_phi0690.phi001.perseus-lat2.xml";

const startTime = performance.now();

// const root = parseTeiXml(DOC_PATH);

export function schemataCounts() {
  const words = new Tally<string>();
  for (const entry of parse(LS_PATH)) {
    const bold: XmlNode[] = [];
    const queue: XmlNode[] = [entry];
    while (queue.length > 0) {
      const current = queue.pop()!;
      for (const child of current.children) {
        if (typeof child === "string") {
          continue;
        }
        if (child.getAttr("rend") === "ital") {
          bold.push(child);
        } else {
          queue.push(child);
        }
      }
    }
    bold.flatMap(findTextNodes).forEach((data) => {
      if (data.text.includes(".")) {
        words.count(data.text);
      }
    });
    // const hiNodes = entry
    //   .findDescendants("hi")
    //   .filter((n) => n.getAttr("rend") === "ital");
    // for (const match of hiNodes) {
    //   console.log(XmlNode.getSoleText(match));
    // }
  }
  console.log(words.toString(2));
}

// schemataCounts();

const runtime = Math.round(performance.now() - startTime);
console.log(`Runtime: ${runtime} ms.`);
