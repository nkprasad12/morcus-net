/**
 * Macronizer No-JS POST form round-trip conformance. Helpers and approach:
 * `testing/form_roundtrip.ts`.
 *
 * @jest-environment jsdom
 */

import express from "express";
import request from "supertest";
import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import { createV2Router } from "@/web/ui/app_router.server";
import {
  CANNED_MACRONIZER_TEXT,
  fakeMacronizerEngine,
} from "@/web/ui/testing/fake_macronizer_engine";
import { serializePostForm } from "@/web/ui/testing/form_roundtrip";

jest.mock("@/web/ui/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/ui/reader/reader_loader.server", () =>
  jest.requireActual("@/web/ui/testing/mock_reader_loader")
);

describe("Macronizer form round-trip conformance", () => {
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
        macronizer: fakeMacronizerEngine(),
      })
    );
  });

  test("Macronize form and Apply form round-trip radio choices and manual vowel edits across submissions", async () => {
    const landing = await request(app).get("/macronizer");
    expect(landing.status).toBe(200);
    document.body.innerHTML = landing.text;

    const inputForm =
      document.body.querySelector<HTMLFormElement>("form#mac-form")!;
    expect(inputForm).not.toBeNull();
    const textarea = inputForm.querySelector<HTMLTextAreaElement>(
      'textarea[name="text"]'
    )!;
    textarea.value = CANNED_MACRONIZER_TEXT;
    expect(inputForm.checkValidity()).toBe(true);

    const post1 = serializePostForm(inputForm);
    expect(post1.action).toBe("/macronizer");

    const results = await request(app)
      .post(post1.action)
      .type("form")
      .send(post1.body);
    expect(results.status).toBe(200);
    document.body.innerHTML = results.text;

    // Select radio w1=1 (mālum) and check vowel m6=2 on unknown word Brundisium
    const radioW1Opt1 = document.body.querySelector<HTMLInputElement>(
      'input[type="radio"][name="w1"][value="1"]'
    )!;
    expect(radioW1Opt1).not.toBeNull();
    radioW1Opt1.checked = true;

    const vowelM6Pos2 = document.body.querySelector<HTMLInputElement>(
      'input[type="checkbox"][name="m6"][value="2"]'
    )!;
    expect(vowelM6Pos2).not.toBeNull();
    vowelM6Pos2.checked = true;

    const applyForm =
      document.body.querySelector<HTMLFormElement>("form#mac-apply")!;
    expect(applyForm).not.toBeNull();

    const post2 = serializePostForm(applyForm);
    expect(post2.action).toBe("/macronizer/apply");

    const applied = await request(app)
      .post(post2.action)
      .type("form")
      .send(post2.body);
    expect(applied.status).toBe(200);
    document.body.innerHTML = applied.text;

    const word1 = document.body.querySelector<HTMLElement>("#t1")!;
    expect(word1.textContent).toBe("m\u0101lum");
    expect(word1.classList.contains("mac-chosen")).toBe(true);

    const word6 = document.body.querySelector<HTMLElement>("#t6")!;
    expect(word6.textContent).toBe("Br\u016Bndisium");
    expect(word6.classList.contains("mac-chosen")).toBe(true);

    const copybox =
      document.body.querySelector<HTMLTextAreaElement>("#mac-plain-out")!;
    expect(copybox.value).toContain("m\u0101lum");
    expect(copybox.value).toContain("Br\u016Bndisium");

    // Re-submitting the re-rendered Apply form without changes is stable
    const applyForm2 =
      document.body.querySelector<HTMLFormElement>("form#mac-apply")!;
    const post3 = serializePostForm(applyForm2);
    const appliedAgain = await request(app)
      .post(post3.action)
      .type("form")
      .send(post3.body);
    expect(appliedAgain.status).toBe(200);
    document.body.innerHTML = appliedAgain.text;

    expect(document.body.querySelector("#t1")?.textContent).toBe("m\u0101lum");
    expect(document.body.querySelector("#t6")?.textContent).toBe(
      "Br\u016Bndisium"
    );
  });
});
