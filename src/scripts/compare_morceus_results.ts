/* istanbul ignore file */

import fs from "fs";

const MORPHEUS_ROOT =
  "/home/nitin/Documents/code/morcus/morpheus/stemlib/Latin/endtables/ascii";
const MORCEUS_ROOT =
  "/home/nitin/Documents/code/morcus/morcus-net/build/morceus/tables/lat";

function printSorted(filePath: string) {
  const lines = fs
    .readFileSync(filePath)
    .toString()
    .split("\n")
    .filter((x) => x.length > 0);
  lines.sort();
  return lines.join("\n");
}

function compareResults(tableName: string) {
  const oldResult = `${MORPHEUS_ROOT}/${tableName}.asc`;
  const newResult = `${MORCEUS_ROOT}/${tableName}.table`;
  fs.writeFileSync(`${tableName}.sorted.morpheus`, printSorted(oldResult));
  fs.writeFileSync(`${tableName}.sorted.morceus`, printSorted(newResult));
}

compareResults("conj2");
