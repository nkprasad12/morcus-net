/**
 * @jest-environment jsdom
 */
import express from "express";
import request from "supertest";
import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import { setupMorceusWithFakeData } from "@/common/dictionaries/dict_test_utils";
import { applyChoices } from "@/web/v2/macronizer/macronizer_apply.server";
import {
  createMacronizerEngine,
  macronizerEngineFromEnv,
} from "@/web/v2/macronizer/macronizer_engine.server";
import { MACRONIZER_PARAMETER_LIMIT } from "@/web/v2/macronizer/macronizer_routes.server";
import { MACRONIZER_MAX_CHARS } from "@/web/v2/macronizer/macronizer_slots.common";
import {
  decodePriorShown,
  decodeSuggestions,
  encodePriorShown,
  encodeSuggestions,
  parseApplyBody,
  parseMacronizeBody,
} from "@/web/v2/macronizer/macronizer_params.server";
import {
  buildFromVowels,
  computeWordTier,
  getCardTagInfo,
  splitMacrons,
  wordBase,
} from "@/web/v2/macronizer/macronizer_tiers.common";
import { serializePostForm } from "@/web/v2/testing/form_roundtrip";
import { createV2Router } from "@/web/v2/v2_router.server";
import {
  CANNED_MACRONIZER_RESULT,
  CANNED_MACRONIZER_TEXT,
  createTableTagger,
  fakeMacronizerEngine,
  tableTaggerMacronizerEngine,
  throwingMacronizerEngine,
} from "@/web/v2/testing/fake_macronizer_engine";

jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/v2/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/v2/reader/reader_loader.server", () =>
  jest.requireActual("@/web/v2/testing/mock_reader_loader")
);

/** The passage `<a>` for word `n` (one line per word in the markup). */
function wordAnchor(page: string, n: number): string {
  const match = new RegExp(`<a [^>]*data-w="${n}"[^>]*>[^<]*</a>`).exec(page);
  if (match === null) {
    throw new Error(`No word ${n} in page`);
  }
  return match[0];
}

/** Silences and returns the route's `console.error` logging of engine failures. */
function expectErrorLogs(): jest.SpyInstance {
  return jest.spyOn(console, "error").mockImplementation(() => {});
}

afterEach(() => {
  jest.restoreAllMocks();
});

function createTestApp(engine = fakeMacronizerEngine()): express.Express {
  const dict: Partial<FusedDictionary> = {
    getEntry: jest.fn().mockResolvedValue({}),
    getCompletions: jest.fn().mockResolvedValue({}),
  };
  const app = express();
  app.use(
    "/v2",
    createV2Router(dict as FusedDictionary, {
      macronizer: engine,
    })
  );
  return app;
}

describe("macronizer_tiers.common & macronizer_params.server", () => {
  test("splitMacrons and buildFromVowels round-trip NFD and NFC forms", () => {
    const splitNfd = splitMacrons("accli\u0304nat");
    expect(splitNfd.base).toBe("acclinat");
    expect(Array.from(splitNfd.longAt)).toEqual([4]);

    const splitNfc = splitMacrons("accl\u012Bnat");
    expect(splitNfc.base).toBe("acclinat");
    expect(Array.from(splitNfc.longAt)).toEqual([4]);

    expect(buildFromVowels("acclinat", new Set([0, 4]))).toBe(
      "\u0101ccl\u012Bnat"
    );
  });

  test("computeWordTier assigns tiers 0..5 and getCardTagInfo detects possible Roman numerals", () => {
    const [
      plain,
      _,
      unresolved,
      __,
      numeralWord,
      ___,
      weakWord,
      ____,
      tiedWord,
      _____,
      confidentWord,
      ______,
      unknownWord,
    ] = CANNED_MACRONIZER_RESULT;

    if (
      typeof plain === "string" ||
      typeof unresolved === "string" ||
      typeof numeralWord === "string" ||
      typeof weakWord === "string" ||
      typeof tiedWord === "string" ||
      typeof confidentWord === "string" ||
      typeof unknownWord === "string"
    ) {
      throw new Error("Expected word tokens");
    }

    expect(computeWordTier(plain)).toBe(0);
    expect(computeWordTier(unresolved)).toBe(1);
    expect(computeWordTier(numeralWord)).toBe(1);
    expect(computeWordTier(weakWord)).toBe(2);
    expect(computeWordTier(tiedWord)).toBe(3);
    expect(computeWordTier(confidentWord)).toBe(4);
    expect(computeWordTier(unknownWord)).toBe(5);

    expect(getCardTagInfo(numeralWord, 1, "default").label).toBe(
      "possible Roman numeral"
    );
    expect(getCardTagInfo(unresolved, 1, "default").label).toBe(
      "needs your choice"
    );
  });

  test("encodeSuggestions/decodeSuggestions and encodePriorShown/decodePriorShown ignore malformed entries", () => {
    const encoded = encodeSuggestions(CANNED_MACRONIZER_RESULT);
    expect(encoded).toBe("3:0:w,4:0:t,5:1:c");
    const decoded = decodeSuggestions(`${encoded},bad,999:-1:c,2:1:z`);
    expect(decoded.get(3)).toEqual({ index: 0, confidence: "weak" });
    expect(decoded.get(4)).toEqual({ index: 0, confidence: "tied" });
    expect(decoded.get(5)).toEqual({ index: 1, confidence: "confident" });
    expect(decoded.has(999)).toBe(false);
    expect(decoded.has(2)).toBe(false);

    const shownEncoded = encodePriorShown(
      new Map([
        [1, { kind: "chosen", optionIndex: 1 }],
        [6, { kind: "edited", longPositions: new Set([2, 5]) }],
      ])
    );
    expect(shownEncoded).toBe("1:c:1,6:e:2.5");
    const shownDecoded = decodePriorShown(`${shownEncoded},bad,9:x:1,8:e:foo`);
    expect(shownDecoded.get(1)).toEqual({ kind: "chosen", optionIndex: 1 });
    expect(shownDecoded.get(6)).toEqual({
      kind: "edited",
      longPositions: new Set([2, 5]),
    });
  });

  test("parseMacronizeBody preserves leading/trailing whitespace and enforces 10k char limit", () => {
    expect(parseMacronizeBody({ text: "   \n\t  " }).kind).toBe("empty");
    const padded = "  Gallia est omnis\n";
    expect(parseMacronizeBody({ text: padded })).toEqual({
      kind: "ok",
      text: padded,
    });
    const overLimit = "a".repeat(MACRONIZER_MAX_CHARS + 5);
    expect(parseMacronizeBody({ text: overLimit })).toEqual({
      kind: "too_long",
      text: overLimit,
      length: MACRONIZER_MAX_CHARS + 5,
    });
  });
});

describe("end-to-end acceptance behaviour", () => {
  setupMorceusWithFakeData();

  test("Apply where a word's checkboxes are all unchecked produces the all-short form, not the shown form", () => {
    const suggestions = decodeSuggestions(
      encodeSuggestions(CANNED_MACRONIZER_RESULT)
    );
    // Word 3 is `regis`, default shown form is `rēgis` (long 'e' at pos 1).
    // Submitting m3="" (empty set of checked positions) must produce all-short `regis`.
    const doc = applyChoices(CANNED_MACRONIZER_RESULT, {
      suggestions,
      wordChoices: new Map(),
      vowelSubmissions: new Map([[3, new Set()]]),
    });

    const word3 = doc.words[3];
    expect(word3.word.word).toBe("regis");
    expect(word3.decision).toBe("edited");
    expect(word3.shownForm).toBe("regis");
  });

  test("Apply where the checkboxes are unchanged and a radio is checked produces the radio's form", () => {
    const suggestions = decodeSuggestions(
      encodeSuggestions(CANNED_MACRONIZER_RESULT)
    );
    // Word 1 is `malum`, default shown form is `malum` (no long vowels: Set()).
    // In the form, checkboxes for m1 are unchanged (Set()), and radio w1=1 (`mālum`) is checked.
    const doc = applyChoices(CANNED_MACRONIZER_RESULT, {
      suggestions,
      wordChoices: new Map([[1, 1]]),
      vowelSubmissions: new Map([[1, new Set()]]),
    });

    const word1 = doc.words[1];
    expect(word1.decision).toBe("chosen");
    expect(word1.chosenOptionIndex).toBe(1);
    expect(word1.shownForm).toBe("m\u0101lum");
  });

  test("a tampered sug=999:9:c or w5=7 is ignored without a 500", async () => {
    const app = createTestApp();
    const res = await request(app)
      .post("/v2/macronizer/apply")
      .type("form")
      .send({
        text: CANNED_MACRONIZER_TEXT,
        sug: "999:9:c,1:99:c",
        w5: "7",
        w999: "1",
        m1: "99",
      });

    expect(res.status).toBe(200);
    // `sug` was replaced by the tampered one, whose only in-range word (1)
    // names a missing option, so no word has a suggestion.
    expect(wordAnchor(res.text, 1)).toContain('data-tier="1"');
    expect(wordAnchor(res.text, 3)).toContain('data-tier="1"');
    expect(res.text).not.toContain("data-decision");
    // `w5=7` is out of range, so Panthia keeps its default (first) form.
    expect(wordAnchor(res.text, 5)).toMatch(/>Panthia<\/a>$/);
    // `m1=99` isn't a vowel of `malum`, so nothing is checked for it.
    expect(res.text).not.toMatch(/name="m1" value="99"/);
  });

  test("a known I in all caps renders as tier 1 with 'possible Roman numeral' tag, even with a numeral-looking tag", async () => {
    const untaggedEngine = tableTaggerMacronizerEngine({});
    const untaggedApp = createTestApp(untaggedEngine);
    const untaggedRes = await request(untaggedApp)
      .post("/v2/macronizer")
      .type("form")
      .send({ text: "I" });

    expect(untaggedRes.status).toBe(200);
    expect(untaggedRes.text).toContain('data-tier="1"');
    expect(untaggedRes.text).toContain("possible Roman numeral");
    expect(untaggedRes.text).toContain("Roman numeral (1), no macrons");

    const numEngine = tableTaggerMacronizerEngine({
      I: { lemma: "I", morph: "NumForm=Roman|NumType=Card" },
    });
    const numApp = createTestApp(numEngine);
    const numRes = await request(numApp)
      .post("/v2/macronizer")
      .type("form")
      .send({ text: "I" });

    expect(numRes.status).toBe(200);
    expect(numRes.text).toContain('data-tier="1"');
    expect(numRes.text).toContain("possible Roman numeral");
    expect(numRes.text).not.toContain("auto-picked");
  });
});

describe("Macronizer routes (/v2/macronizer and /v2/macronizer/apply)", () => {
  test("GET /v2/macronizer serves the landing page", async () => {
    const app = createTestApp();
    const res = await request(app).get("/v2/macronizer");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Latin Macronizer");
    expect(res.text).toContain('action="/v2/macronizer"');
  });

  test("POST /v2/macronizer serves full page or slot partial when X-Requested-With: fetch", async () => {
    const app = createTestApp();
    const fullRes = await request(app)
      .post("/v2/macronizer")
      .type("form")
      .send({ text: CANNED_MACRONIZER_TEXT });
    expect(fullRes.status).toBe(200);
    expect(fullRes.headers["vary"]).toContain("X-Requested-With");
    expect(fullRes.text).toContain("<html");
    expect(fullRes.text).toContain('id="mac-passage"');

    const partialRes = await request(app)
      .post("/v2/macronizer")
      .set("X-Requested-With", "fetch")
      .type("form")
      .send({ text: CANNED_MACRONIZER_TEXT });
    expect(partialRes.status).toBe(200);
    expect(partialRes.headers["vary"]).toContain("X-Requested-With");
    expect(partialRes.text).toContain(
      '<template data-slot="macronizer-workspace">'
    );
    expect(partialRes.text).not.toContain("<html");
  });

  test("POST /v2/macronizer handles empty and >10,000 char inputs with error banners", async () => {
    const app = createTestApp();
    const emptyRes = await request(app)
      .post("/v2/macronizer")
      .type("form")
      .send({ text: "   " });
    expect(emptyRes.status).toBe(200);
    expect(emptyRes.text).toContain("mac-error-banner");
    expect(emptyRes.text).toContain("Please enter or paste a Latin passage");

    const longText = "a".repeat(MACRONIZER_MAX_CHARS + 20);
    const longRes = await request(app)
      .post("/v2/macronizer")
      .type("form")
      .send({ text: longText });
    expect(longRes.status).toBe(200);
    expect(longRes.text).toContain("mac-error-banner");
    expect(longRes.text).toContain("Input is too long");
  });

  test("POST /v2/macronizer handles >1mb body (413) cleanly", async () => {
    const app = createTestApp();
    const hugeBody = "text=" + "a".repeat(1024 * 1024 + 500);
    const res = await request(app)
      .post("/v2/macronizer")
      .set("Content-Type", "application/x-www-form-urlencoded")
      .send(hugeBody);
    expect(res.status).toBe(200);
    expect(res.text).toContain("mac-error-banner");
    expect(res.text).toContain("Input is too long");
  });

  test("POST /v2/macronizer returns 503 with preserved input when engine is unavailable or rejects", async () => {
    const unavailApp = createTestApp(createMacronizerEngine());
    const res1 = await request(unavailApp)
      .post("/v2/macronizer")
      .type("form")
      .send({ text: "Gallia est omnis" });
    expect(res1.status).toBe(503);
    expect(res1.text).toContain("not configured");
    expect(res1.text).toContain("Gallia est omnis");

    const throwingApp = createTestApp(throwingMacronizerEngine());
    const errors = expectErrorLogs();
    const res2 = await request(throwingApp)
      .post("/v2/macronizer")
      .type("form")
      .send({ text: "Gallia est omnis" });
    expect(res2.status).toBe(503);
    expect(res2.text).toContain("temporarily unavailable");
    expect(res2.text).toContain("Gallia est omnis");
    expect(errors).toHaveBeenCalledWith("Macronize failed:", expect.any(Error));
  });

  test("POST /v2/macronizer/apply works even when the tagger is down (analyzeOnly)", async () => {
    const throwingApp = createTestApp(throwingMacronizerEngine());
    const res = await request(throwingApp)
      .post("/v2/macronizer/apply")
      .type("form")
      .send({
        text: CANNED_MACRONIZER_TEXT,
        sug: encodeSuggestions(CANNED_MACRONIZER_RESULT),
        w1: "1",
      });
    expect(res.status).toBe(200);
    expect(res.text).toContain("m\u0101lum");
  });

  test("POST /v2/macronizer/apply works without a tagger and returns 503 if analyzeOnly throws", async () => {
    const unavailApp = createTestApp(createMacronizerEngine());
    const okRes = await request(unavailApp)
      .post("/v2/macronizer/apply")
      .type("form")
      .send({
        text: "Panthia",
      });
    expect(okRes.status).toBe(200);

    const brokenEngineApp = createTestApp({
      macronize: () => Promise.reject(new Error("down")),
      analyzeOnly: () => Promise.reject(new Error("morceus down")),
    });
    const errors = expectErrorLogs();
    const res = await request(brokenEngineApp)
      .post("/v2/macronizer/apply")
      .type("form")
      .send({
        text: CANNED_MACRONIZER_TEXT,
      });
    expect(res.status).toBe(503);
    expect(errors).toHaveBeenCalledWith(
      "Macronizer Apply failed:",
      expect.any(Error)
    );
  });

  test("parseApplyBody handles single and array mN values", () => {
    const parsed = parseApplyBody({
      text: "malum",
      m1: ["", "1", "3"],
      w2: "0",
    });
    expect(Array.from(parsed.vowelSubmissions.get(1) ?? [])).toEqual([1, 3]);
    expect(parsed.wordChoices.get(2)).toBe(0);
  });
});

describe("Macronizer No-JS form round-trips", () => {
  setupMorceusWithFakeData();

  const PANTHIA_ABL = {
    lemma: "Panthia",
    morph: "Case=Abl|Gender=Fem|Number=Sing",
  };

  /** Submits the page's Apply form as a browser would (CRLF line breaks). */
  function applyFormBody(page: string): string {
    const doc = document.implementation.createHTMLDocument("");
    doc.documentElement.innerHTML = page;
    const form = doc.querySelector<HTMLFormElement>("#mac-apply");
    if (form === null) {
      throw new Error("No Apply form");
    }
    return serializePostForm(form).body.replace(/%0A/g, "%0D%0A");
  }

  test("CRLF input: no line-final unknowns, and Apply round-trips unchanged", async () => {
    const app = createTestApp(
      tableTaggerMacronizerEngine({ Panthia: PANTHIA_ABL })
    );
    const text = "Panthia\r\nPanthia\r\nPanthia";
    const res = await request(app)
      .post("/v2/macronizer")
      .type("form")
      .send({ text });
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/<a [^>]*data-tier="5"/);
    for (const n of [0, 1, 2]) {
      expect(wordAnchor(res.text, n)).toContain('data-tier="4"');
    }

    const applied = await request(app)
      .post("/v2/macronizer/apply")
      .set("Content-Type", "application/x-www-form-urlencoded")
      .send(applyFormBody(res.text));
    expect(applied.status).toBe(200);
    expect(applied.text).not.toContain("data-decision");
    for (const n of [0, 1, 2]) {
      expect(wordAnchor(applied.text, n)).toBe(wordAnchor(res.text, n));
    }
  });

  test("soft hyphens: the vowel boxes line up with the macrons and Apply keeps them", async () => {
    const app = createTestApp(
      tableTaggerMacronizerEngine({ Panthia: PANTHIA_ABL })
    );
    const res = await request(app)
      .post("/v2/macronizer")
      .type("form")
      .send({ text: "Pan\u00ADthia" });
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-orig="Panthia"');
    // The final `a` (index 6 without the soft hyphen) is the long one.
    expect(res.text).toMatch(/name="m0" value="6" form="mac-apply" checked/);

    const applied = await request(app)
      .post("/v2/macronizer/apply")
      .set("Content-Type", "application/x-www-form-urlencoded")
      .send(applyFormBody(res.text));
    expect(applied.status).toBe(200);
    expect(applied.text).not.toContain("data-decision");
    expect(wordAnchor(applied.text, 0)).toContain(">Panthi\u0101</a>");
  });

  test("unknown words keep their typed macrons and soft hyphens don't break the lookup", async () => {
    const app = createTestApp(tableTaggerMacronizerEngine({}));
    const res = await request(app)
      .post("/v2/macronizer")
      .type("form")
      .send({ text: "\u014Ctho\u0304 Brun\u00ADdisium" });
    expect(res.status).toBe(200);
    expect(wordAnchor(res.text, 0)).toContain(">\u014Cth\u014D</a>");
    expect(res.text).toMatch(/name="m0" value="0" form="mac-apply" checked/);
    expect(res.text).toContain("Look up <em>Brundisium</em>");
    expect(res.text).toContain("q=Brundisium");
  });

  test("the copybox isn't posted with Apply", async () => {
    const app = createTestApp();
    const res = await request(app)
      .post("/v2/macronizer")
      .type("form")
      .send({ text: CANNED_MACRONIZER_TEXT });
    expect(res.text).toContain('id="mac-plain-out"');
    expect(res.text).not.toContain('name="out"');
  });

  test("Apply accepts as many fields as a 10,000-character text can produce", async () => {
    // One-letter words give the most fields per character: a hidden `mN`, a
    // checked vowel and a radio per word.
    const text = "a ".repeat(MACRONIZER_MAX_CHARS / 2).slice(0, -1);
    const fields = new URLSearchParams({ text, sug: "", shown: "" });
    for (let n = 0; n < MACRONIZER_MAX_CHARS / 2; n++) {
      fields.append(`m${n}`, "");
      fields.append(`m${n}`, "0");
      fields.append(`w${n}`, "0");
    }
    const app = createTestApp();
    const res = await request(app)
      .post("/v2/macronizer/apply")
      .set("Content-Type", "application/x-www-form-urlencoded")
      .send(fields.toString());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain("Too many choices");
    expect(res.text).not.toContain("Input is too long");
  });

  test("Apply with too many fields says so and keeps the input", async () => {
    const fields = new URLSearchParams({ text: "Gallia est omnis" });
    for (let n = 0; n <= MACRONIZER_PARAMETER_LIMIT; n++) {
      fields.append(`m${n}`, "0");
    }
    const app = createTestApp();
    const res = await request(app)
      .post("/v2/macronizer/apply")
      .set("Content-Type", "application/x-www-form-urlencoded")
      .send(fields.toString());
    expect(res.status).toBe(200);
    expect(res.text).toContain("Too many choices to apply at once");
    expect(res.text).not.toContain("Input is too long");
    expect(res.text).toMatch(/<textarea[^>]*>\s*Gallia est omnis<\/textarea/);
  });
});

describe("Macronizer page chrome", () => {
  test("no app-bar entry is highlighted", async () => {
    const res = await request(createTestApp()).get("/v2/macronizer");
    expect(res.text).not.toContain('aria-current="page"');
  });

  test("simulated suggestions are labelled as such", async () => {
    const simulatedApp = createTestApp(
      createMacronizerEngine(createTableTagger({}), { simulated: true })
    );
    const simulated = await request(simulatedApp)
      .post("/v2/macronizer")
      .type("form")
      .send({ text: "Gallia" });
    expect(simulated.text).toContain("data-simulated");
    expect(simulated.text).toContain("Suggestions are simulated");

    const real = await request(createTestApp())
      .post("/v2/macronizer")
      .type("form")
      .send({ text: CANNED_MACRONIZER_TEXT });
    expect(real.text).not.toContain("data-simulated");
  });

  test("fetch requests get the error view as a partial, keeping the status", async () => {
    const errors = expectErrorLogs();
    const res = await request(createTestApp(throwingMacronizerEngine()))
      .post("/v2/macronizer")
      .set("X-Requested-With", "fetch")
      .type("form")
      .send({ text: "Gallia est omnis" });
    expect(res.status).toBe(503);
    expect(res.text).toContain('<template data-slot="macronizer-workspace">');
    expect(res.text).not.toContain("<html");
    expect(res.text).toContain("temporarily unavailable");
    expect(errors).toHaveBeenCalledTimes(1);
  });

  test("wordBase drops format characters before splitting macrons", () => {
    const { base, longAt } = wordBase("Pan\u00ADthi\u0101");
    expect(base).toBe("Panthia");
    expect([...longAt]).toEqual([6]);
  });
});

describe("macronizerEngineFromEnv", () => {
  function fromEnv(env: Record<string, string | undefined>) {
    const warnings: string[] = [];
    const engine = macronizerEngineFromEnv(env, (m) => warnings.push(m));
    return { engine, warnings };
  }

  test.each<Record<string, string>>([{}, { MACRONIZER_ENGINE: "" }])(
    "defaults to off (%o): Macronize says it isn't configured",
    async (env) => {
      const { engine, warnings } = fromEnv(env);
      expect(warnings).toEqual([]);
      expect(engine.simulated).toBe(false);
      await expect(engine.macronize("Gallia")).rejects.toThrow(
        "not configured"
      );
    }
  );

  test.each<Record<string, string>>([
    {},
    { MACRONIZER_ENGINE: "" },
    { MACRONIZER_ENGINE: "off" },
  ])("warns loudly when off (%o) but LATINCY_SERVER_ADDRESS is set", (env) => {
    const { warnings } = fromEnv({
      ...env,
      LATINCY_SERVER_ADDRESS: "http://latincy:8000",
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("WARNING");
    expect(warnings[0]).toContain("MACRONIZER_ENGINE=latincy");
  });

  test("latincy requires LATINCY_SERVER_ADDRESS", () => {
    expect(() => fromEnv({ MACRONIZER_ENGINE: "latincy" })).toThrow(
      /requires LATINCY_SERVER_ADDRESS/
    );
    const { engine, warnings } = fromEnv({
      MACRONIZER_ENGINE: "latincy",
      LATINCY_SERVER_ADDRESS: "http://latincy:8000",
    });
    expect(warnings).toEqual([]);
    expect(engine.simulated).toBe(false);
  });

  test("fake-latincy simulates suggestions and says so", () => {
    const { engine, warnings } = fromEnv({ MACRONIZER_ENGINE: "fake-latincy" });
    expect(engine.simulated).toBe(true);
    expect(warnings.join("\n")).toContain("SIMULATED");
  });

  test("rejects unknown modes, listing the valid ones", () => {
    expect(() => fromEnv({ MACRONIZER_ENGINE: "morceus-only" })).toThrow(
      /Unknown MACRONIZER_ENGINE "morceus-only".*latincy, fake-latincy, off/
    );
  });
});
