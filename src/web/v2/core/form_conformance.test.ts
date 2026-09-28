/**
 * JSDOM Form Round-Trip & Parameter Precedence Conformance Suite
 * (PE RFC Review §2.3 / Phase 2.3; CODE_HEALTH.md Phase 7 "Close the No-JS testing gap").
 *
 * Bridges the gap between unit SSR string assertions and slow browser E2E tests:
 * renders real SSR responses into JSDOM, mutates form controls as a user would,
 * serializes the whole `<form>` via `new FormData(form)`, and submits the
 * resulting query parameters straight to the Express V2 router via supertest.
 *
 * Key rules enforced here (see CODE_HEALTH.md):
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
import { XmlNode } from "@/common/xml/xml_node";
import {
  decodeDictBitmask,
  encodeDictBitmask,
} from "@/web/v2/dict/dict_bitmask.common";
import { resolveDictParams } from "@/web/v2/dict/dict_selection.common";
import { createV2Router } from "@/web/v2/v2_router.server";

jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2BuildDir: () => "build/v2",
  getV2AssetHref: (name: string) => `/v2/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/v2/reader/reader_loader.server", () =>
  jest.requireActual("@/web/v2/testing/mock_reader_loader")
);

/**
 * Serializes a `<form>` in JSDOM into a GET request URL using `new FormData(form)`,
 * matching native browser form submission (including hidden inputs and repeated keys).
 */
function serializeGetForm(form: HTMLFormElement): string {
  const action = form.getAttribute("action") || "/v2/dicts";
  const formData = new FormData(form);
  const params = new URLSearchParams();
  formData.forEach((value, key) => {
    if (typeof value === "string") {
      params.append(key, value);
    }
  });
  const qs = params.toString();
  return qs ? `${action}?${qs}` : action;
}

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

describe("JSDOM Form Round-Trip & Parameter Precedence Conformance", () => {
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
              entry: new XmlNode("span", [["class", "lsOrth"]], ["test"]),
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
    app.use("/v2", createV2Router(mockFusedDict as FusedDictionary));
  });

  test("multi-step No-JS dictionary journey: select GAF+GRG -> search again -> reload from cookie -> toggle inflection off and back on", async () => {
    const cookies: Record<string, string> = {};

    // --- Step 1: Load initial search page, select ONLY Gaffiot (GAF) and Georges (GRG) ---
    const res1 = await request(app).get("/v2/dicts?q=amo");
    expect(res1.status).toBe(200);
    document.body.innerHTML = res1.text;

    const form1 =
      document.body.querySelector<HTMLFormElement>("form.search-form")!;
    expect(form1).not.toBeNull();

    // Untick all dictionaries except GAF and GRG
    for (const cb of Array.from(
      form1.querySelectorAll<HTMLInputElement>("input.dict-checkbox")
    )) {
      cb.checked = cb.value === "GAF" || cb.value === "GRG";
    }

    const step1Url = serializeGetForm(form1);
    const res2 = await request(app).get(step1Url);
    expect(res2.status).toBe(200);
    Object.assign(cookies, extractCookies(res2.header["set-cookie"]));

    expect(mockGetEntry).toHaveBeenLastCalledWith({
      query: "amo",
      dicts: ["GAF", "GRG"],
      mode: 1,
    });

    document.body.innerHTML = res2.text;
    expect(getRenderedDictTitles(document.body)).toEqual([
      "Gaffiot",
      "Georges",
    ]);
    expect(getCheckedDictKeys(document.body)).toEqual(["GAF", "GRG"]);

    // --- Step 2: Search a new word ("gladius") using the re-rendered form ---
    const form2 =
      document.body.querySelector<HTMLFormElement>("form.search-form")!;
    const qInput2 = form2.querySelector<HTMLInputElement>('input[name="q"]')!;
    qInput2.value = "gladius";

    const res3 = await request(app)
      .get(serializeGetForm(form2))
      .set("Cookie", formatCookieHeader(cookies));
    expect(res3.status).toBe(200);
    Object.assign(cookies, extractCookies(res3.header["set-cookie"]));

    expect(mockGetEntry).toHaveBeenLastCalledWith({
      query: "gladius",
      dicts: ["GAF", "GRG"],
      mode: 1,
    });
    document.body.innerHTML = res3.text;
    expect(getRenderedDictTitles(document.body)).toEqual([
      "Gaffiot",
      "Georges",
    ]);
    expect(getCheckedDictKeys(document.body)).toEqual(["GAF", "GRG"]);

    // --- Step 3: Navigate to `/v2/dicts?q=rex` with cookie only (no dict params in URL) ---
    const res4 = await request(app)
      .get("/v2/dicts?q=rex")
      .set("Cookie", formatCookieHeader(cookies));
    expect(res4.status).toBe(200);
    expect(mockGetEntry).toHaveBeenLastCalledWith({
      query: "rex",
      dicts: ["GAF", "GRG"],
      mode: 1,
    });
    document.body.innerHTML = res4.text;
    expect(getRenderedDictTitles(document.body)).toEqual([
      "Gaffiot",
      "Georges",
    ]);
    expect(getCheckedDictKeys(document.body)).toEqual(["GAF", "GRG"]);

    // --- Step 4: Toggle inflection OFF (`#toggle-inflected` unchecked -> only hidden `o=0` submits) ---
    const form4 =
      document.body.querySelector<HTMLFormElement>("form.search-form")!;
    const inflectCb4 =
      form4.querySelector<HTMLInputElement>("#toggle-inflected")!;
    expect(inflectCb4.checked).toBe(true);
    inflectCb4.checked = false;

    const res5 = await request(app)
      .get(serializeGetForm(form4))
      .set("Cookie", formatCookieHeader(cookies));
    expect(res5.status).toBe(200);
    Object.assign(cookies, extractCookies(res5.header["set-cookie"]));

    expect(mockGetEntry).toHaveBeenLastCalledWith({
      query: "rex",
      dicts: ["GAF", "GRG"],
      mode: 0,
    });
    document.body.innerHTML = res5.text;
    const form5 =
      document.body.querySelector<HTMLFormElement>("form.search-form")!;
    const inflectCb5 =
      form5.querySelector<HTMLInputElement>("#toggle-inflected")!;
    expect(inflectCb5.checked).toBe(false);
    expect(getCheckedDictKeys(document.body)).toEqual(["GAF", "GRG"]);

    // --- Step 5: Toggle inflection back ON (`o=0` hidden + `o=1` checkbox repeated key) ---
    inflectCb5.checked = true;
    const step5Url = serializeGetForm(form5);
    // Verify the serialized form genuinely carries the repeated `o=0&o=1` wire format
    expect(step5Url).toContain("o=0");
    expect(step5Url).toContain("o=1");

    const res6 = await request(app)
      .get(step5Url)
      .set("Cookie", formatCookieHeader(cookies));
    expect(res6.status).toBe(200);
    expect(mockGetEntry).toHaveBeenLastCalledWith({
      query: "rex",
      dicts: ["GAF", "GRG"],
      mode: 1,
    });
    document.body.innerHTML = res6.text;
    expect(
      document.body.querySelector<HTMLInputElement>("#toggle-inflected")!
        .checked
    ).toBe(true);
  });

  test("parameter precedence ladder: ?dict= overrides ?d= bitmask, which overrides ?in=, which overrides cookie", async () => {
    const lsBitmask = encodeDictBitmask(["L&S"]);
    const grgBitmask = encodeDictBitmask(["GRG"]);

    // 1. `dict` checkbox param beats `d` bitmask and cookie
    await request(app)
      .get(`/v2/dicts?q=amo&dict=GAF&d=${lsBitmask}`)
      .set("Cookie", "morcus_dicts=SH");
    expect(mockGetEntry).toHaveBeenLastCalledWith({
      query: "amo",
      dicts: ["GAF"],
      mode: 1,
    });

    // 2. `d` bitmask beats legacy `in` and cookie
    await request(app)
      .get(`/v2/dicts?q=amo&d=${grgBitmask}&in=L%26S`)
      .set("Cookie", "morcus_dicts=SH");
    expect(mockGetEntry).toHaveBeenLastCalledWith({
      query: "amo",
      dicts: ["GRG"],
      mode: 1,
    });

    // 3. Single checkbox selection (`?dict=GAF`) is preserved as a 1-element array
    const singleRes = await request(app).get("/v2/dicts?q=amo&dict=GAF");
    document.body.innerHTML = singleRes.text;
    expect(getRenderedDictTitles(document.body)).toEqual(["Gaffiot"]);
    expect(getCheckedDictKeys(document.body)).toEqual(["GAF"]);
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

  test("External Reader No-JS form submits URL and line mode cleanly without paste fields blocking validity", async () => {
    const res = await request(app).get("/v2/externalReader");
    expect(res.status).toBe(200);
    document.body.innerHTML = res.text;

    const form =
      document.body.querySelector<HTMLFormElement>("form#external-form")!;
    expect(form).not.toBeNull();

    // The JS-only paste textarea has `required`, so it must be `disabled` in SSR
    // or a No-JS browser would block submission of the URL form.
    const pasteTextarea =
      form.querySelector<HTMLTextAreaElement>("#external-text")!;
    expect(pasteTextarea.disabled).toBe(true);

    const urlInput = form.querySelector<HTMLInputElement>("#external-url")!;
    urlInput.value = "thelatinlibrary.com/cicero/cat1.shtml";

    const verseRadio = form.querySelector<HTMLInputElement>(
      'input[name="lines"][value="verse"]'
    )!;
    verseRadio.checked = true;

    expect(form.checkValidity()).toBe(true);

    const serialized = serializeGetForm(form);
    expect(serialized).toBe(
      "/v2/externalReader?url=thelatinlibrary.com%2Fcicero%2Fcat1.shtml&lines=verse"
    );
  });
});
