import fs from "fs";

import { removeMacrons } from "@/common/text_cleaning";
import { fakeLatincyTagger } from "@/latincy/fake_latincy_tagger";
import type { MacronizedResult, MacronizedWord } from "@/web/api_routes";
import {
  applyChoices,
  resolveInitialResult,
} from "@/web/v2/macronizer/macronizer_apply.server";
import { createMacronizerEngine } from "@/web/v2/macronizer/macronizer_engine.server";
import {
  decodeSuggestions,
  encodeSuggestions,
} from "@/web/v2/macronizer/macronizer_params.server";

// Uses the real Morceus tables from `morceus-data/` (checked into the repo):
// the fake tables don't know enough words for enclitics, numerals and a
// realistic mix of suggestions.

const GOLDEN_TEXT = removeMacrons(
  fs.readFileSync(
    "src/macronizer/benchmarking/macronized_goldens/dcc_dbg.txt",
    "utf8"
  )
).slice(0, 3000);

/** Edge cases that change how many words the tagger sees per token. */
const EDGE_CASES =
  "Arma virumque cano.\r\nCaput XIV et VI; Cn. Pompeius ro\u00ADsam " +
  "dedit — 123 Ōthō poëtae.\r\n";

const TEXT = EDGE_CASES + GOLDEN_TEXT;

function words(result: MacronizedResult): MacronizedWord[] {
  return result.filter((t): t is MacronizedWord => typeof t !== "string");
}

describe("word indices across Macronize and Apply", () => {
  const engine = createMacronizerEngine(fakeLatincyTagger);

  test("macronize and analyzeOnly agree on every word and its options", async () => {
    const [full, analyzed] = await Promise.all([
      engine.macronize(TEXT),
      engine.analyzeOnly(TEXT),
    ]);
    const fullWords = words(full);
    const analyzedWords = words(analyzed);
    expect(fullWords.length).toBeGreaterThan(400);
    expect(fullWords.map((w) => [w.word, w.options])).toEqual(
      analyzedWords.map((w) => [w.word, w.options])
    );
    // The separators match too, so the texts line up character by character.
    expect(full.filter((t) => typeof t === "string")).toEqual(
      analyzed.filter((t) => typeof t === "string")
    );

    // The fake tagger suggested something, and every suggestion points at an
    // ambiguous word of the Morceus-only analysis.
    const suggestions = decodeSuggestions(encodeSuggestions(full));
    expect(suggestions.size).toBeGreaterThan(20);
    for (const [n, sug] of suggestions) {
      expect(analyzedWords[n].options.length).toBeGreaterThan(1);
      expect(sug.index).toBeLessThan(analyzedWords[n].options.length);
    }
  });

  test("Apply with only the first run's suggestions reproduces the first render", async () => {
    const [full, analyzed] = await Promise.all([
      engine.macronize(TEXT),
      engine.analyzeOnly(TEXT),
    ]);
    const initial = resolveInitialResult(full);
    const applied = applyChoices(analyzed, {
      suggestions: decodeSuggestions(initial.encodedSug),
      wordChoices: new Map(),
      vowelSubmissions: new Map(),
    });
    expect(applied.plainText).toBe(initial.plainText);
    expect(applied.words.map((w) => [w.tier, w.shownForm])).toEqual(
      initial.words.map((w) => [w.tier, w.shownForm])
    );
    expect(applied.counts).toEqual(initial.counts);
  });

  test("the edge cases come through as expected", async () => {
    const result = await engine.macronize(EDGE_CASES);
    const byWord = new Map(words(result).map((w) => [w.word, w]));
    // Enclitic: one word for the reader, two for the tagger.
    expect(byWord.get("virumque")?.options.length).toBeGreaterThan(0);
    // Numerals Morceus doesn't know become separators; known abbreviations
    // stay words, with the period left out.
    expect(byWord.has("XIV")).toBe(false);
    expect(byWord.get("Cn")?.options[0]?.options[0]?.lemma).toBe("Gnaeus");
    // A numeral that is also a word gets both readings.
    expect(byWord.get("VI")?.options.map((o) => o.kind)).toContain("numeral");
    // Soft hyphen kept in the word, absent from its forms.
    const rosam = byWord.get("ro\u00ADsam");
    expect(rosam?.options.length).toBeGreaterThan(0);
    expect(rosam?.options.every((o) => !o.form.includes("\u00AD"))).toBe(true);
    // Line breaks stay plain newlines.
    expect(result.filter((t) => t === "\n" || t === ".\n")).not.toEqual([]);
    expect(result.some((t) => typeof t === "string" && t.includes("\r"))).toBe(
      false
    );
  });
});
