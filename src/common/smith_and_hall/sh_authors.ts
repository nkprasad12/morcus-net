/* istanbul ignore file */

import { assert } from "@/common/assert";
import { exhaustiveGuard } from "@/common/misc_utils";
import fs from "fs";

const AUTHORS_FILE = "texts/latin/smithandhall/sh_authors.txt";
const OUT_FILE = "texts/latin/smithandhall/sh_authors_processed.txt";
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
  //   if (result.abbreviations.length > 1) {
  //     console.log(JSON.stringify(result.abbreviations));
  //   }
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

  fs.writeFileSync(
    options?.output || OUT_FILE,
    authors
      .map((data) => {
        // assert(data.authorLines.length > 0);
        // let resultLines = ["AUTHOR"].concat(
        //   data.authorLines.map((l) => "  " + l)
        // );
        // if (data.worksLines.length > 0) {
        //   resultLines = resultLines.concat(
        //     ["WORKS"].concat(data.worksLines.map((l) => "  " + l))
        //   );
        // }
        // return resultLines.join("\n");
        return JSON.stringify(processAuthorData(data), undefined, 2);
      })
      .join("\n\n\n")
  );
}

processFile();
