/**
 * Corpus No-JS form round-trip conformance. Helpers and approach:
 * `testing/form_roundtrip.ts`.
 *
 * @jest-environment jsdom
 */

import express from "express";
import request from "supertest";
import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import { createV2Router } from "@/web/v2/v2_router.server";
import {
  CORPUS_TEST_AUTHORS,
  fakeCorpusEngine,
  fakeResult,
} from "@/web/v2/testing/fake_corpus_engine";
import { serializeGetForm } from "@/web/v2/testing/form_roundtrip";

jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/v2/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/v2/reader/reader_loader.server", () =>
  jest.requireActual("@/web/v2/testing/mock_reader_loader")
);

jest.mock("@/web/v2/corpus/corpus_query.server", () => ({
  ...jest.requireActual("@/web/v2/corpus/corpus_query.server"),
  loadCorpusAuthors: () => Promise.resolve(CORPUS_TEST_AUTHORS),
}));

describe("Corpus form round-trip conformance", () => {
  let app: express.Express;

  beforeEach(() => {
    document.body.innerHTML = "";
    const dict: Partial<FusedDictionary> = {
      getEntry: jest.fn().mockResolvedValue({}),
      getCompletions: jest.fn().mockResolvedValue({}),
    };
    app = express();
    app.use(
      "/v2",
      createV2Router(dict as FusedDictionary, {
        corpus: fakeCorpusEngine(() =>
          fakeResult({
            resultStats: { estimatedResults: 200 },
            nextPage: { resultId: 1, resultIndex: 50, candidateIndex: 0 },
          })
        ),
      })
    );
  });

  test("Corpus No-JS form round-trips its settings, and the pager link keeps them", async () => {
    const landing = await request(app).get("/v2/corpus");
    expect(landing.status).toBe(200);
    document.body.innerHTML = landing.text;

    const form =
      document.body.querySelector<HTMLFormElement>("form.corpus-form")!;
    form.querySelector<HTMLInputElement>('[name="q"]')!.value =
      "#Caesar bellum";
    form.querySelector<HTMLInputElement>('[name="contextLen"]')!.value = "7";
    form.querySelector<HTMLInputElement>('[name="strictMode"]')!.checked = true;
    expect(form.checkValidity()).toBe(true);

    const url = serializeGetForm(form);
    expect(url).toBe(
      "/v2/corpus?q=%23Caesar+bellum&contextLen=7&pageSize=50&strictMode=1"
    );

    const results = await request(app).get(url);
    expect(results.status).toBe(200);
    document.body.innerHTML = results.text;

    // The re-rendered form keeps every setting, so submitting again is stable.
    const form2 =
      document.body.querySelector<HTMLFormElement>("form.corpus-form")!;
    expect(serializeGetForm(form2)).toBe(url);

    // The Next link is the same URL plus the cursor.
    const next = document.body.querySelector<HTMLAnchorElement>(".corpus-next");
    expect(next?.getAttribute("href")).toBe(`${url}&cursor=1-50-0`);
  });
});
