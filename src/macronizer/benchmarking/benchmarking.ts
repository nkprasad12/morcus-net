/* istanbul ignore file */

import fs from "fs";
import path from "path";

import { processWords, removeDiacritics } from "@/common/text_cleaning";
import { macronizeInput } from "@/macronizer/morcronizer";

const GOLDENS_DIR = "src/macronizer/benchmarking/macronized_goldens";
const ALATIUS_GOLDENS_DIR = "src/macronizer/benchmarking/alatius_goldens";

const ALLOWED_ALTERNATES = new Map<string, string[]>([
  ["sibi", ["sibī"]],
  ["cūius", ["cuius"]],
  ["āc", ["ac"]],
]);

type Macronizer = [string, (input: string) => Promise<string>];

interface MacronizerDetailedResult {
  inputId: number;
  accuracy: number;
  correct: number;
  incorrect: number;
  total: number;
  incorrectWords: Array<{ expected: string; actual: string }>;
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
  input: string
): Promise<string | undefined> {
  try {
    const result = await macronizer[1](input);
    return result;
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
  macronizedInputs: string[],
  macronizers: Macronizer[]
): Promise<MacronizerResult[]> {
  const plainInputs = macronizedInputs.map((text) => removeDiacritics(text));

  const referenceWordSets = macronizedInputs.map((text) => {
    const words: string[] = [];
    processWords(text.normalize("NFC"), (word) => {
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
      const macronizedResult = await safeRunMacronizer(
        macronizer,
        plainInputs[j]
      );
      if (macronizedResult === undefined) {
        macronizerResult.details!.push({
          inputId: j,
          accuracy: 0,
          correct: 0,
          incorrect: 0,
          total: 0,
          incorrectWords: [],
        });
        continue;
      }

      const resultWords: string[] = [];
      processWords(macronizedResult.normalize("NFC"), (word) => {
        resultWords.push(word);
        return word;
      });

      const referenceWords = referenceWordSets[j];
      const detailResult: MacronizerDetailedResult = {
        inputId: j,
        accuracy: 0,
        correct: 0,
        incorrect: 0,
        total: Math.max(referenceWords.length, resultWords.length),
        incorrectWords: [],
      };

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

function getGoldens(): string[] {
  return fs
    .readdirSync(GOLDENS_DIR)
    .filter((file) => file.endsWith(".txt"))
    .map((file) => fs.readFileSync(path.join(GOLDENS_DIR, file), "utf8"));
}

const NoOpMacronizer: Macronizer = ["NoOp", async (input: string) => input];

const Alatius: Macronizer = [
  "Alatius",
  async (input: string) => {
    return fs.readFileSync(
      path.join(ALATIUS_GOLDENS_DIR, "dcc_dbg.txt"),
      "utf8"
    );
  },
];

const Morcronizer: Macronizer = [
  "Morcronizer",
  async (input: string) =>
    macronizeInput(input).then((result) =>
      result
        .map((t) => {
          if (typeof t === "string") {
            return t;
          }
          if (t.options.length === 0) {
            return t.word;
          }
          return t.options[t.suggested ?? 0].form;
        })
        .join("")
    ),
];

compareResults(getGoldens(), [NoOpMacronizer, Morcronizer, Alatius]).then(
  (results) => {
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
        console.log("Accuracy:", detail.accuracy);
        console.log("Correct:", detail.correct);
        console.log("Incorrect:", detail.incorrect);
        console.log("Total:", detail.total);
        console.log("");
        for (const incorrect of detail.incorrectWords) {
          console.log(incorrect.expected, "->", incorrect.actual);
        }
      }
    }
  }
);
