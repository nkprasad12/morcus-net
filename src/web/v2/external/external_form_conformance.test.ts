/**
 * External reader No-JS form round-trip conformance. Helpers and approach:
 * `testing/form_roundtrip.ts`.
 *
 * @jest-environment jsdom
 */

import express from "express";
import request from "supertest";
import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import { createV2Router } from "@/web/v2/v2_router.server";
import {
  fakeCorpusEngine,
  fakeResult,
} from "@/web/v2/testing/fake_corpus_engine";
import { serializeGetForm } from "@/web/v2/testing/form_roundtrip";

jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/v2/reader/reader_loader.server", () =>
  jest.requireActual("@/web/v2/testing/mock_reader_loader")
);

describe("External reader form round-trip conformance", () => {
  let app: express.Express;

  beforeEach(() => {
    document.body.innerHTML = "";
    const dict: Partial<FusedDictionary> = {
      getEntry: jest.fn().mockResolvedValue({}),
      getCompletions: jest.fn().mockResolvedValue({}),
    };
    app = express();
    app.use(
      "/",
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

  test("External Reader No-JS form submits URL and line mode cleanly without paste fields blocking validity", async () => {
    const res = await request(app).get("/externalReader");
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
      "/externalReader?url=thelatinlibrary.com%2Fcicero%2Fcat1.shtml&lines=verse"
    );
  });
});
