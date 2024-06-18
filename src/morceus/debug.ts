// Central place collecting utitity for debugging or manual result inspection.

import { IndexMode, makeEndIndexAndSave } from "@/morceus/tables/indices";
import { expandTemplatesAndSave } from "@/morceus/tables/templates";
import { compareEndTables } from "@/scripts/compare_morceus_results";
import { compareEndIndices } from "@/scripts/compare_morceus_results";

export namespace Endings {
  export const createTables = expandTemplatesAndSave;
  export const compareTables = compareEndTables;

  export const createIndices = makeEndIndexAndSave;
  export const createIndicesForComparison = () => {
    makeEndIndexAndSave(IndexMode.NOUNS);
    makeEndIndexAndSave(IndexMode.VERBS);
  };

  export const compareIndices = compareEndIndices;
}

Endings.createIndicesForComparison();
Endings.compareIndices();
