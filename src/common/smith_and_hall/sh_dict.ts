import { checkPresent } from "@/common/assert";
import { EntryOutline, EntryResult } from "@/common/dictionaries/dict_result";
import { SqlDict } from "@/common/dictionaries/dict_storage";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { ShEntry } from "@/common/smith_and_hall/sh_process";
import { XmlNode } from "@/common/xml_node";

function toGenericDict(processed: ShEntry[]): EntryResult[] {
  return processed.map((article, i) => {
    const senseText = article.senses.map(
      (sense, j) =>
        new XmlNode(
          "div",
          [],
          [
            new XmlNode(
              "span",
              [
                ["class", "lsSenseBullet"],
                ["senseid", `sh${i}.${j}`],
              ],
              [` ${sense.level}.`]
            ),
            new XmlNode("span", [], [sense.text]),
          ]
        )
    );
    const blurbText = new XmlNode("div", [], [article.blurb]);
    const outline: EntryOutline = {
      mainOrth: article.keys[0],
      mainSection: {
        level: 0,
        ordinal: "0",
        text: article.blurb,
        sectionId: `sh${i}`,
      },
    };
    return {
      entry: new XmlNode("div", [], [blurbText, ...senseText]),
      outline: outline,
    };
  });
}

export class SmithAndHall extends SqlDict {
  constructor(dbPath: string = checkPresent(process.env.SH_PROCESSED_PATH)) {
    super(
      dbPath,
      LatinDict.SmithAndHall,
      (entryStrings) => {
        const processedEntries = entryStrings.map((x) => JSON.parse(x));
        return toGenericDict(processedEntries);
      },
      (input) => input.split("@")
    );
  }
}
