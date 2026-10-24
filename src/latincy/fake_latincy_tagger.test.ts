import fs from "fs";

import { removeMacrons } from "@/common/text_cleaning";
import {
  FAKE_WRONG_LEMMA,
  fakeLatincyTagger,
} from "@/latincy/fake_latincy_tagger";
import { analyzeWithMorceus, macronizeInput } from "@/macronizer/morcronizer";
import { convertUpos } from "@/morceus/inflection_data_utils";
import type { MacronizedConfidence } from "@/macronizer/macronizer_types";

// These tests use the real Morceus tables from `morceus-data/` (checked into
// the repo), since the fake tables only know a handful of words.

const GOLDEN_PATH =
  "src/macronizer/benchmarking/macronized_goldens/dcc_dbg.txt";
const GOLDEN_TEXT = removeMacrons(fs.readFileSync(GOLDEN_PATH, "utf8")).slice(
  0,
  10000
);

const PARAGRAPH =
  "Gallia est omnis divisa in partes tres, quarum unam incolunt Belgae. " +
  "Arma virumque cano, Troiae qui primus ab oris. Caput VI et XII; " +
  "Gallia est omnis divisa.";

describe("fakeLatincyTagger", () => {
  it("is deterministic and independent of word position", async () => {
    const { words, spaces } = analyzeWithMorceus(PARAGRAPH);
    const first = await fakeLatincyTagger(words, spaces);
    const second = await fakeLatincyTagger(words, spaces);
    expect(second).toEqual(first);

    const reversed = await fakeLatincyTagger(
      [...words].reverse(),
      [...spaces].reverse()
    );
    expect([...reversed].reverse()).toEqual(first);

    const byWord = new Map<string, string>();
    first.forEach((tag, i) => {
      const key = `${spaces[i]}:${words[i]}`;
      const serialized = JSON.stringify(tag);
      expect(byWord.get(key) ?? serialized).toBe(serialized);
      byWord.set(key, serialized);
    });
  });

  it("emits one tag per word, aligned with the input", async () => {
    const { words, spaces } = analyzeWithMorceus(PARAGRAPH);
    const tags = await fakeLatincyTagger(words, spaces);
    expect(tags).toHaveLength(words.length);
    tags.forEach((tag, i) => expect(tag[0]).toBe(words[i]));
  });

  it("echoes separators and unknown words without morphology", async () => {
    const tags = await fakeLatincyTagger(
      [" ", "Gallia", ", ", "xqzzyv", "123"],
      [true, false, true, false, false]
    );
    expect(tags[0]).toEqual([" ", " ", ""]);
    expect(tags[2]).toEqual([", ", ", ", ""]);
    expect(tags[3]).toEqual(["xqzzyv", "xqzzyv", ""]);
    expect(tags[4]).toEqual(["123", "123", ""]);
  });

  it("emits morphology that convertUpos accepts", async () => {
    const { words, spaces } = analyzeWithMorceus(GOLDEN_TEXT);
    const tags = await fakeLatincyTagger(words, spaces);
    for (const tag of tags) {
      expect(() => convertUpos(tag[2])).not.toThrow();
    }
    expect(tags.some((tag) => tag[1] === FAKE_WRONG_LEMMA)).toBe(true);
  });

  it("emits plain three-element tokens for Roman numerals", async () => {
    const numerals = ["II", "III", "IV", "VI", "VII", "IX", "XI", "XII", "XV"];
    const tags = await fakeLatincyTagger(
      numerals,
      numerals.map(() => false)
    );
    for (const tag of tags) {
      expect(tag).toHaveLength(3);
      expect(tag[2]).not.toContain("NumForm");
      expect(tag[2]).not.toContain("NumType");
    }
  });

  it("produces a realistic mix of suggestion confidences", async () => {
    const result = await macronizeInput(GOLDEN_TEXT, fakeLatincyTagger);
    type Bucket = "none" | MacronizedConfidence;
    const counts = new Map<Bucket, number>();
    for (const token of result) {
      // Only ambiguous words (more than one form) get a suggestion.
      if (typeof token === "string" || token.options.length < 2) {
        continue;
      }
      const bucket: Bucket =
        token.suggested === undefined ? "none" : token.confidence ?? "none";
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }
    const count = (bucket: Bucket) => counts.get(bucket) ?? 0;
    const buckets: Bucket[] = ["none", "weak", "tied", "confident"];
    const ambiguous = buckets.reduce((sum, b) => sum + count(b), 0);
    expect(ambiguous).toBeGreaterThan(100);
    for (const bucket of buckets) {
      expect(count(bucket) / ambiguous).toBeGreaterThanOrEqual(0.03);
    }
    expect(count("confident")).toBeGreaterThan(
      Math.max(count("none"), count("weak"), count("tied"))
    );
  });
});
