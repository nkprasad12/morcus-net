import { assert } from "@/common/assert";
import { exhaustiveGuard } from "@/common/misc_utils";
import {
  handleEditorNotes,
  normalizeArticles,
} from "@/common/smith_and_hall/sh_preprocessing";
import {
  CORRECTIONS,
  DASH_EDGE_CASES,
} from "@/common/smith_and_hall/sh_replacements";
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

interface ShSense {
  level: string;
  text: string;
}

interface ShEntry {
  key: string;
  blurb?: string;
  senses?: ShSense[];
}

type ParseState =
  | "Unstarted"
  | "NotInArticle"
  | "InArticle"
  | "MaybeEndingArticle";

function lineEmpty(input: string): boolean {
  return input.trim().length === 0;
}

async function getArticles(): Promise<string[][]> {
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

    const line = handleEditorNotes(dashEdgeCaseRemoved);
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
        allArticles[allArticles.length - 1].push(line);
        if (lineEmpty(line)) {
          state = "MaybeEndingArticle";
        }
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

// @ts-expect-error
function processArticles(rawArticles: string[][]): ShEntry[] {
  // Rough algorithm:
  // 1. Fix any ----
  // 2. Compute entry key by splitting on :
  // 3. Take everything else up to the next empty line as the blurb
  // 4. After that, chunks are separated by empty lines
  // 5. For each chunk, split on the first "."
  // 6. The first half becomes the sense level, everything after is sense text

  const entries: ShEntry[] = [];
  return entries;
}

export async function processSmithHall() {
  const articles = await getArticles();
  normalizeArticles(articles);
}

/* Where I left off:
  
We have some version of extracting keys.
Next we need to:
1. implement `expandDashes`
2. implement parsing of the /* style entries
*/

// Things to watch out for:
// - [** symbol]
// - [**no new paragraph]

// TODO: SH sometimes has breves marked as e.g. [)o] or [)i] and
// sometimes has macra marked as e.g. [=o] and [=i]
