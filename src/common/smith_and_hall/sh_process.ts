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
