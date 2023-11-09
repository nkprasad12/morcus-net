import { Database } from "better-sqlite3";
import { readFileSync } from "fs";
import { assert, assertEqual, checkPresent } from "@/common/assert";
import { ARRAY_INDEX, ReadOnlyDb } from "@/common/sql_helper";
import { displayTextForOrth } from "@/common/lewis_and_short/ls_orths";

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
}

export interface LatinWordAnalysis {
  lemma: string;
  inflectedForms: {
    form: string;
    inflectionData: string[];
  }[];
}

function getLineData(line: string, key: string): string | undefined {
  assertEqual(`:${key}`, line.substring(0, key.length + 1));
  // +2 because they are preceded by a colon and precede a space.
  const afterKey = line.trim().substring(key.length + 2);
  return afterKey.length === 0 ? undefined : afterKey;
}

function loadMorpheusOutput(
  rawPath: string = checkPresent(process.env.RAW_LATIN_WORDS)
) {
  const dbLines = readFileSync(rawPath, "utf8").split("\n");
  const result = new Map<string, MorpheusAnalysis[]>();
  // Normally, the Morpheus output has 10 lines per raw input but
  // we remove two always empty lines to keep the total file size under
  // the GitHub limit.
  for (let i = 0; i < dbLines.length - 1; i += 8) {
    assert(dbLines[i].trim().length === 0);
    assert(dbLines[i + 2].trim().length === 0);
    // Normally, the Morpheus output has these as the 7th and 9th
    // lines. But to get under the github file limit, remove these
    // manually before processing.
    // assert(getLineData(dbLines[i + 6], "aug1") === undefined);
    // assert(getLineData(dbLines[i + 8], "suff") === undefined);

    const raw = checkPresent(getLineData(dbLines[i + 1], "raw"));
    const analysis: MorpheusAnalysis = {
      workw: checkPresent(getLineData(dbLines[i + 3], "workw")),
      lem: checkPresent(getLineData(dbLines[i + 4], "lem")),
      prvb: getLineData(dbLines[i + 5], "prvb"),
      stem: checkPresent(getLineData(dbLines[i + 6], "stem")),
      end: checkPresent(getLineData(dbLines[i + 7], "end")),
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

function extractInflectionInfo(analysis: MorpheusAnalysis): string {
  const rowInfoChunks = analysis.end.split("\t");
  assert(rowInfoChunks.length === 5, analysis.end);
  return rowInfoChunks[1].trim();
}

export function makeMorpheusDb(
  rawInput: string = checkPresent(process.env.RAW_LATIN_WORDS),
  outputPath: string = checkPresent(process.env.LATIN_INFLECTION_DB)
) {
  const inflectionsDict = loadMorpheusOutput(rawInput);
  const rows: LatinWordRow[] = Array.from(inflectionsDict.entries()).flatMap(
    ([word, analyses]) =>
      analyses.map((analysis) => ({
        word: word,
        lemma: analysis.lem,
        lengthMarked: displayTextForOrth(analysis.workw),
        // lengthMarkedLemma:
        //   getLengthMarksForLemma(analysis.lem, inflectionsDict) || word,
        info: extractInflectionInfo(analysis),
      }))
  );
  ReadOnlyDb.saveToSql(outputPath, rows, ARRAY_INDEX, [["word"], ["lemma"]]);
}

let db: Database | undefined = undefined;

export namespace LatinWords {
  export function analysesFor(term: string): LatinWordAnalysis[] {
    if (db === undefined) {
      db = ReadOnlyDb.getDatabase(
        checkPresent(process.env.LATIN_INFLECTION_DB)
      );
    }
    const read = db.prepare("SELECT * FROM data WHERE word = ?");
    // @ts-ignore
    const rows: LatinWordRow[] = read.all(term);

    const byLemma = new Map<string, LatinWordRow[]>();
    for (const row of rows) {
      const undashed = removeInternalDashes(row.lemma);
      if (!byLemma.has(undashed)) {
        byLemma.set(undashed, []);
      }
      byLemma.get(undashed)!.push(row);
    }
    return Array.from(byLemma.entries()).map(([lemma, rows]) => {
      const byLengthMarked = new Map<string, Set<string>>();
      for (const row of rows) {
        if (!byLengthMarked.has(row.lengthMarked)) {
          byLengthMarked.set(row.lengthMarked, new Set<string>());
        }
        byLengthMarked.get(row.lengthMarked)!.add(row.info);
      }
      return {
        lemma,
        inflectedForms: Array.from(byLengthMarked.entries()).map(
          ([form, data]) => ({ form, inflectionData: [...data.values()] })
        ),
      };
    });
  }
}
