import { readFileSync } from "fs";
import { assert, assertEqual, checkPresent, envVar } from "@/common/assert";
import { ARRAY_INDEX, ReadOnlyDb } from "@/common/sql_helper";
import { displayTextForOrth } from "@/common/lewis_and_short/ls_orths";
import { execSync } from "child_process";
import { SqliteDb } from "@/common/sqlite/sql_db";

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
  const result = new Map<string, MorpheusAnalysis[]>();
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
    if (!result.has(raw)) {
      result.set(raw, []);
    }
    result.get(raw)!.push(analysis);
  }
  return result;
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
  ReadOnlyDb.saveToSql(outputPath, rows, ARRAY_INDEX, [["word"], ["lemma"]]);
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
    const byLemma = new Map<string, LatinWordRow[]>();
    for (const row of rows) {
      const undashed = removeInternalDashes(row.lemma);
      if (!byLemma.has(undashed)) {
        byLemma.set(undashed, []);
      }
      byLemma.get(undashed)!.push(row);
    }
    return Array.from(byLemma.entries()).map(([lemma, rows]) => {
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
    const read = getDb().prepare("SELECT * FROM data WHERE word = ?");
    // @ts-ignore
    const rows: LatinWordRow[] = read.all(term);
    return processMorpheusRows(rows);
  }
}
