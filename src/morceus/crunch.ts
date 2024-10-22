import { assert, checkPresent } from "@/common/assert";
import {
  combineLengthCombiners,
  stripCombiners,
  Vowels,
} from "@/common/character_utils";
import { arrayMap } from "@/common/data_structures/collect_map";
import {
  CruncherTables,
  CrunchResult,
  CruncherOptions,
  Cruncher,
  LatinWordAnalysis,
  StemMapValue,
} from "@/morceus/cruncher_types";
import {
  compareField,
  compareGrammaticalData,
  InflectionContext,
  subsetOf,
} from "@/morceus/inflection_data_utils";
import { type StemCode } from "@/morceus/stem_parsing";
import { expandSingleEnding } from "@/morceus/tables/template_utils_no_fs";
import {
  LatinCase,
  LatinDegree,
  LatinGender,
  LatinMood,
  LatinTense,
  type WordInflectionData,
} from "@/morceus/types";

const ENCLITICS = ["que", "ne", "ve"];

function hasIndeclinableCode(input: { code?: StemCode }): boolean {
  return input?.code === "vb" || input?.code === "wd";
}

function crunchOptionsForEnd(
  rawEnd: string,
  tables: CruncherTables,
  candidates: StemMapValue[]
): CrunchResult[] {
  const observedEnd = rawEnd || "*";
  const results: CrunchResult[] = [];
  const possibleEnds = tables.endsMap.get(observedEnd);
  for (const [candidate, lemma, isVerb] of candidates) {
    const indeclinableCode = hasIndeclinableCode(candidate);
    if ("form" in candidate) {
      assert(indeclinableCode || candidate.code === undefined);
      // If it's indeclinable, then we skip if it the expected ending is not empty
      // (since there's no inflected ending to bridge the gap). Otherwise, since it
      // is not inflected, we don't need to do any further compatibility checks
      // like we do between stems and endings.
      if (observedEnd === "*") {
        results.push({ lemma, isVerb, ...candidate });
      }
      continue;
    }
    assert(!indeclinableCode || candidate.code === undefined);
    // Check to make sure there's a template that could have a match.
    if (!possibleEnds?.includes(candidate.inflection)) {
      continue;
    }
    const possibleEndInflections = checkPresent(
      tables.inflectionLookup.get(candidate.inflection)?.get(observedEnd)
    );
    for (const end of possibleEndInflections) {
      // If there's no inflection code,
      // this means the entire table is intended to be expanded there. Otherwise,
      // check to see whether the ending and stem are actually valid.
      const mergedData =
        candidate.code === undefined
          ? expandSingleEnding(candidate.stem, candidate, end)
          : mergeIfCompatible(candidate, end);
      if (mergedData !== null) {
        results.push({
          lemma,
          form: candidate.stem + end.ending,
          stem: candidate,
          end,
          isVerb,
          ...mergedData,
        });
      }
    }
  }
  return results;
}

function crunchExactMatch(
  word: string,
  tables: CruncherTables,
  options?: CruncherOptions
): CrunchResult[] {
  const results: CrunchResult[] = [];
  for (let i = 0; i <= word.length; i++) {
    const maybeStem = word.slice(0, i);
    const candidates = tables.stemMap.get(maybeStem);
    if (candidates === undefined) {
      continue;
    }
    const fullEnd = word.slice(i);
    results.push(...crunchOptionsForEnd(fullEnd, tables, candidates));
    if (options?.handleEnclitics === true) {
      for (const enclitic of ENCLITICS) {
        if (!fullEnd.endsWith(enclitic)) {
          continue;
        }
        const partialEnd = fullEnd.slice(0, -enclitic.length);
        results.push(
          ...crunchOptionsForEnd(partialEnd, tables, candidates).map((r) => ({
            ...r,
            enclitic: fullEnd.slice(-enclitic.length),
          }))
        );
      }
    }
  }
  return results;
}

function fieldAsArray<T>(input: T | T[] | undefined): T[] {
  return Array.isArray(input) ? input : input === undefined ? [] : [input];
}

function consolidateByCategory<T extends keyof WordInflectionData>(
  cluster: CrunchResult[],
  category: T,
  consolidable: WordInflectionData[T][]
): CrunchResult[] {
  const unmerged: CrunchResult[] = [];
  const mergeGroups: CrunchResult[] = [];
  for (const item of cluster) {
    const itemField = item.grammaticalData[category];
    // @ts-expect-error
    const k = compareField(itemField, consolidable);
    // Only consider those that have a subset.
    const isCandidate = k === -1 || k === 0;
    if (!isCandidate) {
      unmerged.push(item);
      continue;
    }
    let consumed = false;
    for (const leader of mergeGroups) {
      const currData = { ...item.grammaticalData };
      currData[category] = undefined;
      const leaderData = { ...leader.grammaticalData };
      leaderData[category] = undefined;
      if (compareGrammaticalData(currData, leaderData) === 0) {
        // @ts-expect-error
        leaderData[category] = [
          // @ts-expect-error
          ...fieldAsArray(leader.grammaticalData[category]),
          // @ts-expect-error
          ...fieldAsArray(item.grammaticalData[category]),
        ];
        leader.grammaticalData = leaderData;
        consumed = true;
        break;
      }
    }
    if (!consumed) {
      mergeGroups.push(item);
    }
  }
  return unmerged.concat(mergeGroups);
}

/** Consolidates cruncher results to reduce duplication. */
export function consolidateResultCluster(
  cluster: CrunchResult[]
): CrunchResult[] {
  let original = cluster.slice();
  // Merge results that are strict subsets of other results.
  while (true) {
    const consolidated: CrunchResult[] = [];
    for (const result of original) {
      let consumed = false;
      for (let i = 0; i < consolidated.length; i++) {
        const comparison = compareGrammaticalData(
          result.grammaticalData,
          consolidated[i].grammaticalData
        );
        if (comparison === undefined) {
          continue;
        }
        consumed = true;
        if (comparison === 1) {
          consolidated[i] = result;
        }
      }
      if (!consumed) {
        consolidated.push(result);
      }
    }
    const didConsolidate = original.length !== consolidated.length;
    original = consolidated;
    if (!didConsolidate) {
      break;
    }
  }
  original = consolidateByCategory(original, "case", [
    LatinCase.Ablative,
    LatinCase.Dative,
  ]);
  return consolidateByCategory(original, "gender", [
    LatinGender.Feminine,
    LatinGender.Masculine,
    LatinGender.Neuter,
  ]);
}

function consolidateCrunchResults(rawResults: CrunchResult[]): CrunchResult[] {
  // Split up by (lemma, form, tags), then consolidate within each cluster.
  const byCluster = arrayMap<string, CrunchResult>();
  for (const result of rawResults) {
    const tags = (result.tags || []).map((tag) => tag.toLowerCase().trim());
    const key = [result.lemma, result.form, tags.sort().join("@")];
    byCluster.add(key.join("$"), result);
  }
  return Array.from(byCluster.map.values()).flatMap(consolidateResultCluster);
}

/**
 *
 * @param word An input word. This must not have any combining characters.
 * @param tables
 * @param relaxCase
 * @returns
 */
export function crunchAndMaybeRelaxCase(
  word: string,
  tables: CruncherTables,
  options?: CruncherOptions
): CrunchResult[] {
  const results: CrunchResult[] = crunchExactMatch(word, tables, options);
  if (word[0] === "V") {
    const relaxedWord = "U" + word.slice(1);
    for (const relaxedResult of crunchExactMatch(
      relaxedWord,
      tables,
      options
    )) {
      results.push({ ...relaxedResult, relaxedCase: true });
    }
  }
  if (options?.relaxCase === true) {
    const isUpperCase = word[0].toUpperCase() === word[0];
    const relaxedFirst = isUpperCase
      ? word[0].toLowerCase()
      : word[0].toUpperCase();
    const relaxedWord = relaxedFirst + word.slice(1);
    for (const relaxedResult of crunchExactMatch(
      relaxedWord,
      tables,
      options
    )) {
      results.push({ ...relaxedResult, relaxedCase: true });
    }
    // Handle e.g. Vt for ut
    if (word[0] === "V") {
      const relaxedWord = "u" + word.slice(1);
      for (const relaxedResult of crunchExactMatch(
        relaxedWord,
        tables,
        options
      )) {
        results.push({ ...relaxedResult, relaxedCase: true });
      }
    }
  }
  return results;
}

/**
 * Returns the indices of the possible ambiguous `i` and `u` characters.
 *
 * @param word the input, which must not have any combining characters.
 * @param tryI whether to check for ambiguous `i`.
 * @param tryU whether to check for ambiguous 'u'.
 *
 * @returns the (0 based) indices of the possible ambiguous characters.
 */
export function findAmbiguousIandU(
  word: string,
  tryI: boolean = true,
  tryU: boolean = true
): number[] {
  // We do not remove diacitics here on purpose because and i or u with
  // a macron definitely is not a consonant.
  const cleanWord = word.toLowerCase();
  const n = cleanWord.length;

  let markU = tryU;
  let markI = tryI;
  const isVowelTable: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const c = cleanWord[i];
    isVowelTable.push(Vowels.isVowel(c));
    // If the word has a `j`, we assume `i` is only used as a vowel.
    markI = markI && c !== "j";
    // If the word has a `v`, assume that `v` is only used as a vowel.
    // Note that some conventions use `V` for capital `u`, so we don't consider
    // capital `V` here. Note that using `word[i]` instead of `c` is intentional
    // as we need to distinguish the case here.
    markU = markU && word[i] !== "v";
  }
  if (!markI && !markU) {
    return [];
  }

  const result: number[] = [];
  for (let i = 0; i < n; i++) {
    const afterVowel = i >= 1 && isVowelTable[i - 1];
    const beforeVowel = i < n - 1 && isVowelTable[i + 1];
    if (!afterVowel && !beforeVowel) {
      continue;
    }
    const c = cleanWord[i];
    // Ignore `u` if after `q`, since `qu` is a digraph and `q` is never
    // used without `u`.
    const notAfterQ = cleanWord[i - 1] !== "q";
    if ((markI && c === "i") || (markU && c === "u" && notAfterQ)) {
      result.push(i);
    }
  }

  return result;
}

/**
 * Generates variants of the word with possible ambiguous `i` and `u` characters.
 *
 * @param word the input, which must not have any combining characters.
 * @param tryI whether to check for ambiguous `i`.
 * @param tryU whether to check for ambiguous 'u'.
 *
 * @yields alternate spellings with consonental i or u as specified.
 */
function* alternatesWithIorU(
  word: string,
  tryI?: boolean,
  tryU?: boolean
): Generator<string> {
  const ambigs = findAmbiguousIandU(word, tryI, tryU);
  if (ambigs.length === 0) {
    return;
  }
  const perm: boolean[] = Array(ambigs.length).fill(false);
  // Skip the all false case since that is just the original string.
  perm[0] = true;
  while (true) {
    const modifiedChunks = [word.substring(0, ambigs[0])];
    for (let i = 0; i < ambigs.length; i++) {
      const c = word[ambigs[i]];
      const modifiedCurrent = perm[i]
        ? c === "i"
          ? "j"
          : c === "I"
          ? "J"
          : c === "u"
          ? "v"
          : "V"
        : c;
      // We intentionally access `ambigs[i + 1]` without checking here, because
      // Javascript returns `undefined` for an out of bounds array access. This
      // means that `substring` will have no end index and will give us the rest
      // of the string after the start index.
      const nextInterval = word.substring(ambigs[i] + 1, ambigs[i + 1]);
      modifiedChunks.push(modifiedCurrent + nextInterval);
    }
    yield modifiedChunks.join("");

    let carry = true;
    for (let i = 0; i < perm.length; i++) {
      if (!carry) {
        break;
      }
      carry = perm[i];
      perm[i] = !perm[i];
    }

    // We overflowed!
    if (carry) {
      break;
    }
  }
}

export function crunchWord(
  input: string,
  tables: CruncherTables,
  options?: CruncherOptions
): CrunchResult[] {
  // Combine macron and breve combiners with vowels and remove all
  // others, since they make text processing more complicated.
  const word = stripCombiners(combineLengthCombiners(input));
  const results: CrunchResult[][] = [
    crunchAndMaybeRelaxCase(word, tables, options),
  ];
  if (options?.relaxIandJ !== undefined || options?.relaxUandV !== undefined) {
    const alternates = alternatesWithIorU(
      word,
      options?.relaxIandJ,
      options?.relaxUandV
    );
    Array.from(alternates).forEach((modifiedWord) =>
      results.push(crunchAndMaybeRelaxCase(modifiedWord, tables, options))
    );
  }
  return consolidateCrunchResults(results.flatMap((x) => x));
}

function mergeIfCompatible(
  stem: InflectionContext,
  ending: InflectionContext
): InflectionContext | null {
  const internalTags = new Set(
    (stem.internalTags || []).concat(ending.internalTags || [])
  );
  const stemData = stem.grammaticalData;
  const endData = ending.grammaticalData;
  const isCompatible =
    // Morpheus marks ends with `comp_only` if it is a compound-only
    // ending. We handle compounds differently, so just ignore these
    // for now.
    !internalTags.has("comp_only") &&
    subsetOf(stemData.case, endData.case) &&
    // For degree, the positive is implied if it is not marked.
    subsetOf(stemData.degree, endData.degree || LatinDegree.Positive) &&
    // If the template doesn't have a gender, it is assumed to be valid for all.
    subsetOf(
      stemData.gender,
      endData.gender || [
        LatinGender.Feminine,
        LatinGender.Masculine,
        LatinGender.Neuter,
      ]
    ) &&
    subsetOf(stemData.mood, endData.mood) &&
    subsetOf(stemData.number, endData.number) &&
    subsetOf(stemData.person, endData.person) &&
    subsetOf(stemData.tense, endData.tense) &&
    subsetOf(stemData.voice, endData.voice);
  if (!isCompatible) {
    return null;
  }

  // For `case` and `gender`, if the stem has provides any narrowing we want to use
  // that instead of the more expansive options on the ending (since the stem info
  // is guaranteed to be a subset of the end options after the above checks).
  // For example, if the stem has `fem` and the ending has `masc / fem`, we
  // only want `fem` for the result.
  //
  // Note that we should theoretically be doing this for all the other dimensions as well,
  // but because no other dimensions (besides `case` and `gender`) can have multiple
  // options, the result is the same as just taking the data from the ending, since in that
  // case either they are both undefined or both equal to the same thing (in which case
  // it doesn't matter if we took the stem or the ending), or the stem is undefined and
  // the ending is not (in which case we would want the ending).
  const resultCase = stemData.case ?? endData.case;
  const resultGender = stemData.gender ?? endData.gender;
  const resultData = { ...endData, gender: resultGender, case: resultCase };

  const isFuture = resultData.tense === LatinTense.Future;
  const isParticiple = resultData.mood === LatinMood.Participle;
  if (internalTags.has("no_fut") && isFuture) {
    return null;
  }
  if (internalTags.has("no_fut_part") && isFuture && isParticiple) {
    return null;
  }

  const result: InflectionContext = { grammaticalData: resultData };
  if (stem.tags !== undefined || ending.tags !== undefined) {
    const tags = (stem.tags || []).concat(ending.tags || []);
    result.tags = [...new Set<string>(tags)];
  }
  if (internalTags.size > 0) {
    result.internalTags = [...internalTags];
  }
  return result;
}

export namespace MorceusCruncher {
  export function make(tables: CruncherTables): Cruncher {
    return (word, options) => convert(crunchWord(word, tables, options));
  }

  function convert(crunchResults: CrunchResult[]): LatinWordAnalysis[] {
    const byLemma = arrayMap<string, CrunchResult>();
    for (const result of crunchResults) {
      byLemma.add(result.lemma, result);
    }
    const analyses: LatinWordAnalysis[] = [];
    for (const [lemma, results] of byLemma.map.entries()) {
      const byForm = arrayMap<string, CrunchResult>();
      for (const result of results) {
        byForm.add(result.form, result);
      }
      analyses.push({
        lemma: lemma
          .replaceAll("^", "\u0306")
          .replaceAll("_", "\u0304")
          .replaceAll("-", ""),
        inflectedForms: Array.from(
          byForm.map.entries(),
          ([form, inflectionData]) => ({
            form: form
              .replaceAll("^", "\u0306")
              .replaceAll("_", "\u0304")
              .replaceAll("-", ""),
            inflectionData,
          })
        ),
      });
    }
    return analyses;
  }
}

// function printWordAnalysis(input: LatinWordAnalysis) {
//   console.log(`lemma: ${input.lemma}`);
//   for (const form of input.inflectedForms) {
//     console.log(`  - ${form.form}: `);
//     for (const data of form.inflectionData) {
//       console.log(`    - ${InflectionContext.toString(data)}`);
//     }
//   }
// }

// import { MorceusTables } from "@/morceus/cruncher_tables";
// const cruncher = MorceusCruncher.make(MorceusTables.CACHED.get());
// const start = performance.now();
// const result = cruncher(process.argv[2], CruncherOptions.DEFAULT);
// console.log(`${performance.now() - start} ms`);
// result.forEach(printWordAnalysis);
// console.log(process.memoryUsage());
