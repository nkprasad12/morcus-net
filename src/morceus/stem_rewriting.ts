import fs from "fs";

import { assert, checkPresent } from "@/common/assert";
import { arrayMap } from "@/common/data_structures/collect_map";
import {
  regularStems,
  type Lemma,
  type ParseLemmaFileOptions,
} from "@/morceus/stem_parsing";
import { InflectionContext } from "@/morceus/inflection_data_utils";

const PARSE_OPTIONS: ParseLemmaFileOptions = { collectSourceData: true };

function allRegularStems(nomFiles?: string[], verbFiles?: string[]): Lemma[] {
  return regularStems("nom", nomFiles, PARSE_OPTIONS).concat(
    regularStems("vbs", verbFiles, PARSE_OPTIONS)
  );
}

function remapRawLines(updated: Lemma, rawLines: string[]): string[] {
  const isContent = rawLines.map((l) => l.trim().startsWith(":"));
  let i = 0;
  while (i < isContent.length && !isContent[i]) {
    i++;
  }
  assert(i < isContent.length, "No content lines found");
  let j = isContent.length - 1;
  while (j >= 0 && !isContent[j]) {
    j--;
  }
  assert(j >= 0, "No content lines found");

  const coreLines = rawLines.slice(i, j + 1);
  const resultLines = coreLines.filter(
    (line) => !line.startsWith(":") && line.trim() !== ""
  );
  resultLines.push(`:le:${updated.lemma}`);
  for (const stem of updated.stems ?? []) {
    let base = `:${stem.code}:${stem.stem} ${stem.inflection}`;
    const inflectionData = InflectionContext.toString(stem);
    if (inflectionData.length > 0) {
      base += ` ${inflectionData}`;
    }
    resultLines.push(base);
  }
  for (const form of updated.irregularForms ?? []) {
    let base = `:${form.code}:${form.form}`;
    const inflectionData = InflectionContext.toString(form);
    if (inflectionData.length > 0) {
      base += ` ${inflectionData}`;
    }
    resultLines.push(base);
  }
  return rawLines
    .slice(0, i)
    .concat(resultLines)
    .concat(rawLines.slice(j + 1));
}

export function rewriteRegularLemmata(
  updater: (lemma: Readonly<Lemma>) => Lemma | undefined,
  nomFiles?: string[],
  verbFiles?: string[]
): void {
  const byFile = arrayMap<string, Lemma>();
  for (const lemma of allRegularStems(nomFiles, verbFiles)) {
    const sourceData = checkPresent(lemma.sourceData);
    const updated = updater(lemma);
    if (updated === undefined) {
      byFile.add(sourceData.fileName, lemma);
      continue;
    }
    const remappedRawLines = remapRawLines(updated, sourceData.rawLines);
    updated.sourceData = { ...sourceData, rawLines: remappedRawLines };
    byFile.add(updated.sourceData.fileName, updated);
  }

  for (const [file, lemmata] of byFile.map) {
    const content = Array.from(lemmata)
      .sort(
        (a, b) =>
          checkPresent(a.sourceData?.index) - checkPresent(b.sourceData?.index)
      )
      .map((lemma) => checkPresent(lemma.sourceData?.rawLines).join("\n"))
      .join("\n");
    console.debug("Writing to", file);
    fs.writeFileSync(file, content);
  }
}

// rewriteRegularLemmata((lemma) => {
//   const copy: Lemma = { lemma: lemma.lemma, isVerb: lemma.isVerb };
//   let hasUpdate = false;
//   if (lemma.stems !== undefined) {
//     copy.stems = [];
//     for (const stem of lemma.stems) {
//       const mapped = stem.stem.replaceAll(/([^_\\^])(n-?[fs])/g, "$1_$2");
//       if (mapped !== stem.stem) {
//         hasUpdate = true;
//       }
//       copy.stems.push({ ...stem, stem: mapped });
//     }
//   }
//   if (lemma.irregularForms !== undefined) {
//     copy.irregularForms = [];
//     for (const stem of lemma.irregularForms) {
//       const mapped = stem.form.replaceAll(/([^_\\^])(n-?[fs])/g, "$1_$2");
//       if (mapped !== stem.form) {
//         hasUpdate = true;
//       }
//       copy.irregularForms.push({ ...stem, form: mapped });
//     }
//   }
//   return hasUpdate ? copy : undefined;
// });
