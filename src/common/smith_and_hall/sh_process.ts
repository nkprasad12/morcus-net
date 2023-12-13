import { assert } from "@/common/assert";
import { exhaustiveGuard } from "@/common/misc_utils";
import { processRawSense, splitSense } from "@/common/smith_and_hall/sh_senses";
import { getArticles, lineEmpty } from "@/common/smith_and_hall/sh_parse";
import {
  NormalizedArticle,
  normalizeArticles,
} from "@/common/smith_and_hall/sh_preprocessing";
import { RawSense, ShEntry } from "@/common/smith_and_hall/sh_entry";
import { removeDiacritics } from "@/common/text_cleaning";
import { RawDictEntry } from "@/common/dictionaries/dict_storage";
import {
  ShLinkResolver,
  displayShEntry,
} from "@/common/smith_and_hall/sh_display";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import { getOutline } from "@/common/smith_and_hall/sh_outline";

type ProcessState = "In Blurb" | "In Sense" | "None";

function processArticle(rawArticle: NormalizedArticle): ShEntry {
  assert(!lineEmpty(rawArticle.text[0]));
  assert(lineEmpty(rawArticle.text[rawArticle.text.length - 1]));

  const keys = rawArticle.keys
    .flatMap((key) =>
      key.includes("-") ? [key, key.replaceAll("-", "")] : key
    )
    .map(removeDiacritics);
  const result: ShEntry = { keys: keys, blurb: "", senses: [] };
  let currentSense: Partial<RawSense> = {};
  let state: ProcessState = "In Blurb";
  for (const line of rawArticle.text) {
    if (lineEmpty(line)) {
      if (state === "In Sense") {
        result.senses.push(processRawSense(currentSense));
        currentSense = {};
      }
      state = "None";
      continue;
    }
    if (state === "In Sense") {
      assert(currentSense.text !== undefined);
      currentSense.text = currentSense.text + " " + line;
    } else if (state === "In Blurb") {
      result.blurb += " " + line;
    } else if (state === "None") {
      currentSense = splitSense(line);
      state = "In Sense";
    } else {
      exhaustiveGuard(state);
    }
  }
  return result;
}

export function shListToRaw(entries: ShEntry[]): RawDictEntry[] {
  const resolver = new ShLinkResolver(entries);
  return entries.map((entry, i) => {
    const displayEntry = displayShEntry(entry, i, resolver);
    const processedEntry = {
      entry: XmlNodeSerialization.DEFAULT.serialize(displayEntry),
      outline: getOutline(entry, i),
    };
    return {
      id: `sh${i}`,
      keys: entry.keys.join("@"),
      entry: JSON.stringify(processedEntry),
    };
  });
}

export async function processSmithHall(): Promise<ShEntry[]> {
  const articles = await getArticles();
  const normalized = normalizeArticles(articles);
  return normalized.map(processArticle);
}

// TODO:
// Many articles have (i), (ii), etc...
// or (<i>a</i>) or (<i>b.</b>) etc...
// in the text itself, and we need to correct these
// and make them part of their own senses
