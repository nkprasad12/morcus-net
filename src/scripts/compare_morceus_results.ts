/* istanbul ignore file */

import { assert, assertEqual } from "@/common/assert";
import { envVar } from "@/common/env_vars";
import fs from "fs";

const MORPHEUS_ROOT = envVar("MORPHEUS_ROOT");
const MORCEUS_ROOT = "build/morceus";

const MORPHEUS_ENDTABLE_ROOT = `${MORPHEUS_ROOT}/stemlib/Latin/endtables/ascii`;
const MORCEUS_ENDTABLE_ROOT = `${MORCEUS_ROOT}/tables/lat`;

const MORPHEUS_END_INDICES_ROOT = `${MORPHEUS_ROOT}/stemlib/Latin/endtables/indices`;
const MORCEUS_INDICES_ROOT = `${MORCEUS_ROOT}/indices`;
const MORPHEUS_NOUN_INDEX = `${MORPHEUS_END_INDICES_ROOT}/nendind`;
const MORPHEUS_VERB_INDEX = `${MORPHEUS_END_INDICES_ROOT}/vbendind`;
const MORCEUS_NOUN_INDEX = `${MORCEUS_INDICES_ROOT}/nouns.endindex`;
const MORCEUS_VERB_INDEX = `${MORCEUS_INDICES_ROOT}/verbs.endindex`;

const MORPHEUS_IRREGS_ROOT = `${MORPHEUS_ROOT}/stemlib/Latin/stemsrc`;
const MORCEUS_IRREGS_ROOT = `${MORCEUS_ROOT}/irregs`;
const MORPHEUS_IRREG_NOMS = `${MORPHEUS_IRREGS_ROOT}/nom.irreg`;
const MORCEUS_IRREGS_NOMS = `${MORCEUS_IRREGS_ROOT}/noms2.irreg`;
const MORPHEUS_IRREG_VERBS = `${MORPHEUS_IRREGS_ROOT}/vbs.irreg`;
const MORCEUS_IRREGS_VERBS = `${MORCEUS_IRREGS_ROOT}/verbs2.irreg`;

const MORPHEUS_NOM_STEM_INDEX = `${MORPHEUS_ROOT}/stemlib/Latin/steminds/nomind`;
const MORCEUS_NOM_STEM_INDEX = `${MORCEUS_INDICES_ROOT}/noms.stemindex`;
const MORPHEUS_VERB_STEM_INDEX = `${MORPHEUS_ROOT}/stemlib/Latin/steminds/vbind`;
const MORCEUS_VERB_STEM_INDEX = `${MORCEUS_INDICES_ROOT}/verbs.stemindex`;

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
    .readdirSync(MORCEUS_ENDTABLE_ROOT)
    .map((table) => {
      assert(table.endsWith(".table"), table);
      return table.split(".table")[0];
    })
    .sort();
  const morpheusTables = fs
    .readdirSync(MORPHEUS_ENDTABLE_ROOT)
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

function lineDiffs(morceus: string, morpheus: string): string[] {
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
export function compareEndTables() {
  const allEndTableNames = endTableNames();
  let matches = 0;
  let errors = 0;
  for (const tableName of allEndTableNames) {
    const morpheusFile = `${MORPHEUS_ENDTABLE_ROOT}/${tableName}.asc`;
    const morceusFile = `${MORCEUS_ENDTABLE_ROOT}/${tableName}.table`;
    const morceusResult = normalizeEndTable(morceusFile, tableName);
    const morpheusResult = normalizeEndTable(morpheusFile, tableName);

    const diffs = lineDiffs(morceusResult, morpheusResult);
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

/** The normalized lines of an end index. */
function normalizedEndIndex(indexPath: string): string {
  const index = fs.readFileSync(indexPath).toString();
  return index
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .sort()
    .join("\n");
}

/**
 * Compares Morpheus and Morceus output after normalizing the indices
 * from each.
 *
 * There are currently no differences.
 */
function compareEndIndex(
  tag: string,
  morceusFile: string,
  morpheusFile: string
): number {
  const morpheus = normalizedEndIndex(morpheusFile);
  const morceus = normalizedEndIndex(morceusFile);
  const diffs = lineDiffs(morceus, morpheus);

  console.log(tag);
  console.log(diffs.join("\n"));
  console.log("===\n");
  return diffs.length;
}

export function compareEndIndices() {
  const nounErrors = compareEndIndex(
    "Nouns",
    MORCEUS_NOUN_INDEX,
    MORPHEUS_NOUN_INDEX
  );
  const verbsErrors = compareEndIndex(
    "Verbs",
    MORCEUS_VERB_INDEX,
    MORPHEUS_VERB_INDEX
  );
  console.log(`${nounErrors} noun lines have errors.`);
  console.log(`${verbsErrors} verb lines have errors.`);
}

function normalizeStemIndex(path: string, isMorceus: boolean): string[] {
  return fs
    .readFileSync(path)
    .toString()
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((line) => {
      const parts = line.split(" ");
      const entries = parts.slice(1).map((part) =>
        !isMorceus
          ? part.replaceAll(":irreg_nom3", "")
          : part
              .replaceAll(":irreg_nom3", "")
              // .replaceAll(":irreg_decl3", "")
              // .replaceAll(":irreg_comp", "")
              .replaceAll(":rel_pron", ":relative")
              .replaceAll(":irreg_adj2", ":irreg_adj1")
              .replaceAll(/:orth$/g, "")
              .replaceAll(":orth:", ":")
              .replaceAll(":pname", "")
              .replaceAll(":ethnic:", ":")
              .replaceAll(/:ethnic$/g, "")
              .replaceAll(":group:", ":")
              .replaceAll(/:group$/g, "")
              .replaceAll(":is_group", "")
              .replaceAll(":is_month", "")
              .replaceAll(":is_ethnic", "")
              .replaceAll(":is_festival", "")
              .replaceAll(":nom/acc/voc", ":nom/voc/acc")
              .replaceAll(":fem/masc", ":masc/fem")
              .replaceAll(":dat/abl", ":abl/dat")
      );
      const sortedEntries = [...new Set(entries)].sort();
      return [parts[0]].concat(sortedEntries).join(" ");
    });
}

export function compareStemIndex(mode: "noms" | "verbs") {
  const morceusFile =
    mode === "noms" ? MORCEUS_NOM_STEM_INDEX : MORCEUS_VERB_STEM_INDEX;
  const morpheusFile =
    mode === "noms" ? MORPHEUS_NOM_STEM_INDEX : MORPHEUS_VERB_STEM_INDEX;
  const morceus = normalizeStemIndex(morceusFile, true);
  const morpheus = normalizeStemIndex(morpheusFile, false);
  const morceusOnly = new Set<string>();
  const morpheusOnly = new Set<string>(morpheus);
  for (const morceusLine of morceus) {
    const inMorpheus = morpheusOnly.delete(morceusLine);
    if (!inMorpheus) {
      morceusOnly.add(morceusLine);
    }
  }
  console.log(`Morceus Entries: ${morceus.length}`);
  console.log(`Morpheus Entries: ${morpheus.length}`);
  console.log(`Morceus Only: ${morceusOnly.size}`);
  console.log(`Morpheus Only: ${morpheusOnly.size}`);
  fs.writeFileSync(`${mode}.morc_only.comp`, [...morceusOnly].join("\n"));
  fs.writeFileSync(`${mode}.morph_only.comp`, [...morpheusOnly].join("\n"));
  fs.writeFileSync(`${mode}.morc.stemindex.comp`, morceus.join("\n"));
  fs.writeFileSync(`${mode}.morph.stemindex.comp`, morpheus.join("\n"));
}

function irregLemmata(fileName: string): string[] {
  const lemmata = fs
    .readFileSync(fileName)
    .toString()
    .split("\n:le:")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => normalizeIrregLemma(":le:" + entry));
  return lemmata;
}

function normalizeIrregLemma(lemma: string): string {
  return lemma
    .replaceAll("masc fem neut", "masc/fem/neut")
    .replaceAll("neut masc fem", "masc/fem/neut")
    .replaceAll("masc neut", "masc/neut")
    .replaceAll("masc fem", "masc/fem")
    .replaceAll("fem neut", "fem/neut")
    .replaceAll("nom voc acc", "nom/voc/acc")
    .replaceAll("nom acc voc", "nom/acc/voc")
    .replaceAll("nom acc", "nom/acc")
    .replaceAll("nom voc", "nom/voc")
    .replaceAll("voc nom", "nom/voc")
    .replaceAll("dat abl", "dat/abl")
    .replaceAll("abl dat", "abl/dat")
    .replaceAll("abl/dat", "dat/abl")
    .split("\n")
    .filter((x) => x.length > 0)
    .map((line) => {
      const words = line
        .split(/\s/)
        .filter((word) => word.length > 0)
        .map((word) => word.replaceAll("-", ""));
      return `${words[0]} ${words.slice(1).sort().join(" ")}`;
    })
    .sort()
    .join("\n");
}

export function compareIrregStems(mode: "noms" | "verbs") {
  const morceusFile =
    mode === "noms" ? MORCEUS_IRREGS_NOMS : MORCEUS_IRREGS_VERBS;
  const morpheusFile =
    mode === "verbs" ? MORPHEUS_IRREG_VERBS : MORPHEUS_IRREG_NOMS;
  const morceusRaw = irregLemmata(morceusFile);
  const morpheusRaw = irregLemmata(morpheusFile);
  let differences = 0;
  for (let i = 0; i < morceusRaw.length; i++) {
    if (morceusRaw[i] !== morpheusRaw[i]) {
      differences++;
      console.log(morceusRaw[i]);
      console.log(morpheusRaw[i]);
    }
  }
  console.log(morceusRaw.length);
  console.log(morpheusRaw.length);
  console.log(differences);
  fs.writeFileSync("morc.comp", morceusRaw.join("\n\n"));
  fs.writeFileSync("morph.comp", morpheusRaw.join("\n\n"));
}
