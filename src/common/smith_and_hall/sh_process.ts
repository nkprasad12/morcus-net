import { assert } from "@/common/assert";
import { exhaustiveGuard } from "@/common/misc_utils";
import { processRawSense } from "@/common/smith_and_hall/sh_senses";
import { getArticles, lineEmpty } from "@/common/smith_and_hall/sh_parse";
import {
  NormalizedArticle,
  normalizeArticles,
} from "@/common/smith_and_hall/sh_preprocessing";
import { RawSense, ShEntry } from "@/common/smith_and_hall/sh_entry";

const SENSE_LEVELS =
  /^([ABCDEFabcdef]|(?:1|2)?[0-9]|I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|U|Phr)$/;
const PAREN_SENSE_START = /^\(<i>[abcde]<\/i>\)\./;
const PAREN_SENSE_START_DOT = /^\(<i>[abcde]\.<\/i>\)/;
const NO_ITAL_SENSE_START_DOT = /^\([1-9]\.\)/;
const PAREN_SENSE_START_SPACE = /^\([A-F]\) /;

type ProcessState = "In Blurb" | "In Sense" | "None";

export function splitSense(rawLine: string): RawSense {
  const line = rawLine.trimStart();
  if (PAREN_SENSE_START_DOT.test(line) || PAREN_SENSE_START.test(line)) {
    return {
      bullet: line[4],
      text: line.substring(11),
    };
  }
  if (NO_ITAL_SENSE_START_DOT.test(line)) {
    return {
      bullet: line[1],
      text: line.substring(4),
    };
  }
  if (PAREN_SENSE_START_SPACE.test(line)) {
    return {
      bullet: line[1],
      text: line.substring(3),
    };
  }
  for (const separator of [".", ",", ":"]) {
    const i = line.indexOf(separator);
    const maybeLevel = line.substring(0, i);
    if (SENSE_LEVELS.test(maybeLevel)) {
      return {
        bullet: maybeLevel,
        text: line.substring(i + 1),
      };
    }
  }
  throw Error(line);
}

function processArticle(rawArticle: NormalizedArticle): ShEntry {
  assert(!lineEmpty(rawArticle.text[0]));
  assert(lineEmpty(rawArticle.text[rawArticle.text.length - 1]));

  const result: ShEntry = { keys: rawArticle.keys, blurb: "", senses: [] };
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
