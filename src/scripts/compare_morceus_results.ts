/* istanbul ignore file */

import { assert, assertEqual } from "@/common/assert";
import fs from "fs";

const MORPHEUS_ROOT =
  "/home/nitin/Documents/code/morcus/morpheus/stemlib/Latin/endtables/ascii";
const MORCEUS_ROOT =
  "/home/nitin/Documents/code/morcus/morcus-net/build/morceus/tables/lat";

/**
 * Returns the normalized value of an end table.
 *
 * @param tablePath The path on disk of the table file.
 * @param tableName The name of the table (e.g. `decl1`).
 *
 * @returns The normalized value of the table. Does not modify the original file.
 */
function normalizeEndTable(tablePath: string, tableName: string): string {
  const table = fs.readFileSync(tablePath).toString();
  // Morpheus inconsistently has these sometimes separated by / and
  // sometimes by spaces, so normalize these. Then, alphabetize all the
  // grammatical data once it has been normalized. Finally, sort the
  // rows once they have been normalized.
  return table
    .replaceAll("masc fem neut", "masc/fem/neut")
    .replaceAll("neut masc fem", "masc/fem/neut")
    .replaceAll("masc neut", "masc/neut")
    .replaceAll("masc fem", "masc/fem")
    .replaceAll("nom voc acc", "nom/voc/acc")
    .replaceAll("nom acc voc", "nom/voc/acc")
    .replaceAll("nom acc", "nom/acc")
    .replaceAll("nom voc", "nom/voc")
    .replaceAll("voc nom", "nom/voc")
    .split("\n")
    .filter((x) => x.length > 0)
    .map((line) => {
      const parts = line.split(` ${tableName} `);
      assertEqual(parts.length, 2);
      const grammarData = parts[1].split(" ").sort();
      return `${parts[0]} ${tableName} ${grammarData.join(" ")}`;
    })
    .sort()
    .join("\n");
}

function endTableNames() {
  const morceusTables = fs
    .readdirSync(MORCEUS_ROOT)
    .map((table) => {
      assert(table.endsWith(".table"), table);
      return table.split(".table")[0];
    })
    .sort();
  const morpheusTables = fs
    .readdirSync(MORPHEUS_ROOT)
    .filter((fileName) => fileName !== ".cvsignore")
    .map((table) => {
      assert(table.endsWith(".asc"), table);
      return table.split(".asc")[0];
    })
    .sort();
  assertEqual(morceusTables.length, morpheusTables.length);
  for (let i = 0; i < morceusTables.length; i++) {
    assertEqual(morceusTables[i], morpheusTables[i]);
  }
  return morceusTables;
}

function tableDiffs(morceus: string, morpheus: string): string[] {
  const linesMorc = morceus.split("\n");
  const linesMorph = morpheus.split("\n");
  const results: string[] = [];
  for (let i = 0; i < Math.max(linesMorc.length, linesMorph.length); i++) {
    const morcLine = linesMorc[i];
    const morphLine = linesMorph[i];
    if (morcLine === morphLine) {
      continue;
    }
    results.push(` Morceus: '${morcLine}'\nMorpheus: '${morphLine}'\n`);
  }
  return results;
}

/**
 * Compares Morpheus and Morceus output after normalizing the tables
 * from each.
 *
 * There are currently only three differences in the normalized output:
 * - In `conj3`: Morpheus omits `old` on one of the lines even though it
 *   is present in the table definition.
 * - In `ex_icis_adj`: Morpheus has a typo of `able` instead of `abl`.
 * - In `tas_tatis`: This is just whitespace difference.
 */
function compareEndTables() {
  const allEndTableNames = endTableNames();
  let matches = 0;
  let errors = 0;
  for (const tableName of allEndTableNames) {
    const morpheusFile = `${MORPHEUS_ROOT}/${tableName}.asc`;
    const morceusFile = `${MORCEUS_ROOT}/${tableName}.table`;
    const morceusResult = normalizeEndTable(morceusFile, tableName);
    const morpheusResult = normalizeEndTable(morpheusFile, tableName);

    const diffs = tableDiffs(morceusResult, morpheusResult);
    if (diffs.length === 0) {
      matches++;
      continue;
    }

    console.log(tableName);
    errors += diffs.length;
    console.log(diffs.join("\n"));
    console.log("===\n");
  }
  console.log(`${matches} / ${allEndTableNames.length} tables match.`);
  console.log(`${errors} lines have errors.`);
}

compareEndTables();
