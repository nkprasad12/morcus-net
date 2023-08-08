import { assert } from "@/common/assert";
import { exhaustiveGuard } from "@/common/misc_utils";
import { handleEditorNotes } from "@/common/smith_and_hall/sh_preprocessing";
import {
  CORRECTIONS,
  DASH_EDGE_CASES,
  IGNORE_EMPTY_LINE_AFTER,
} from "@/common/smith_and_hall/sh_replacements";
import { removeDiacritics } from "@/common/text_cleaning";
import fs from "fs";
import readline from "readline";

const SHOW_FILE_NAMES = false;
const VERBOSE = false;

const START_OF_FILE = "-----File:";
const START_OF_ENTRIES = "-----File: b0001l.png";
const END_OF_ENTRIES = "THE END.";
const DASH_START_ENTRIES = /^----[^-]/;

const HEADERS = "ABCDEFGHIJKLMNOPQRSTUVWYZ";
const SENSE_LEVELS = /^([A-Za-z0-9]|I|II|III|IV|V)$/;

const MACRONS = "āēīōūȳ";
const BREVES = "ăĕĭŏŭў";

const TO_MACRON_LIST: [string, string][] = [...MACRONS].map((c) => [
  `[=${removeDiacritics(c)}]`,
  c,
]);
const TO_BREVE_LIST: [string, string][] = [...BREVES].map((c) => [
  `[)${removeDiacritics(c)}]`,
  c,
]);
const MACRON_BREVES_MAP = new Map<string, string>(
  TO_BREVE_LIST.concat(TO_MACRON_LIST)
);

type ParseState =
  | "Unstarted"
  | "NotInArticle"
  | "InArticle"
  | "MaybeEndingArticle";

export function lineEmpty(input: string): boolean {
  return input.trim().length === 0;
}

function attachLengthMarks(input: string): string {
  let result = input;
  for (const [key, value] of MACRON_BREVES_MAP.entries()) {
    result = result.replaceAll(key, value);
  }
  return result;
}

export async function getArticles(): Promise<string[][]> {
  const fileStream = fs.createReadStream(process.env.SH_RAW_PATH!);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let nextHeaderIndex = 0;
  let state: ParseState = "Unstarted";
  let lastFile: string | null = null;
  const allArticles: string[][] = [];
  for await (const input of rl) {
    if (input.startsWith(START_OF_FILE)) {
      lastFile = input;
    }
    if (input === END_OF_ENTRIES) {
      // OK to break because we have two blank lines before this.
      break;
    }

    const corrected = CORRECTIONS.get(input) || input;
    // This is assuming there's no overlap between these two.
    // Since there are so few of each, we can manually verify.
    const dashEdgeCaseRemoved = DASH_EDGE_CASES.get(corrected) || corrected;
    if (VERBOSE) {
      if (dashEdgeCaseRemoved !== input) {
        console.log(`Corrected: ${input}\nto: ${dashEdgeCaseRemoved}\n`);
      }
    }

    const withoutLengthMarks = dashEdgeCaseRemoved.replaceAll(",,", ",");
    const withLengthMarks = attachLengthMarks(withoutLengthMarks);
    const line = handleEditorNotes(withLengthMarks);
    switch (state) {
      case "Unstarted":
        if (line.startsWith(START_OF_ENTRIES)) {
          state = "NotInArticle";
        }
        break;
      case "NotInArticle":
        if (lineEmpty(line)) {
          continue;
        }
        if (line.startsWith("<b>")) {
          // The expected case - a new article is starting.
          state = "InArticle";
          allArticles.push([line]);
          continue;
        }
        if (DASH_START_ENTRIES.test(line)) {
          state = "InArticle";
          allArticles.push([line]);
          continue;
        }
        if (line === "/*") {
          state = "InArticle";
          allArticles.push([line]);
          continue;
        }

        if (
          /^[A-Z]\.$/.test(line) &&
          nextHeaderIndex < HEADERS.length &&
          line === HEADERS.charAt(nextHeaderIndex) + "."
        ) {
          // We got a section header - A, B, C, D, E, etc...
          nextHeaderIndex += 1;
          continue;
        }

        if (SENSE_LEVELS.test(line.split(".")[0])) {
          // \(<i>[abcdefghi](?:[abcdefghi])?(?:[abcdefghi])(?:\.)?</i>\)
          state = "InArticle";
          // We have a sense that was accidentally separated from its article.
          assert(allArticles.length > 0, "Need to have a last article");
          allArticles[allArticles.length - 1].push(line);
          continue;
        }

        if (SHOW_FILE_NAMES) {
          console.log(lastFile);
        }
        throw new Error("Unexpected line");
      case "InArticle":
        if (line.startsWith(START_OF_FILE)) {
          continue;
        }
        assert(allArticles.length > 0, "Need to have a last article");
        if (lineEmpty(line)) {
          const lastArticle = allArticles[allArticles.length - 1];
          const lastLine = lastArticle[lastArticle.length - 1];
          if (IGNORE_EMPTY_LINE_AFTER.has(lastLine)) {
            continue;
          }
          state = "MaybeEndingArticle";
        }
        allArticles[allArticles.length - 1].push(line);
        break;
      case "MaybeEndingArticle":
        if (line.startsWith(START_OF_FILE)) {
          continue;
        }
        assert(allArticles.length > 0, "Need to have a last article");
        allArticles[allArticles.length - 1].push(line);
        state = lineEmpty(line) ? "NotInArticle" : "InArticle";
        break;
      default:
        return exhaustiveGuard(state);
    }
  }
  return allArticles;
}

// Things to watch out for:
// - [** symbol]
// - [**no new paragraph]
