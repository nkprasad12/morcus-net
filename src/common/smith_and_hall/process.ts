import { assert } from "@/common/assert";
import fs from "fs";
import readline from "readline";

const SHOW_FILE_NAMES = false;

const START_OF_FILE = "-----File:";
const START_OF_ENTRIES = "-----File: b0001l.png";
const END_OF_ENTRIES = "THE END.";
const KEPT_EDITOR_NOTE = /\[\*\*[ ]?([^\]]|----)\]/g;
const REMOVED_EDITOR_NOTE = /\[\*\*[^\]]*\]/g;
const DASH_START_ENTRIES = /^----[^-]/;
const BOLD_PATTERN = /<b>([^<]+)<\/b>/;

const CORRECTIONS = new Map<string, string>([
  [`<i>affable</i>:`, `<b>affable</b>:`],
  [`beside (<i>prep.</i>):`, `<b>beside</b> (<i>prep.</i>):`],
  [
    `bibliopolist[**"li" unclear]: biblĭŏpōla: Plin.:`,
    `<b>bibliopolist</b>: biblĭŏpōla: Plin.:`,
  ],
  [
    `bigness: v. <f>BULK</f>, <f>SIZE</f>.`,
    `<b>bigness</b>: v. <f>BULK</f>, <f>SIZE</f>.`,
  ],
  [`<i>cricket</i>:`, `<b>cricket</b>:`],
  [
    `<i>crier</i>: praeco, ōnis, <i>m.</i> (the most gen.`,
    `<b>crier</b>: praeco, ōnis, <i>m.</i> (the most gen.`,
  ],
  [`<i>darkish</i>:`, `<b>darkish</b>:`],
  [
    `<i>defloration</i>: stuprum: v. <f>DEBAUCHERY</f>,`,
    `<b>defloration</b>: stuprum: v. <f>DEBAUCHERY</f>,`,
  ],
  [`<f>earnestness</f>:`, `<b>earnestness</b>:`],
  [
    `<i>foot-soldier</i>: pĕdes, ĭtis, c.: Caes.:`,
    `<b>foot-soldier</b>: pĕdes, ĭtis, c.: Caes.:`,
  ],
  [
    `<f>foreman</f>: i. e., <i>manager, overseer</i>:`,
    `<b>foreman</b>: i. e., <i>manager, overseer</i>:`,
  ],
  [
    `<i>instill</i>: instillo, 1 (with <i>acc.</i> and`,
    `<b>instill</b>: instillo, 1 (with <i>acc.</i> and`,
  ],
  [
    `<i>parallelism</i>: v. <f>PARALLEL</f> (<i>adj.</i>).`,
    `<b>parallelism</b>: v. <f>PARALLEL</f> (<i>adj.</i>).`,
  ],
  [`remittance: pecunia may be used`, `<b>remittance</b>: pecunia may be used`],
  [
    `<i>snaffle</i> (<i>v.</i>): v. <f>TO BIT</f>, <f>BRIDLE</f>.`,
    `<b>snaffle</b> (<i>v.</i>): v. <f>TO BIT</f>, <f>BRIDLE</f>.`,
  ],
  [
    `thrum (<i>subs.</i>): līcium: <i>to add t.s to`,
    `<b>thrum</b> (<i>subs.</i>): līcium: <i>to add t.s to`,
  ],
]);

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

function exhaustiveGuard(_value: never): never {
  throw new Error(
    `ERROR! Reached forbidden guard function with unexpected value: ${JSON.stringify(
      _value
    )}`
  );
}

function lineEmpty(input: string): boolean {
  return input.trim().length === 0;
}

export function handleEditorNotes(input: string): string {
  return input.replace(KEPT_EDITOR_NOTE, "$1").replace(REMOVED_EDITOR_NOTE, "");
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
    const line = handleEditorNotes(corrected);
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

// @ts-ignore
function processArticles(rawArticles: string[][]): ShEntry[] {
  // Rough algorithm:
  // 1. Fix any ----
  // 2. Compute entry key by splitting on :
  // 3. Take everything else up to the next line break as the blurb
  // 4. After that, chunks are separated by line breaks
  // 5. For each chunk, split on the first "."
  // 6. The first half becomes the sense level, everything after is sense text

  // @ts-ignore
  const entries: ShEntry[] = [];
  // @ts-ignore
  let lastUndashed: string | null = null;
  for (const article of rawArticles) {
    if (article[0].startsWith("<b>")) {
      const matchResult = article[0].match(BOLD_PATTERN);
      assert(matchResult !== null, `match null for ${article[0]}`);
      // @ts-ignore
      const entryName = matchResult[0];
      lastUndashed = entryName;
    }
  }
  // if (line.startsWith("---- <b>")) {
  //   // A special case, where the dashes should be filled in by
  //   // the name of the last non-dashed article. Note that the bold
  //   // after the space should also be considered part of the entry name.
  //   state = "InArticle";
  //   continue;
  // }
  // if (line.startsWith("----, <b>")) {
  //   // A special case, where the dashes should be filled in by
  //   // the name of the last non-dashed article. Note that the bold
  //   // after the comma should also be considered part of the entry name.
  //   state = "InArticle";
  //   continue;
  // }
  // if (line.startsWith("---- ")) {
  //   // A special case, where the dashes should be filled in by
  //   // the name of the last non-dashed article. This only happens once.
  //   state = "InArticle";
  //   continue;
  // }
  // if (line === "/*") {
  //   // TODO: Here we have multiple headings for the same article.
  //   // So we need to start headings in parallel, compute the content for
  //   // the article, and attach the content to all headings.
  //   state = "InArticle";
  //   allArticles.push([line]);
  //   continue;
  // }
}

export async function processSmithHall() {
  const articles = await getArticles();
  for (const article of articles) {
    console.log(article);
    console.log("\n*************\n");
  }
}

// run();
