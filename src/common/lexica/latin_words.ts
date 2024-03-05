import { readFileSync } from "fs";
import { assert, assertEqual, checkPresent, envVar } from "@/common/assert";
import { ARRAY_INDEX, DbConfig, ReadOnlyDb } from "@/common/sql_helper";
import { displayTextForOrth } from "@/common/lewis_and_short/ls_orths";
import { execSync } from "child_process";
import { SqliteDb } from "@/common/sqlite/sql_db";
import { XmlChild, XmlNode } from "@/common/xml/xml_node";
import { processWords, removeDiacritics } from "@/common/text_cleaning";
import { arrayMap } from "@/common/data_structures/collect_map";

const EXTENDED_COMMON_ENGLISH_WORDS = ["di", "sum", "simple"];
const COMMON_ENGLISH_WORDS = new Set(
  [
    "a",
    "an",
    "as",
    "at",
    "i",
    "in",
    "is",
    "it",
    "do",
    "has",
    "his",
    "me",
    "of",
    "on",
    "the",
    "this",
  ].concat(...EXTENDED_COMMON_ENGLISH_WORDS)
);

// To generate Latin works with inflections, run the raw words list through morpheus.
// That is, from the Morpheus directory:
// MORPHLIB=stemlib bin/cruncher -L -d < latin_words_raw.txt > latin_words_proc.txt

// Morpheus outputs in the following format:

//
// :raw a
//
// :workw a_
// :lem a
// :prvb
// :aug1
// :stem a_			indeclform
// :suff
// :end 			indeclform	exclam

interface MorpheusAnalysis {
  workw: string;
  lem: string;
  prvb?: string;
  stem: string;
  end: string;
}

interface LatinWordRow {
  word: string;
  lengthMarked: string;
  lemma: string;
  // lengthMarkedLemma: string;
  info: string;
  usageNote: string;
}

export interface LatinWordAnalysis {
  lemma: string;
  inflectedForms: {
    form: string;
    inflectionData: {
      inflection: string;
      usageNote?: string;
    }[];
  }[];
}

function getLineData(line: string, key: string): string | undefined {
  assertEqual(`:${key}`, line.substring(0, key.length + 1));
  // +2 because they are preceded by a colon and precede a space.
  const afterKey = line.trim().substring(key.length + 2);
  return afterKey.length === 0 ? undefined : afterKey;
}

function loadMorpheusOutput(
  rawPath: string = envVar("RAW_LATIN_WORDS"),
  obsoleteRowsRemoved: boolean = true
) {
  return processMorpheusRaw(readFileSync(rawPath, "utf8"), true);
}

function processMorpheusRaw(rawOutput: string, obsoleteRowsRemoved: boolean) {
  const dbLines = rawOutput.split("\n");
  const result = arrayMap<string, MorpheusAnalysis>();
  // Normally, the Morpheus output has 10 lines per raw input but
  // we remove two always empty lines to keep the total file size under
  // the GitHub limit.
  const linesPerEntry = obsoleteRowsRemoved ? 8 : 10;
  // Normally, the Morpheus output has these as the 7th and 9th
  // lines. But to get under the github file limit, some lines
  // were removed.
  const stemOffset = obsoleteRowsRemoved ? 6 : 7;
  const endOffset = obsoleteRowsRemoved ? 7 : 9;
  for (let i = 0; i < dbLines.length - 1; i += linesPerEntry) {
    assert(dbLines[i].trim().length === 0);
    assert(dbLines[i + 2].trim().length === 0);

    const raw = checkPresent(getLineData(dbLines[i + 1], "raw"));
    const analysis: MorpheusAnalysis = {
      workw: checkPresent(getLineData(dbLines[i + 3], "workw")),
      lem: checkPresent(getLineData(dbLines[i + 4], "lem")),
      prvb: getLineData(dbLines[i + 5], "prvb"),
      stem: checkPresent(getLineData(dbLines[i + stemOffset], "stem")),
      end: checkPresent(getLineData(dbLines[i + endOffset], "end")),
    };
    result.add(raw, analysis);
  }
  return result.map;
}

function removeInternalDashes(word: string): string {
  let result = "";
  for (let i = 0; i < word.length; i++) {
    if (i === 0 || i == word.length - 1 || word[i] !== "-") {
      result += word[i];
    }
  }
  return result;
}

// function getLengthMarksForLemma(
//   lemma: string,
//   inflections: Map<string, MorpheusAnalysis[]>
// ): string | undefined {
//   const lemmaBase = removeInternalDashes(lemma.split("#")[0]);
//   const rowsForBase = inflections.get(lemmaBase) || [];
//   const rowsForLemma = rowsForBase.filter((row) => row.lem === lemma);
//   const headwordRows = rowsForLemma.filter((row) =>
//     HEADWORD_INFLECTIONS.has(extractInflectionInfo(row))
//   );
//   if (headwordRows.length === 0 && rowsForLemma.length > 0) {
//     console.debug(
//       `${lemma}:\n${JSON.stringify(
//         rowsForLemma.map((row) => extractInflectionInfo(row)),
//         undefined,
//         2
//       )}`
//     );
//   }
//   return headwordRows[0]?.workw;
// }

function rowsFromMorpheusAnalysis(
  analyses: [string, MorpheusAnalysis[]][]
): LatinWordRow[] {
  return analyses.flatMap(([word, analyses]) =>
    analyses.map((analysis) => {
      const rowInfoChunks = analysis.end.split("\t");
      assert(rowInfoChunks.length === 5, analysis.end);

      return {
        word: word,
        lemma: analysis.lem,
        lengthMarked: displayTextForOrth(analysis.workw),
        // lengthMarkedLemma:
        //   getLengthMarksForLemma(analysis.lem, inflectionsDict) || word,
        info: rowInfoChunks[1].trim(),
        usageNote: rowInfoChunks[3].trim(),
      };
    })
  );
}

export function makeMorpheusDb(
  rawInput: string = envVar("RAW_LATIN_WORDS"),
  outputPath: string = envVar("LATIN_INFLECTION_DB")
) {
  const inflectionsDict = loadMorpheusOutput(rawInput);
  const rows: LatinWordRow[] = rowsFromMorpheusAnalysis(
    Array.from(inflectionsDict.entries())
  );
  ReadOnlyDb.saveToSql(
    DbConfig.of(outputPath, rows, ARRAY_INDEX, [["word"], ["lemma"]])
  );
}

let db: SqliteDb | undefined = undefined;
let wordsOnly: Set<string> | undefined = undefined;

export namespace LatinWords {
  function getDb(): SqliteDb {
    if (db === undefined) {
      db = ReadOnlyDb.getDatabase(envVar("LATIN_INFLECTION_DB"));
    }
    return db;
  }

  export function allWords(): Set<string> {
    if (wordsOnly === undefined) {
      const read = getDb().prepare("SELECT word FROM data");
      // @ts-ignore
      const words: { word: string }[] = read.all();
      wordsOnly = new Set<string>(words.map((word) => word.word));
    }
    return wordsOnly;
  }

  function processMorpheusRows(rows: LatinWordRow[]): LatinWordAnalysis[] {
    const byLemma = arrayMap<string, LatinWordRow>();
    for (const row of rows) {
      const undashed = removeInternalDashes(row.lemma);
      byLemma.add(undashed, row);
    }
    return Array.from(byLemma.map.entries()).map(([lemma, rows]) => {
      const byLengthMarked = new Map<string, Set<LatinWordRow>>();
      for (const row of rows) {
        if (!byLengthMarked.has(row.lengthMarked)) {
          byLengthMarked.set(row.lengthMarked, new Set<LatinWordRow>());
        }
        byLengthMarked.get(row.lengthMarked)!.add(row);
      }
      return {
        lemma,
        inflectedForms: Array.from(byLengthMarked.entries()).map(
          ([form, data]) => ({
            form,
            inflectionData: [...data.values()].map((row) => ({
              inflection: row.info,
              usageNote: row.usageNote.length === 0 ? undefined : row.usageNote,
            })),
          })
        ),
      };
    });
  }

  const ENCLITICS = ["que", "ve", "ne"];

  export function resolveLatinWord<T>(
    input: string,
    resolver: (input: string) => [boolean, T],
    checkedEnclitic = false
  ): [string, T] | undefined {
    if (input.length === 0) {
      return undefined;
    }
    let [match, result] = resolver(input);
    if (match) {
      return [input, result];
    }
    const lowerCase = input.toLowerCase();
    [match, result] = resolver(lowerCase);
    if (match) {
      return [lowerCase, result];
    }
    const initialUpper = lowerCase[0].toUpperCase() + lowerCase.slice(1);
    [match, result] = resolver(initialUpper);
    if (match) {
      return [initialUpper, result];
    }

    if (!checkedEnclitic) {
      for (const enclitic of ENCLITICS) {
        if (lowerCase.endsWith(enclitic)) {
          return resolveLatinWord(
            input.slice(0, -enclitic.length),
            resolver,
            true
          );
        }
      }
    }
    return undefined;
  }

  export function callMorpheus(term: string): LatinWordAnalysis[] {
    const output = execSync("bin/cruncher -Ld", {
      env: { MORPHLIB: "stemlib" },
      input: term,
      cwd: process.env.MORPHEUS_ROOT,
    });
    const analyses = processMorpheusRaw(output.toString("utf8"), false);
    const rows = rowsFromMorpheusAnalysis([...analyses.entries()]);
    return processMorpheusRows(rows);
  }

  export function analysesFor(term: string): LatinWordAnalysis[] {
    const result = resolveLatinWord(term, (w) => {
      const read = getDb().prepare("SELECT * FROM data WHERE word = ?");
      // @ts-ignore
      const rows: LatinWordRow[] = read.all(w);
      return [rows.length > 0, rows];
    });
    return result === undefined ? [] : processMorpheusRows(result[1]);
  }

  function linkifyLatinWords(input: string): XmlChild[] {
    const latinWords = allWords();
    const fragments = processWords(input, (word) => {
      if (COMMON_ENGLISH_WORDS.has(word)) {
        return word;
      }
      const noDiacritics = removeDiacritics(word);
      if (latinWords.has(noDiacritics)) {
        return new XmlNode("span", [
          ["class", "latWord"],
          ["to", word],
        ]);
      }
      const lowerCase = noDiacritics.toLowerCase();
      if (latinWords.has(lowerCase)) {
        return new XmlNode("span", [
          ["class", "latWord"],
          ["to", word.toLowerCase()],
          ["orig", word],
        ]);
      }
      return word;
    });
    // Combine strings that are immediately next to each other.
    const result: XmlChild[] = [];
    for (const fragment of fragments) {
      const topIndex = result.length - 1;
      const topChild = result[topIndex];
      if (typeof fragment !== "string" || typeof topChild !== "string") {
        result.push(fragment);
        continue;
      }
      result[topIndex] = topChild + fragment;
    }
    return result;
  }

  export function attachLatinLinks(root: XmlNode): XmlNode {
    const className = root.getAttr("class");
    if (
      className?.includes("lsHover") ||
      className?.includes("lsSenseBullet")
    ) {
      return root;
    }
    const linkified = root.children.flatMap((child) => {
      if (typeof child !== "string") {
        return attachLatinLinks(child);
      }
      return linkifyLatinWords(child);
    });
    return new XmlNode(root.name, root.attrs, linkified);
  }
}
