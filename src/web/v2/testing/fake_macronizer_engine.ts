import type { LatinToken } from "@/latincy/latincy_client";
import type { Tagger } from "@/macronizer/morcronizer";
import type { MacronizedResult } from "@/macronizer/macronizer_types";
import {
  createMacronizerEngine,
  type MacronizerEngine,
} from "@/web/v2/macronizer/macronizer_engine.server";

export const CANNED_MACRONIZER_TEXT =
  "acclinat malum VI regis cave Panthia Brundisium.";

export const CANNED_MACRONIZER_RESULT: MacronizedResult = [
  {
    word: "acclinat",
    options: [
      {
        form: "accli\u0304nat",
        options: [{ lemma: "acclino#1", morph: ["pres ind act 3rd sg"] }],
      },
    ],
  },
  " ",
  {
    word: "malum",
    options: [
      {
        form: "malum",
        options: [{ lemma: "malum#1", morph: ["neut nom/voc/acc sg"] }],
      },
      {
        form: "ma\u0304lum",
        options: [{ lemma: "malum#2", morph: ["neut nom/voc/acc sg"] }],
      },
    ],
  },
  " ",
  {
    word: "VI",
    options: [
      {
        form: "VI\u0304",
        options: [{ lemma: "vis", morph: ["fem dat/abl sg"] }],
      },
      {
        form: "VI",
        kind: "numeral",
        options: [],
      },
    ],
  },
  " ",
  {
    word: "regis",
    options: [
      {
        form: "re\u0304gis",
        options: [{ lemma: "rex", morph: ["masc gen sg"] }],
      },
      {
        form: "regis",
        options: [{ lemma: "rego", morph: ["pres ind act 2nd sg"] }],
      },
    ],
    suggested: 0,
    confidence: "weak",
  },
  " ",
  {
    word: "cave",
    options: [
      {
        form: "cave\u0304",
        options: [{ lemma: "caveo", morph: ["pres imperat act 2nd sg"] }],
      },
      {
        form: "cave",
        options: [{ lemma: "caveo", morph: ["pres imperat act 2nd sg"] }],
      },
    ],
    suggested: 0,
    confidence: "tied",
  },
  " ",
  {
    word: "Panthia",
    options: [
      {
        form: "Panthia",
        options: [{ lemma: "Panthia", morph: ["fem nom/voc sg"] }],
      },
      {
        form: "Panthia\u0304",
        options: [{ lemma: "Panthia", morph: ["fem abl sg"] }],
      },
    ],
    suggested: 1,
    confidence: "confident",
  },
  " ",
  {
    word: "Brundisium",
    options: [],
  },
  ".",
];

function cloneResult(result: MacronizedResult): MacronizedResult {
  return result.map((token) => {
    if (typeof token === "string") {
      return token;
    }
    return {
      ...token,
      options: token.options.map((o) => ({
        ...o,
        options: o.options.map((entry) => ({
          lemma: entry.lemma,
          morph: [...entry.morph],
        })),
      })),
    };
  });
}

function stripSuggestions(result: MacronizedResult): MacronizedResult {
  return cloneResult(result).map((token) => {
    if (typeof token !== "string") {
      delete token.suggested;
      delete token.confidence;
    }
    return token;
  });
}

/**
 * Builds a deterministic `Tagger` function from a lookup table keyed by token text.
 */
export function createTableTagger(
  table: Record<string, { lemma: string; morph: string }>
): Tagger {
  return (words: string[], spaces: boolean[]): Promise<LatinToken[]> =>
    Promise.resolve(
      words.map((w, i): LatinToken => {
        if (spaces[i]) {
          return [w, "", ""];
        }
        const entry = table[w];
        if (!entry) {
          return [w, "", ""];
        }
        return [w, entry.lemma, entry.morph];
      })
    );
}

/**
 * Engine backed by real `analyzeWithMorceus` + `macronizeInput` with a
 * deterministic table tagger (for integration with `setupMorceusWithFakeData()`).
 */
export function tableTaggerMacronizerEngine(
  table: Record<string, { lemma: string; morph: string }> = {}
): MacronizerEngine {
  return createMacronizerEngine(createTableTagger(table));
}

/**
 * Canned in-memory `MacronizerEngine` for fast SSR, route, form, and
 * interaction conformance tests.
 */
export function fakeMacronizerEngine(
  customResults: Record<string, MacronizedResult> = {}
): MacronizerEngine {
  return {
    macronize: (text: string) => {
      const match = customResults[text] ?? CANNED_MACRONIZER_RESULT;
      return Promise.resolve(cloneResult(match));
    },
    analyzeOnly: (text: string) => {
      const match = customResults[text] ?? CANNED_MACRONIZER_RESULT;
      return Promise.resolve(stripSuggestions(match));
    },
  };
}

/**
 * Engine whose `macronize` rejects with a transient error (503), while
 * `analyzeOnly` still succeeds so `POST /v2/macronizer/apply` can be tested
 * while the tagger is down.
 */
export function throwingMacronizerEngine(
  error: Error = new Error("POS tagger request timed out")
): MacronizerEngine {
  return {
    macronize: () => Promise.reject(error),
    analyzeOnly: () =>
      Promise.resolve(stripSuggestions(CANNED_MACRONIZER_RESULT)),
  };
}
