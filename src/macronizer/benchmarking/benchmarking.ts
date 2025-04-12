/* istanbul ignore file */

import fs from "fs";
import path from "path";

import { processWords, removeDiacritics } from "@/common/text_cleaning";
import { macronizeInput } from "@/macronizer/morcronizer";
import type { MacronizedResult } from "@/web/api_routes";

const GOLDENS_DIR = "src/macronizer/benchmarking/macronized_goldens";
const ALATIUS_GOLDENS_DIR = "src/macronizer/benchmarking/alatius_goldens";

const ALLOWED_ALTERNATES = new Map<string, string[]>([
  ["sibi", ["sibī"]],
  ["cūius", ["cuius"]],
  ["āc", ["ac"]],
  ["ēius", ["eius"]],
  ["ubi", ["ubī"]],
  ["Ubi", ["Ubī"]],
  ["ibi", ["ibī"]],
  ["Ibi", ["Ibī"]],
]);

interface MacronizerOutput {
  text: string;
  raw?: MacronizedResult;
}

type Macronizer = [
  string,
  (input: [string, string]) => Promise<MacronizerOutput>
];

interface MacronizerDetailedResult {
  inputId: string;
  accuracy: number;
  correct: number;
  incorrect: number;
  total: number;
  incorrectWords: Array<{ expected: string; actual: string; extras?: object }>;
  runtimeMs?: number;
}

interface MacronizerResult {
  macronizerId: string;
  accuracy: number;
  correct: number;
  incorrect: number;
  total: number;
  details?: MacronizerDetailedResult[];
}

async function safeRunMacronizer(
  macronizer: Macronizer,
  input: [string, string]
): Promise<MacronizerOutput | undefined> {
  try {
    return await macronizer[1](input);
  } catch (error) {
    console.error(`Error running macronizer:`, error);
    return undefined;
  }
}

/**
 * Compares the accuracy of macronizers against reference texts
 * @param macronizedInputs Array of correctly macronized texts (reference)
 * @param macronizers Array of macronizer functions to evaluate
 * @returns Array of results with accuracy statistics for each macronizer
 */
export async function compareResults(
  macronizedInputs: [string, string][],
  macronizers: Macronizer[]
): Promise<MacronizerResult[]> {
  const plainInputs = macronizedInputs.map((text) => removeDiacritics(text[1]));

  const referenceWordSets = macronizedInputs.map((text) => {
    const words: string[] = [];
    processWords(text[1].normalize("NFC"), (word) => {
      words.push(word);
      return word;
    });
    return words;
  });

  const results: MacronizerResult[] = [];

  for (let i = 0; i < macronizers.length; i++) {
    const macronizer = macronizers[i];
    const macronizerResult: MacronizerResult = {
      macronizerId: macronizer[0],
      accuracy: 0,
      correct: 0,
      incorrect: 0,
      total: 0,
      details: [],
    };

    for (let j = 0; j < plainInputs.length; j++) {
      const start = performance.now();
      const macronizedResult = await safeRunMacronizer(macronizer, [
        macronizedInputs[j][0],
        plainInputs[j],
      ]);
      if (macronizedResult === undefined) {
        macronizerResult.details!.push({
          inputId: macronizedInputs[j][0],
          accuracy: 0,
          correct: 0,
          incorrect: 0,
          total: 0,
          incorrectWords: [],
        });
        continue;
      }

      const runtimeMs = performance.now() - start;
      const resultWords: string[] = [];
      processWords(macronizedResult.text.normalize("NFC"), (word) => {
        resultWords.push(word);
        return word;
      });

      const referenceWords = referenceWordSets[j];
      const detailResult: MacronizerDetailedResult = {
        inputId: macronizedInputs[j][0],
        accuracy: 0,
        correct: 0,
        incorrect: 0,
        total: Math.max(referenceWords.length, resultWords.length),
        incorrectWords: [],
        runtimeMs,
      };

      const rawWords = macronizedResult.raw?.filter(
        (w) => typeof w !== "string"
      );
      const minLength = Math.min(referenceWords.length, resultWords.length);
      for (let k = 0; k < minLength; k++) {
        if (
          referenceWords[k] === resultWords[k] ||
          ALLOWED_ALTERNATES.get(referenceWords[k])?.includes(resultWords[k])
        ) {
          detailResult.correct++;
        } else {
          detailResult.incorrect++;
          detailResult.incorrectWords.push({
            expected: referenceWords[k],
            actual: resultWords[k],
          });
          const extraInfo = rawWords?.[k];
          if (extraInfo) {
            detailResult.incorrectWords[
              detailResult.incorrectWords.length - 1
            ].extras = extraInfo;
          }
        }
      }

      // Count remaining unmatched words as incorrect
      detailResult.incorrect += Math.abs(
        referenceWords.length - resultWords.length
      );

      detailResult.accuracy =
        detailResult.total > 0 ? detailResult.correct / detailResult.total : 1;

      macronizerResult.correct += detailResult.correct;
      macronizerResult.incorrect += detailResult.incorrect;
      macronizerResult.total += detailResult.total;
      macronizerResult.details!.push(detailResult);
    }

    macronizerResult.accuracy =
      macronizerResult.total > 0
        ? macronizerResult.correct / macronizerResult.total
        : 0;

    results.push(macronizerResult);
  }

  return results;
}

function getGoldens(): [string, string][] {
  return fs
    .readdirSync(GOLDENS_DIR)
    .filter((file) => file.endsWith(".txt"))
    .map((file) => [
      file,
      fs.readFileSync(path.join(GOLDENS_DIR, file), "utf8"),
    ]);
}

const Alatius: Macronizer = [
  "Alatius",
  async (input) => {
    return {
      text: fs.readFileSync(path.join(ALATIUS_GOLDENS_DIR, input[0]), "utf8"),
    };
  },
];

const MorcronizerStanza: Macronizer = [
  "MorcronizerStanza",
  async (input) => {
    const macronized = await macronizeInput(input[1], true);
    return {
      text: macronized
        .map((w) =>
          typeof w === "string"
            ? w
            : w.options.length === 0
            ? w.word
            : w.options[w.suggested ?? 0].form
        )
        .join(""),
      raw: macronized,
    };
  },
];

const MorcronizerLatinCy: Macronizer = [
  "MorcronizerLatinCy",
  async (input) => {
    const macronized = await macronizeInput(input[1], false);
    return {
      text: macronized
        .map((w) =>
          typeof w === "string"
            ? w
            : w.options.length === 0
            ? w.word
            : w.options[w.suggested ?? 0].form
        )
        .join(""),
      raw: macronized,
    };
  },
];

compareResults(getGoldens(), [
  MorcronizerStanza,
  MorcronizerLatinCy,
  Alatius,
]).then((results) => {
  for (const result of results) {
    console.log("\n\n=====================");
    console.log("Macronizer ID:", result.macronizerId);
    console.log("Accuracy:", result.accuracy);
    console.log("Correct:", result.correct);
    console.log("Incorrect:", result.incorrect);
    console.log("Total:", result.total);
    if (result.macronizerId === "NoOp") {
      continue;
    }
    for (const detail of result.details ?? []) {
      console.log("\nInput ID:", detail.inputId);
      console.log("Runtime:", detail.runtimeMs);
      console.log("Accuracy:", detail.accuracy);
      console.log("Correct:", detail.correct);
      console.log("Incorrect:", detail.incorrect);
      console.log("Total:", detail.total);
      const outputName = `output_${result.macronizerId}_${detail.inputId}.txt`;
      fs.writeFileSync(
        outputName,
        detail.incorrectWords
          .map((iw) => `${iw.expected} -> ${iw.actual}`)
          .join("\n")
      );
      console.log("Wrote to ", outputName);
    }
  }
});
