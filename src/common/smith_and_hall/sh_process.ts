import { assert, checkPresent } from "@/common/assert";
import { exhaustiveGuard } from "@/common/misc_utils";
import {
  extractEntryKeyFromLine,
  handleEditorNotes,
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

export function expandDashes(
  nameWithDashes: string,
  lastUndashedName: string
): string {
  if (VERBOSE) {
    console.log(
      `Need to normalize: ${nameWithDashes}\nLast: ${lastUndashedName}\n`
    );
  }
  // TODO: Actually normalize this.
  return nameWithDashes;
}

// TODO: SH sometimes has breves marked as e.g. [)o] or [)i] and
// sometimes has macra marked as e.g. [=o] and [=i]

/** Normalizes ---- and combines `/ *` (no space) based articles  */
interface NormalizedArticle {
  name: string;
  text: string[];
}

function normalizeArticles(rawArticles: string[][]): NormalizedArticle[] {
  const normalized: NormalizedArticle[] = [];
  let lastUndashed: NormalizedArticle | null = null;
  const degens: string[] = [];
  for (const unnormalized of rawArticles) {
    if (unnormalized[0] === "/*") {
      // TODO: Here we have multiple headings for the same article.
      // So we need to start headings in parallel, compute the content for
      // the article, and attach the content to all headings.
      // Note that sometimes there is content after the }
      // console.log("Skipping a /* entry - make sure to handle this later.\n");
      normalized.push({ name: "SKIPPED", text: ["SKIPPED FOR NOW"] });
      continue;
    }
    const firstLine = unnormalized[0];
    let name: string | null = null;
    try {
      name = extractEntryKeyFromLine(firstLine);
    } catch (e) {
      degens.push(firstLine);
      continue;
    }

    if (!name.includes("----")) {
      const result = { name, text: unnormalized.map((x) => x) };
      normalized.push(result);
      lastUndashed = result;
      continue;
    }

    checkPresent(
      lastUndashed,
      "Got a dashed entry without a last undashed entry."
    );
    const normalizedName = expandDashes(name, lastUndashed?.name!);
    // TODO: Also substitute for the dashes in the text.
    // Probably can replace `name` in unnormalized[0] with `normalizedName`.
    // Just need to check that there is only one instance.
    normalized.push({ name: normalizedName, text: unnormalized.map((x) => x) });
  }
  console.log(
    `${degens.length}\n====\n${JSON.stringify(degens, undefined, 2)}\n====`
  );
  return normalized;
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
  // for (let i = 0; i < articles.length; i++) {
  //   console.log(articles[i]);
  //   console.log(JSON.stringify(processed[i]));
  //   console.log("\n*************\n");
  // }
}

// run();

/* Where I left off:
  
Look at sh_verbose.txt for 
`Got a first line without :`

These are the locations where we have an irregularity in the start of an entry.
The typical format is:

<b>word[, word2]</>: [stuff]

But these do not have a `:` in the start line, which is an irregularity.

Generally:
- These have some sort of punctiation after their `:`, like `;` or `,`.
- However, some entries have the format <b>w1</b>, <b>w2</b>: instead of the
    expected <b>w1, w2</b>:

Possibl next step here would be to try to merge all <b>w1</b>, <b>w2</b>:
in a preprocessing step first.
1. Come up with a way to detect these
2. If there are few enough to review manually, check them all or sample them.
     These should always be two English words with roughly similar meanings.

*/
