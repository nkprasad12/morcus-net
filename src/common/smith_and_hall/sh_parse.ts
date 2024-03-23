import { assert } from "@/common/assert";
import { envVar } from "@/common/env_vars";
import { exhaustiveGuard } from "@/common/misc_utils";
import { handleEditorNotes } from "@/common/smith_and_hall/sh_preprocessing";
import {
  CORRECTIONS,
  DASH_EDGE_CASES,
  IGNORE_EMPTY_LINE_BEFORE,
} from "@/common/smith_and_hall/sh_replacements";
import { removeDiacritics } from "@/common/text_cleaning";
import fs from "fs";
import readline from "readline";

const START_OF_FILE = "-----File:";
const START_OF_ENTRIES = "-----File: b0001l.png";
const END_OF_ENTRIES = "THE END.";
const DASH_START_ENTRIES = /^----[^-]/;

const HEADERS = "ABCDEFGHIJKLMNOPQRSTUVWYZ";
const SENSE_LEVELS = /^([A-Za-z0-9]|I|II|III|IV|V)$/;
const BASE_ENTRY_KEY_PATTERN =
  /^<b>([^<>]+)+<\/b>(?: \([a-zA-Z ,.(?:<i>)(?:<i/>)=]+\))?:/;

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

function processSingleLine(
  state: ParseState,
  line: string,
  allArticles: string[][],
  nextHeaderIndex: number[]
): ParseState {
  switch (state) {
    case "Unstarted":
      if (line.startsWith(START_OF_ENTRIES)) {
        return "NotInArticle";
      }
      return "Unstarted";
    case "NotInArticle":
      if (lineEmpty(line)) {
        return "NotInArticle";
      }
      if (line.startsWith("<b>")) {
        // The expected case - a new article is starting.
        allArticles.push([line]);
        return "InArticle";
      }
      if (DASH_START_ENTRIES.test(line)) {
        allArticles.push([line]);
        return "InArticle";
      }
      if (line === "/*") {
        allArticles.push([line]);
        return "InArticle";
      }

      if (
        /^[A-Z]\.$/.test(line) &&
        nextHeaderIndex[0] < HEADERS.length &&
        line === HEADERS.charAt(nextHeaderIndex[0]) + "."
      ) {
        // We got a section header - A, B, C, D, E, etc...
        nextHeaderIndex[0] += 1;
        return "NotInArticle";
      }

      if (SENSE_LEVELS.test(line.split(".")[0])) {
        // We have a sense that was accidentally separated from its article.
        assert(allArticles.length > 0, "Need to have a last article");
        allArticles[allArticles.length - 1].push(line);
        return "InArticle";
      }

      throw new Error("Unexpected line");
    case "InArticle":
      assert(allArticles.length > 0, "Need to have a last article");
      if (lineEmpty(line)) {
        allArticles[allArticles.length - 1].push(line);
        return "MaybeEndingArticle";
      }
      allArticles[allArticles.length - 1].push(line);
      return "InArticle";
    case "MaybeEndingArticle":
      if (BASE_ENTRY_KEY_PATTERN.test(line)) {
        allArticles.push([]);
      } else if (IGNORE_EMPTY_LINE_BEFORE.has(line)) {
        assert(allArticles.length > 0, "Need to have a last article");
        assert(allArticles[allArticles.length - 1].slice(-1)[0] === "");
        allArticles[allArticles.length - 1].pop();
      }
      assert(allArticles.length > 0, "Need to have a last article");
      allArticles[allArticles.length - 1].push(line);
      return lineEmpty(line) ? "NotInArticle" : "InArticle";
    default:
      return exhaustiveGuard(state);
  }
}

export async function getArticles(
  fileName: string = envVar("SH_RAW_PATH")
): Promise<string[][]> {
  const fileStream = fs.createReadStream(fileName);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let lastLineChunk: string | undefined = undefined;
  const nextHeaderIndex = [0];
  let state: ParseState = "Unstarted";
  const allArticles: string[][] = [];
  for await (const input of rl) {
    if (input === END_OF_ENTRIES) {
      // OK to break because we have two blank lines before this.
      break;
    }

    if (/^\[\*\*[^\]]+\]$/.test(input)) {
      // Ignore lines that are only editor notes. We don't even want to
      // record a newline from these.
      continue;
    }

    if (
      input.startsWith(START_OF_FILE) &&
      !input.startsWith(START_OF_ENTRIES)
    ) {
      continue;
    }

    let line = CORRECTIONS.get(input) || input;
    if (lastLineChunk !== undefined) {
      const endTag = lastLineChunk.match(/<\/([A-Za-z]+)>$/);
      if (endTag === null) {
        assert(
          line.startsWith("*"),
          `Last line end: ${lastLineChunk}\nLine: ${line}`
        );
        line = lastLineChunk.slice(1, -2) + line.substring(1);
      } else {
        const lineStart = `<${endTag[1]}>*`;
        assert(line.startsWith(lineStart));
        line =
          lastLineChunk.slice(1, -(2 + lineStart.length)) +
          line.substring(lineStart.length);
      }
      lastLineChunk = undefined;
    }
    // This is assuming there's no overlap between this and CORRECTIONS.
    // Since there are so few of each, we can manually verify.
    line = DASH_EDGE_CASES.get(line) || line;
    line = line.replaceAll(",,", ",");
    line = attachLengthMarks(line);
    line = handleEditorNotes(line);
    line = line.replaceAll(/([A-Za-z])-\*([A-Za-z])/g, "$1-$2");
    const splitWord = line.match(/ [^ ]+-\*(?:<\/[A-Za-z]>)?$/);
    if (splitWord !== null) {
      lastLineChunk = splitWord[0];
      line = line.slice(0, -lastLineChunk.length);
    }
    state = processSingleLine(state, line, allArticles, nextHeaderIndex);
  }
  return allArticles;
}

// Things to watch out for:
// - [** symbol]
// - [**no new paragraph]
