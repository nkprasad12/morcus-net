import * as fs from "fs";

import { getRawPozoEntries } from "@/common/dictionaries/pozo/process_pozo";

interface ClassificationResult {
  wordType: "greek" | "latin" | "unclassifiable";
  score: number;
}

const POLYTONIC_CHAR_REGEX = /[\u1F00-\u1FFF]/;
const GREEK_REGEX_GLOBAL = /[\u0370-\u03FF\u1F00-\u1FFF]/g;
const LATIN_REGEX_GLOBAL = /[A-Za-z]/g;
const GREEK_REGEX_TEST = /[\u0370-\u03FF\u1F00-\u1FFF]/;
const LATIN_REGEX_TEST = /[A-Za-z]/;
const COMBINING_ACUTE_REGEX = /\u0301/;
const ALL_COMBINING_MARKS_REGEX = /[\u0300-\u036f]/g;

const WHITESPACE_REGEX = /^\s*$/;
const LEADING_PUNCT_REGEX = /^([\p{P}\p{S}]+)/u;
const TRAILING_PUNCT_REGEX = /([\p{P}\p{S}]+)$/u;

function classifyWord(wordToClassify: string): ClassificationResult {
  if (wordToClassify.length === 0) {
    return { wordType: "unclassifiable", score: 0 };
  }

  const normalizedWord = wordToClassify.normalize("NFD");

  const isPolytonicGreekDiacritic = POLYTONIC_CHAR_REGEX.test(normalizedWord);
  const hasCombiningAcute = COMBINING_ACUTE_REGEX.test(normalizedWord);
  // Spanish words can have acute accent for stress markers, so ignore those.
  if (isPolytonicGreekDiacritic && !hasCombiningAcute) {
    return { wordType: "greek", score: 1 };
  }

  const greekLetterCount = (normalizedWord.match(GREEK_REGEX_GLOBAL) || [])
    .length;
  const latinLetterCount = (normalizedWord.match(LATIN_REGEX_GLOBAL) || [])
    .length;

  const wordWithoutCombiningMarks = normalizedWord.replace(
    ALL_COMBINING_MARKS_REGEX,
    ""
  );
  if (
    wordWithoutCombiningMarks.length === 2 &&
    greekLetterCount === 1 &&
    latinLetterCount === 1
  ) {
    return { wordType: "unclassifiable", score: 0 };
  }

  const totalIdentifiedLetters = greekLetterCount + latinLetterCount;
  if (totalIdentifiedLetters === 0) {
    return { wordType: "unclassifiable", score: 0 };
  }

  const score = greekLetterCount / totalIdentifiedLetters;
  const type = score >= 0.5 ? "greek" : "latin";

  return { wordType: type, score: score };
}

/**
 * Applies character modifications to a word based on its classification (Greek/Latin) and score.
 * Modifies the word in NFD form and returns it in NFD form.
 * @param nfdWord The word to modify, in NFD Unicode normalization form.
 * @param wordType The classification type ('greek' or 'latin').
 * @param score The classification score.
 * @returns {string} The modified word, in NFD form.
 */
function applyCharacterModifications(
  nfdWord: string,
  wordType: ClassificationResult["wordType"],
  score: number
): string {
  if (wordType === "unclassifiable") {
    return nfdWord;
  }
  if (wordType === "latin") {
    return nfdWord.replace(/ν/g, "v");
  }
  // Handle the Greek case
  let modifiedNfdWord = nfdWord;
  modifiedNfdWord = modifiedNfdWord.replace(/a/g, "α").replace(/A/g, "Α");
  modifiedNfdWord = modifiedNfdWord.replace(/e/g, "ε").replace(/E/g, "Ε");
  modifiedNfdWord = modifiedNfdWord.replace(/i/g, "ι").replace(/I/g, "Ι");
  modifiedNfdWord = modifiedNfdWord.replace(/o/g, "ο").replace(/O/g, "Ο");
  modifiedNfdWord = modifiedNfdWord.replace(/u/g, "υ").replace(/U/g, "Υ");
  modifiedNfdWord = modifiedNfdWord.replace(/y/g, "υ").replace(/Y/g, "Υ");
  modifiedNfdWord = modifiedNfdWord.replace(/n/g, "ν");
  if (score >= 0.65) {
    modifiedNfdWord = modifiedNfdWord.replace(/v/g, "ν");
  }
  return modifiedNfdWord;
}

/**
 * Processes a single part (word or whitespace) of a text entry.
 * This includes stripping punctuation, classifying the core word, applying modifications,
 * and logging mixed words.
 * @param part The string part to process.
 * @returns {string} The processed part.
 */
export function processWordPart(part: string): string {
  if (WHITESPACE_REGEX.test(part)) {
    return part; // Keep whitespace parts as is
  }

  const currentWordOriginal = part;
  let leadingPunct = "";
  let trailingPunct = "";
  let coreWord = currentWordOriginal;

  // Strip leading punctuation
  const leadingMatch = coreWord.match(LEADING_PUNCT_REGEX);
  if (leadingMatch) {
    leadingPunct = leadingMatch[1];
    coreWord = coreWord.substring(leadingPunct.length);
  }

  // Strip trailing punctuation
  const trailingMatch = coreWord.match(TRAILING_PUNCT_REGEX);
  if (trailingMatch) {
    trailingPunct = trailingMatch[1];
    coreWord = coreWord.substring(0, coreWord.length - trailingPunct.length);
  }

  if (coreWord.length === 0) {
    return currentWordOriginal; // Part was only punctuation
  }

  const { wordType, score } = classifyWord(coreWord);
  const modifiedWord = applyCharacterModifications(
    coreWord.normalize("NFD"),
    wordType,
    score
  );
  const result = leadingPunct + modifiedWord.normalize("NFC") + trailingPunct;
  // Log if still mixed after all modifications
  const hasGreekFinal = GREEK_REGEX_TEST.test(modifiedWord);
  const hasLatinFinal = LATIN_REGEX_TEST.test(modifiedWord);

  if (wordType !== "unclassifiable" && hasGreekFinal && hasLatinFinal) {
    console.log(
      `Mixed word after processing: "${result}" (Original part: "${currentWordOriginal}", Classified core: "${coreWord}", Type: ${wordType}, Score: ${score.toFixed(
        2
      )})`
    );
  }

  return result;
}

// --- MAIN FUNCTION ---
/**
 * Processes raw text entries to fix mixed Greek/Latin words according to a set of rules.
 * Rules include: classifying words, converting characters (e.g., Latin 'o' to Greek 'ο'),
 * and handling specific accent cases. Writes the processed text to an output file.
 * Logs words that remain mixed after processing to the console.
 */
export function fixGreekWords(inputFilePath: string) {
  const rawEntries: string[][] = getRawPozoEntries(inputFilePath);
  const processedEntries: string[][] = [];

  for (const entry of rawEntries) {
    const processedTextsInEntry: string[] = [];
    for (const text of entry) {
      const parts = text.split(/(\s+)/); // Split by whitespace, keeping separators
      const processedParts = parts.map(processWordPart); // Use the new helper function
      processedTextsInEntry.push(processedParts.join(""));
    }
    processedEntries.push(processedTextsInEntry);
  }

  const outputFileContent = processedEntries
    .map((entry) => entry.join("\n"))
    .join("\n\n");
  const withLines = `\n${outputFileContent}\n`;

  try {
    fs.writeFileSync(inputFilePath, withLines, "utf8");
    console.log(`Processed entries written to ${inputFilePath}`);
  } catch (err) {
    console.error(`Error writing output file: ${err}`);
  }
}

// import { envVar } from "@/common/env_vars";
// fixGreekWords(envVar("POZO_RAW_PATH"));
