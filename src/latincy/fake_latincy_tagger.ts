import type { LatinToken } from "@/latincy/latincy_client";
import type { Tagger } from "@/macronizer/morcronizer";
import { crunchWord } from "@/morceus/crunch";
import { MorceusTables } from "@/morceus/cruncher_tables";
import { CruncherOptions } from "@/morceus/cruncher_types";
import { wordInflectionDataToUd } from "@/latincy/ud_morph";

/** The lemma emitted when the fake tagger simulates a wrong lemma guess. */
export const FAKE_WRONG_LEMMA = "_fake";

const HAS_LETTER_RE = /\p{L}/u;

/** 32-bit FNV-1a hash over the UTF-16 code units of `input`. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function tagWord(word: string): LatinToken {
  if (!HAS_LETTER_RE.test(word)) {
    return [word, word, ""];
  }
  const hash = fnv1a(word.toLowerCase());
  const bucket = (hash >>> 8) % 100;
  const crunched = crunchWord(
    word,
    MorceusTables.CACHED.get(),
    CruncherOptions.DEFAULT
  );
  if (crunched.length === 0) {
    return [word, word, ""];
  }
  const pick = crunched[hash % crunched.length];
  const lemma = pick.lemma.split("#")[0];
  if (bucket < 65) {
    return [word, lemma, wordInflectionDataToUd(pick.grammaticalData)];
  }
  if (bucket < 78) {
    return [word, lemma, ""];
  }
  if (bucket < 90) {
    return [
      word,
      FAKE_WRONG_LEMMA,
      wordInflectionDataToUd(pick.grammaticalData),
    ];
  }
  return [word, FAKE_WRONG_LEMMA, ""];
}

/**
 * A stand-in for the LatinCy part-of-speech tagger, for local development and
 * end-to-end tests only. Its suggestions are simulated, not real guesses.
 *
 * Each word gets a tag that depends only on the word itself (via a hash of
 * its lowercase form) and the Morceus tables, never on its position or
 * neighbours, so the same word is tagged the same way in every text and runs
 * are fully reproducible. The tagger picks one of the word's real Morceus
 * analyses and then, depending on the hash, reports it faithfully (about 65%
 * of words), drops the morphology (13%), swaps in a wrong lemma (12%), or
 * does both (10%). This gives a realistic mix of confident, tied, weak and
 * missing suggestions.
 *
 * Separators, words without letters, and words Morceus doesn't know (including
 * most split-off enclitics) are echoed back with no morphology.
 */
export const fakeLatincyTagger: Tagger = (words, spaces) =>
  Promise.resolve(
    words.map((word, i) => (spaces[i] ? [word, word, ""] : tagWord(word)))
  );
