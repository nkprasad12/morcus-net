/**
 * Dictionary form round-trip & parameter precedence conformance
 * (see docs/DESIGN_TRAPS.md, "Testing").
 * Helpers and approach: `testing/form_roundtrip.ts`.
 *
 * Key rules enforced here (see docs/DESIGN_TRAPS.md):
 * - Never fixture an override with `L&S` (the default); use `GAF` / `GRG`.
 * - Assert exact sets (`getRenderedDictTitles`, `getCheckedDictKeys`), never
 *   vacuous `.toContain()` checks.
 * - Exercise multi-step journeys (select -> search again -> cookie reload ->
 *   toggle inflection off -> toggle inflection back on).
 *
 * @jest-environment jsdom
 */

import express from "express";
import request from "supertest";
import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import {
  decodeDictBitmask,
  encodeDictBitmask,
} from "@/web/ui/dict/settings/dict_bitmask.common";
import { resolveDictParams } from "@/web/ui/dict/settings/dict_selection.common";
import { createV2Router } from "@/web/ui/app_router.server";
import {
  fakeCorpusEngine,
  fakeResult,
} from "@/web/ui/testing/fake_corpus_engine";
import { serializeGetForm } from "@/web/ui/testing/form_roundtrip";

jest.mock("@/web/ui/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/ui/reader/reader_loader.server", () =>
  jest.requireActual("@/web/ui/testing/mock_reader_loader")
);

/** Extracts `key=value` cookie pairs from supertest `set-cookie` headers. */
function extractCookies(
  setCookieHeader: string | string[] | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!setCookieHeader) return out;
  const list = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : [setCookieHeader];
  for (const raw of list) {
    const firstPart = raw.split(";")[0]?.trim();
    if (!firstPart) continue;
    const eqIdx = firstPart.indexOf("=");
    if (eqIdx > 0) {
      out[firstPart.slice(0, eqIdx)] = firstPart.slice(eqIdx + 1);
    }
  }
  return out;
}

function formatCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function getCheckedDictKeys(root: ParentNode): string[] {
  return Array.from(
    root.querySelectorAll<HTMLInputElement>("input.dict-checkbox")
  )
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);
}

function getRenderedDictTitles(root: ParentNode): string[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(".dict-card .dict-title")
  )
    .map((el) => el.textContent?.trim() ?? "")
    .filter(Boolean);
}

describe("Dictionary form round-trip & parameter precedence conformance", () => {
  let app: express.Express;
  let mockGetEntry: jest.Mock;

  beforeEach(() => {
    document.body.innerHTML = "";

    // Return a 1-entry hit for every dictionary the router asks for, so the
    // rendered `.dict-card` set in the HTML response reflects the exact filtered
    // dictionary list rather than a hardcoded L&S stub.
    mockGetEntry = jest
      .fn()
      .mockImplementation(({ dicts }: { query: string; dicts: string[] }) => {
        const response: Record<string, unknown[]> = {};
        for (const key of dicts) {
          response[key] = [
            {
              entry: '<span class="lsOrth">test</span>',
              outline: {
                mainKey: "test",
                mainSection: {
                  text: "test",
                  level: 0,
                  ordinal: "",
                  sectionId: `${key.toLowerCase()}-0`,
                },
                senses: [],
              },
            },
          ];
        }
        return Promise.resolve(response);
      });

    const mockFusedDict: Partial<FusedDictionary> = {
      getEntry: mockGetEntry,
      getCompletions: jest.fn().mockResolvedValue({}),
    };

    app = express();
    app.use(
      createV2Router(mockFusedDict as FusedDictionary, {
        corpus: fakeCorpusEngine(() =>
          fakeResult({
            resultStats: { estimatedResults: 200 },
            nextPage: { resultId: 1, resultIndex: 50, candidateIndex: 0 },
          })
        ),
      })
    );
  });

  /** The settings dialog's own form; its Done button saves without JS. */
  function settingsForm(): HTMLFormElement {
    return document.body.querySelector<HTMLFormElement>(
      "form.dict-settings-form"
    )!;
  }

  function doneButton(form: HTMLFormElement): HTMLElement | null {
    return form.querySelector<HTMLElement>(".dict-settings-done");
  }

  test("multi-step No-JS dictionary journey: select GAF+GRG -> search again -> reload from cookie -> open a link -> toggle inflection off and back on", async () => {
    const cookies: Record<string, string> = {};

    // --- Step 1: Load initial search page, select ONLY Gaffiot (GAF) and Georges (GRG), Done ---
    const res1 = await request(app).get("/dicts?q=amo");
    expect(res1.status).toBe(200);
    document.body.innerHTML = res1.text;

    const form1 = settingsForm();
    expect(form1).not.toBeNull();
    for (const cb of Array.from(
      form1.querySelectorAll<HTMLInputElement>("input.dict-checkbox")
    )) {
      cb.checked = cb.value === "GAF" || cb.value === "GRG";
    }

    const step1Url = serializeGetForm(form1, doneButton(form1));
    expect(step1Url).toContain("save=1");
    expect(step1Url).toContain("q=amo");
    const applyRes = await request(app).get(step1Url);
    // Done persists, then redirects to the same view without the marker.
    expect(applyRes.status).toBe(303);
    Object.assign(cookies, extractCookies(applyRes.header["set-cookie"]));
    const redirectTarget = applyRes.header["location"];
    expect(redirectTarget).not.toContain("save=");

    const res2 = await request(app)
      .get(redirectTarget)
      .set("Cookie", formatCookieHeader(cookies));
    expect(res2.status).toBe(200);

    expect(mockGetEntry).toHaveBeenLastCalledWith(
      {
        query: "amo",
        dicts: ["GAF", "GRG"],
        mode: 1,
      },
      expect.anything()
    );

    document.body.innerHTML = res2.text;
    expect(getRenderedDictTitles(document.body)).toEqual([
      "Gaffiot",
      "Georges",
    ]);
    expect(getCheckedDictKeys(document.body)).toEqual(["GAF", "GRG"]);

    // --- Step 2: Search a new word ("gladius") using the re-rendered search form ---
    const form2 =
      document.body.querySelector<HTMLFormElement>("form.search-form")!;
    const qInput2 = form2.querySelector<HTMLInputElement>('input[name="q"]')!;
    qInput2.value = "gladius";

    const res3 = await request(app)
      .get(serializeGetForm(form2))
      .set("Cookie", formatCookieHeader(cookies));
    expect(res3.status).toBe(200);
    Object.assign(cookies, extractCookies(res3.header["set-cookie"]));

    expect(mockGetEntry).toHaveBeenLastCalledWith(
      {
        query: "gladius",
        dicts: ["GAF", "GRG"],
        mode: 1,
      },
      expect.anything()
    );
    document.body.innerHTML = res3.text;
    expect(getRenderedDictTitles(document.body)).toEqual([
      "Gaffiot",
      "Georges",
    ]);
    expect(getCheckedDictKeys(document.body)).toEqual(["GAF", "GRG"]);
    expect(res3.text).not.toContain("guest-chip");

    // --- Step 3: Navigate to `/dicts?q=rex` with cookie only (no dict params in URL) ---
    const res4 = await request(app)
      .get("/dicts?q=rex")
      .set("Cookie", formatCookieHeader(cookies));
    expect(res4.status).toBe(200);
    expect(mockGetEntry).toHaveBeenLastCalledWith(
      {
        query: "rex",
        dicts: ["GAF", "GRG"],
        mode: 1,
      },
      expect.anything()
    );
    document.body.innerHTML = res4.text;
    expect(getRenderedDictTitles(document.body)).toEqual([
      "Gaffiot",
      "Georges",
    ]);
    expect(getCheckedDictKeys(document.body)).toEqual(["GAF", "GRG"]);

    // --- Step 4: Open someone's link with inflection off: guest mode, nothing saved ---
    const res5 = await request(app)
      .get(`/dicts?q=rex&d=${encodeDictBitmask(["GAF", "GRG"])}&o=0`)
      .set("Cookie", formatCookieHeader(cookies));
    expect(res5.status).toBe(200);
    Object.assign(cookies, extractCookies(res5.header["set-cookie"]));
    expect(mockGetEntry).toHaveBeenLastCalledWith(
      {
        query: "rex",
        dicts: ["GAF", "GRG"],
        mode: 0,
      },
      expect.anything()
    );
    expect(cookies["morcus_inflected"]).not.toBe("0");
    document.body.innerHTML = res5.text;
    // The controls are locked, Done can't save, and the link's settings ride along in the
    // search form, so a new search keeps them.
    expect(res5.text).toContain("Using link settings");
    const inflectCb5 =
      settingsForm().querySelector<HTMLInputElement>("#toggle-inflected")!;
    expect(inflectCb5.checked).toBe(false);
    expect(inflectCb5.disabled).toBe(true);
    expect(settingsForm().querySelector('[name="save"]')).toBeNull();
    const form5 =
      document.body.querySelector<HTMLFormElement>("form.search-form")!;
    expect(serializeGetForm(form5)).toContain("o=0");

    // "Restore saved" goes back to the saved ones.
    const returnHref = document.body
      .querySelector<HTMLAnchorElement>("a.guest-return")!
      .getAttribute("href")!;
    const res5b = await request(app)
      .get(returnHref)
      .set("Cookie", formatCookieHeader(cookies));
    expect(res5b.status).toBe(200);
    expect(mockGetEntry).toHaveBeenLastCalledWith(
      {
        query: "rex",
        dicts: ["GAF", "GRG"],
        mode: 1,
      },
      expect.anything()
    );

    // --- Step 4c: Back on their own settings, untick inflection and press Done ---
    document.body.innerHTML = res5b.text;
    expect(res5b.text).not.toContain("guest-chip");
    const form5b = settingsForm();
    form5b.querySelector<HTMLInputElement>("#toggle-inflected")!.checked =
      false;
    const applyRes5 = await request(app)
      .get(serializeGetForm(form5b, doneButton(form5b)))
      .set("Cookie", formatCookieHeader(cookies));
    expect(applyRes5.status).toBe(303);
    Object.assign(cookies, extractCookies(applyRes5.header["set-cookie"]));
    expect(cookies["morcus_inflected"]).toBe("0");
    const res5c = await request(app)
      .get(applyRes5.header["location"])
      .set("Cookie", formatCookieHeader(cookies));
    document.body.innerHTML = res5c.text;
    expect(res5c.text).not.toContain("guest-chip");
    expect(mockGetEntry).toHaveBeenLastCalledWith(
      {
        query: "rex",
        dicts: ["GAF", "GRG"],
        mode: 0,
      },
      expect.anything()
    );

    // --- Step 5: Toggle inflection back ON (`o=0` hidden + `o=1` checkbox repeated key) ---
    const form6 = settingsForm();
    const inflectCb6 =
      form6.querySelector<HTMLInputElement>("#toggle-inflected")!;
    expect(inflectCb6.checked).toBe(false);
    inflectCb6.checked = true;
    const step5Url = serializeGetForm(form6, doneButton(form6));
    // Verify the serialized form genuinely carries the repeated `o=0&o=1` wire format
    expect(step5Url).toContain("o=0");
    expect(step5Url).toContain("o=1");

    const applyRes6 = await request(app)
      .get(step5Url)
      .set("Cookie", formatCookieHeader(cookies));
    expect(applyRes6.status).toBe(303);
    Object.assign(cookies, extractCookies(applyRes6.header["set-cookie"]));
    const res6 = await request(app)
      .get(applyRes6.header["location"])
      .set("Cookie", formatCookieHeader(cookies));
    expect(res6.status).toBe(200);
    expect(mockGetEntry).toHaveBeenLastCalledWith(
      {
        query: "rex",
        dicts: ["GAF", "GRG"],
        mode: 1,
      },
      expect.anything()
    );
    document.body.innerHTML = res6.text;
    expect(
      document.body.querySelector<HTMLInputElement>("#toggle-inflected")!
        .checked
    ).toBe(true);
  });

  test("Enter in the search box never saves: the search form has no save submitter", async () => {
    const res = await request(app).get("/dicts?q=amo");
    document.body.innerHTML = res.text;
    const search =
      document.body.querySelector<HTMLFormElement>("form.search-form")!;
    expect(search.querySelector('[name="save"]')).toBeNull();
    expect(search.contains(settingsForm())).toBe(false);
    expect(serializeGetForm(search)).not.toContain("save=");
  });

  test("parameter precedence ladder: ?dict= overrides ?d= bitmask, which overrides ?in=, which overrides cookie", async () => {
    const lsBitmask = encodeDictBitmask(["L&S"]);
    const grgBitmask = encodeDictBitmask(["GRG"]);

    // 1. `dict` checkbox param beats `d` bitmask and cookie
    await request(app)
      .get(`/dicts?q=amo&dict=GAF&d=${lsBitmask}`)
      .set("Cookie", "morcus_d=g"); // g = S&H (16)
    expect(mockGetEntry).toHaveBeenLastCalledWith(
      {
        query: "amo",
        dicts: ["GAF"],
        mode: 1,
      },
      expect.anything()
    );

    // 2. `d` bitmask beats legacy `in` and cookie
    await request(app)
      .get(`/dicts?q=amo&d=${grgBitmask}&in=L%26S`)
      .set("Cookie", "morcus_d=g"); // g = S&H (16)
    expect(mockGetEntry).toHaveBeenLastCalledWith(
      {
        query: "amo",
        dicts: ["GRG"],
        mode: 1,
      },
      expect.anything()
    );

    // 3. Single checkbox selection (`?dict=GAF`) is preserved as a 1-element array
    const singleRes = await request(app).get("/dicts?q=amo&dict=GAF");
    document.body.innerHTML = singleRes.text;
    expect(getRenderedDictTitles(document.body)).toEqual(["Gaffiot"]);
    expect(getCheckedDictKeys(document.body)).toEqual(["GAF"]);
  });

  test("DICT-07: leading/trailing homograph numbers (?q=1+ab, ?q=ab+1) and repeated q params (?q=amo&q=rex) normalize cleanly", async () => {
    const res1 = await request(app).get("/dicts?q=1+ab&d=2&o=1");
    expect(res1.status).toBe(200);
    expect(mockGetEntry).toHaveBeenLastCalledWith(
      {
        query: "ab",
        dicts: ["GAF"],
        mode: 1,
      },
      expect.anything()
    );
    document.body.innerHTML = res1.text;
    expect(
      document.body.querySelector<HTMLInputElement>("#dict-q")!.value
    ).toBe("ab");

    const res2 = await request(app).get("/dicts?q=amo&q=rex");
    expect(res2.status).toBe(200);
    expect(mockGetEntry).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: "amo" }),
      expect.anything()
    );
  });

  test("DICT-08: invalid o=-1 and d=0 / d=zzzz fall back to saved/default settings without triggering Guest Mode", async () => {
    const res = await request(app)
      .get("/dicts?q=amo&o=-1&d=0")
      .set("Cookie", "morcus_d=2; morcus_inflected=0");
    expect(res.status).toBe(200);
    expect(mockGetEntry).toHaveBeenLastCalledWith(
      {
        query: "amo",
        dicts: ["GAF"],
        mode: 0,
      },
      expect.anything()
    );
    document.body.innerHTML = res.text;
    expect(res.text).not.toContain("Using link settings");
    const searchForm =
      document.body.querySelector<HTMLFormElement>("form.search-form")!;
    expect(searchForm.dataset.d).toBe("2");
    expect(searchForm.dataset.o).toBe("0");
    expect(
      searchForm.querySelector<HTMLInputElement>('input[name="d"]')!.value
    ).toBe("2");
    expect(
      searchForm.querySelector<HTMLInputElement>('input[name="o"]')!.value
    ).toBe("0");

    const resZ = await request(app)
      .get("/dicts?q=amo&d=zzzz")
      .set("Cookie", "morcus_d=2");
    expect(resZ.status).toBe(200);
    expect(resZ.text).not.toContain("Using link settings");
    expect(mockGetEntry).toHaveBeenLastCalledWith(
      {
        query: "amo",
        dicts: ["GAF"],
        mode: 1,
      },
      expect.anything()
    );
  });

  test("property check: all 512 subsets of LatinDict.AVAILABLE round-trip through bitmask and param resolution", () => {
    const allKeys = LatinDict.AVAILABLE.map((d) => d.key);
    expect(allKeys.length).toBe(9);

    const totalSubsets = 1 << allKeys.length; // 512
    for (let mask = 0; mask < totalSubsets; mask++) {
      const subset = allKeys.filter((_, i) => (mask & (1 << i)) !== 0);
      const encoded = encodeDictBitmask(subset);
      const decoded = decodeDictBitmask(encoded);

      if (subset.length > 0) {
        expect(decoded).toEqual(subset);
        expect(resolveDictParams({ dictParam: subset })).toEqual(subset);
        expect(resolveDictParams({ bitmaskParam: encoded })).toEqual(subset);
      } else {
        expect(encoded).toBe("0");
        expect(decoded).toBeNull();
      }
    }
  });
});
