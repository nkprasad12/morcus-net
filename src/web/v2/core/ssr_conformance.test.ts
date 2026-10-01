/**
 * Whole-site SSR conformance checks: the ones that need every page at once.
 * The per-page checks (tree fingerprint, No-JS controls, addresses, and the
 * failed-owner sweep) run in each feature's `*_ssr_conformance.test.ts`, via
 * `testing/ssr_conformance_harness.ts`.
 *
 * @jest-environment jsdom
 */

import "@/web/v2/v2_elements.client";
import fs from "fs";
import path from "path";
import { getRegisteredElementTags } from "@/web/v2/core/base_element.client";
import {
  PAGE_SETUPS,
  buildSsrFixtures,
  installMatchMediaStub,
  type SsrFixture,
} from "@/web/v2/testing/ssr_fixtures";

jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/v2/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/v2/reader/reader_loader.server", () =>
  jest.requireActual("@/web/v2/testing/mock_reader_loader")
);

describe("SSR conformance across every page", () => {
  const fixtures: SsrFixture[] = [];

  beforeAll(async () => {
    installMatchMediaStub();
    fixtures.push(...(await buildSsrFixtures()));
  });

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(""),
      json: () => Promise.resolve([]),
    } as unknown as Response);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    jest.restoreAllMocks();
  });

  test("every registered custom element is exercised by the real SSR fixtures", () => {
    const seenTags = new Set<string>();
    for (const fixture of fixtures) {
      document.body.innerHTML = fixture.html;
      for (const tag of getRegisteredElementTags()) {
        if (document.body.querySelector(tag)) {
          seenTags.add(tag);
        }
      }
      document.body.innerHTML = "";
    }

    const registered = Array.from(getRegisteredElementTags()).sort();
    expect(Array.from(seenTags).sort()).toEqual(registered);
  });

  test("the failed-owner sweep runs every global setup the entry files start", () => {
    // The sweep must see the same document-level listeners as a real page.
    expect(Object.keys(PAGE_SETUPS).sort()).toEqual(setupsStartedByEntries());
  });
});

/**
 * `setupX()` calls in `*_entry.client.ts` files. boot_conformance.test.ts
 * guarantees entries only start setups from `onPageReady`, so a plain scan
 * is enough.
 */
function setupsStartedByEntries(): string[] {
  const names = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith("_entry.client.ts")) {
        const src = fs.readFileSync(full, "utf8");
        for (const m of src.matchAll(/\b(setup[A-Z]\w*)\s*\(/g)) {
          names.add(m[1]);
        }
      }
    }
  };
  walk(path.resolve(__dirname, ".."));
  return [...names].sort();
}
