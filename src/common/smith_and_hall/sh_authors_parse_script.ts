/* istanbul ignore file */

import { assert, assertEqual } from "@/common/assert";
import { exhaustiveGuard } from "@/common/misc_utils";
import fs from "fs";

const AUTHORS_FILE = "texts/latin/smithandhall/sh_authors.txt";
const OUT_FILE = "texts/latin/smithandhall/sh_authors_processed.json";
const AUTHOR_COLUMN_SEPARATOR = "        ";

type ProcessStates =
  | "Empty"
  | "ReadingAuthor"
  | "MaybePendingWorks"
  | "ReadingWorks";

interface RawAuthorData {
  authorLines: string[];
  worksLines: string[];
}

interface AuthorData {
  abbreviations: string[];
  expansions: string;
  date?: string;
  works?: [string[], string][];
}

function processAuthorData(data: RawAuthorData): AuthorData {
  const authorLines = data.authorLines;
  assert(authorLines.length > 0);
  const headerChunks = authorLines[0]
    .split(AUTHOR_COLUMN_SEPARATOR)
    .map((c) => c.trim())
    .filter((c) => c.length !== 0);

  assert(headerChunks.length >= 2 && headerChunks.length <= 3, authorLines[0]);
  const result: AuthorData = {
    abbreviations: headerChunks[0].split(",").map((c) => c.trim()),
    expansions: headerChunks[1],
  };
  if (headerChunks.length === 3) {
    result.date = headerChunks[2];
  }
  if (data.worksLines.length > 0) {
    result.works = [];
    for (const rawWork of data.worksLines) {
      const work = rawWork.trim();
      assert(work.startsWith('"'));
      const workChunks = work
        .substring(1)
        .split(",")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      assert(workChunks.length === 2, work);
      const workNames = workChunks[0]
        .split("<i>or</i>")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      result.works.push([workNames, workChunks[1]]);
    }
  }

  for (const authorLine of data.authorLines.slice(1)) {
    const chunks = authorLine
      .split(AUTHOR_COLUMN_SEPARATOR)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    result.expansions += " " + chunks[0];
    if (chunks.length > 1) {
      assert(chunks.length === 2, authorLine);
      assert(result.date === undefined);
      result.date = chunks[1];
    }
  }

  return result;
}

export function processFile(options?: { input?: string; output?: string }) {
  const lines = fs
    .readFileSync(options?.input || AUTHORS_FILE)
    .toString()
    .split("\n")
    .filter(
      (line) =>
        !line.startsWith("/*") &&
        !line.startsWith("*/") &&
        !line.startsWith("----")
    );

  const authors: RawAuthorData[] = [];
  let state: ProcessStates = "Empty";
  for (const line of lines) {
    if (line.trim().length === 0) {
      if (state === "Empty") {
        continue;
      } else if (state === "ReadingAuthor") {
        state = "MaybePendingWorks";
        continue;
      } else if (state === "MaybePendingWorks") {
        throw new Error("Unexpected second blank line");
      } else if (state === "ReadingWorks") {
        state = "Empty";
        continue;
      }
    } else {
      if (state === "Empty") {
        assert(!line.startsWith('"'));
        assert(!line.startsWith(" "));
        state = "ReadingAuthor";
        authors.push({ authorLines: [line], worksLines: [] });
        continue;
      } else if (state === "ReadingAuthor") {
        authors[authors.length - 1].authorLines.push(line);
        continue;
      } else if (state === "MaybePendingWorks") {
        if (/[a-zA-Z]/.test(line[0])) {
          state = "ReadingAuthor";
          authors.push({ authorLines: [line], worksLines: [] });
        } else {
          state = "ReadingWorks";
          assert(line.trim()[0] === '"');
          authors[authors.length - 1].worksLines.push(line);
        }
        continue;
      } else if (state === "ReadingWorks") {
        assert(line.trim()[0] === '"');
        authors[authors.length - 1].worksLines.push(line);
        continue;
      }
    }
    exhaustiveGuard(state);
  }

  const processedData = authors.map(processAuthorData);
  // Initialize to anything since we know the first one has it.
  let lastEra: string = "B.C.";
  let lastDateType: string = "obiit";
  for (const authorData of processedData) {
    const date = authorData.date;
    if (date === undefined) {
      continue;
    }
    // Some of the dates have notes or estimates instead of the regular format.
    // These can be safely ignored as they never have data from the previous note
    // to be filled in, nor do they contain data to be used for the next author.
    if (
      date.includes("(") ||
      date === "circa A.D. 4th cent." ||
      date === "between 2nd and 5th cent. A.D."
    ) {
      continue;
    }
    const allDateParts = date
      .split(" ")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
    const dateParts = allDateParts.slice(-3);
    assertEqual(dateParts.length, 3, date);
    if (dateParts.includes("A.D.")) {
      lastEra = "A.D.";
    }
    if (dateParts.includes("B.C.")) {
      assert(!dateParts.includes("A.D."));
      lastEra = "B.C.";
    }
    if (
      !["B.C.", "A.D.", '"'].includes(dateParts[1]) ||
      !/^\d+$/.test(dateParts[2])
    ) {
      assert(!dateParts.includes('"'));
      continue;
    }

    if (dateParts[0] !== '"') {
      lastDateType = dateParts[0];
    }

    if (dateParts[0] === '"') {
      dateParts[0] = lastDateType;
    }
    if (dateParts[1] === '"') {
      dateParts[1] = lastEra;
    }

    assert(!dateParts.includes('"'));
    authorData.date = allDateParts.slice(0, -3).concat(dateParts).join(" ");
  }
  fs.writeFileSync(
    options?.output || OUT_FILE,
    JSON.stringify(processedData, undefined, 2)
  );
}

processFile();
