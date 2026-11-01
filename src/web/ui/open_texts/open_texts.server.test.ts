/**
 * Unit tests for the Open Texts server renderers (`open_texts.server.ts`) and
 * Express route handler (`open_texts_routes.server.ts`).
 */

import express from "express";
import { JSDOM } from "jsdom";
import request from "supertest";
import { SEED_OPEN_TEXTS_CATALOG_BUNDLE } from "@/common/open_texts/catalog_loader";
import {
  OPEN_TEXT_READER_ROLES,
  type OpenTextReaderPayload,
} from "@/web/ui/open_texts/open_texts_contract.common";
import {
  renderOpenTextReaderPageHtml,
  renderOpenTextsCatalogContentHtml,
  renderOpenTextsCatalogPageHtml,
} from "@/web/ui/open_texts/open_texts.server";
import { createOpenTextsRoutes } from "@/web/ui/open_texts/open_texts_routes.server";

jest.mock("@/web/ui/shell/asset_manifest.server", () => {
  const actual = jest.requireActual("@/web/ui/shell/asset_manifest.server");
  return {
    ...actual,
    getV2AssetHref: (name: string) => `/assets/${name}`,
    getV2CriticalCss: () => "body{background-color:var(--bg)}",
    getV2CriticalJs: () => "/* critical js */",
  };
});

describe("open_texts.server", () => {
  it("renders the three-tab Texts bar with Open Texts active and the uncurated notice", () => {
    const html = renderOpenTextsCatalogPageHtml(SEED_OPEN_TEXTS_CATALOG_BUNDLE);

    expect(html).toContain('<nav class="texts-tabs" aria-label="Texts">');
    expect(html).toContain(
      '<a href="/opentexts" class="texts-tab active" aria-current="page" title="Uncurated"'
    );
    expect(html).toMatch(/<span class="texts-tab-label">Open Texts<\/span\s*>/);
    expect(html).toContain('<aside class="open-texts-notice"');
    expect(html).toContain("<strong>Uncurated.</strong>");
    expect(html).not.toContain("open-texts-notice-dot");
    expect(html).toContain(
      'placeholder="Search by author or work (e.g. Ambrosius, Augustine, Epistulae)..."'
    );
    expect(html).toContain(
      '<meta name="description" content="Browse uncurated Latin texts from various corpora.">'
    );
    // `external.js` registers <morcus-open-texts-view>.
    expect(html).toContain("/assets/common.js");
    expect(html).toContain("/assets/reader.js");
    expect(html).toContain("/assets/external.js");
  });

  it("renders Author -> Works grouped rows, source badges, period chips, and Decision #19 partialCoverage links", () => {
    const html = renderOpenTextsCatalogContentHtml(
      SEED_OPEN_TEXTS_CATALOG_BUNDLE
    );

    // Author headings
    expect(html).toContain("Ambrosius");
    expect(html).toContain("Augustinus");
    expect(html).toContain("Apicius");

    // Work links
    expect(html).toContain(
      'href="/opentexts?open=pl%2Fstoa0022.stoa001.opp-lat1"'
    );
    expect(html).toContain("De Officiis Ministrorum Libri Tres");

    // Period chips + source badges; no volume chips (e.g. "PL 16").
    expect(html).not.toContain("PL 16");
    expect(html).toContain(
      '<span class="open-texts-meta-chip">Patristic</span>'
    );
    expect(html).toContain(
      '<span class="open-texts-source-badge open-texts-source-pl">Patrologia Latina</span>'
    );
    expect(html).toContain(
      '<span class="open-texts-source-badge open-texts-source-ll">The Latin Library</span>'
    );

    // Decision #19 partial coverage notice & Library link
    expect(html).toContain("open-texts-partial-note");
    expect(html).toContain(
      "Books 1–10 are in the curated Library; this Open Text also includes the Excerpta a Vinidario."
    );
    expect(html).toContain('href="/work/apicius/de_re_coquinaria"');
  });

  it("renders client-side filter controls with no GET form, and an honest No-JS note", () => {
    const doc = new JSDOM(
      renderOpenTextsCatalogContentHtml(SEED_OPEN_TEXTS_CATALOG_BUNDLE)
    ).window.document;
    const view = doc.querySelector("morcus-open-texts-view")!;
    expect(view).not.toBeNull();
    expect(view.querySelector("form")).toBeNull();

    const note = view.querySelector(".open-texts-nojs-note")!;
    expect(note.hasAttribute("data-nojs-only")).toBe(true);
    expect(note.textContent).toContain("requires JavaScript");

    // Controls, summary and list only work (and only show) with JS.
    for (const sel of [
      ".open-texts-search-form",
      ".open-texts-summary-bar",
      ".open-texts-main",
    ]) {
      expect(view.querySelector(sel)?.hasAttribute("data-js-only")).toBe(true);
    }

    const input = view.querySelector<HTMLInputElement>(
      "#open-texts-search-input"
    )!;
    expect(input.hasAttribute("name")).toBe(false);

    const sourcePills = Array.from(
      view.querySelectorAll<HTMLButtonElement>("[data-source-filter]")
    );
    expect(sourcePills.map((p) => p.dataset.sourceFilter)).toEqual([
      "all",
      "patrologia_latina",
      "thelatinlibrary",
    ]);
    const periodPills = Array.from(
      view.querySelectorAll<HTMLButtonElement>("[data-period-filter]")
    );
    expect(periodPills.map((p) => p.dataset.periodFilter)).toEqual([
      "all",
      "classical",
      "late_antique",
      "patristic",
      "medieval",
      "neolatin",
    ]);
    for (const pill of [...sourcePills, ...periodPills]) {
      expect(pill.type).toBe("button");
      const isAll = pill.textContent!.startsWith("All ");
      expect(pill.classList.contains("active")).toBe(isAll);
      expect(pill.getAttribute("aria-pressed")).toBe(String(isAll));
    }

    expect(
      view.querySelector<HTMLButtonElement>('[data-role="open-texts-reset"]')
        ?.hidden
    ).toBe(true);
    expect(
      view.querySelector<HTMLElement>("#open-texts-empty-state")?.hidden
    ).toBe(true);
  });

  it("renders each author as a collapsible card, open by default", () => {
    const doc = new JSDOM(
      renderOpenTextsCatalogContentHtml(SEED_OPEN_TEXTS_CATALOG_BUNDLE)
    ).window.document;
    const groups = Array.from(
      doc.querySelectorAll<HTMLElement>(".open-texts-author-group")
    );
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group.tagName).toBe("DETAILS");
      expect(group.hasAttribute("open")).toBe(true);
      expect(group.id).toMatch(/^author-/);
      const summary = group.firstElementChild!;
      expect(summary.tagName).toBe("SUMMARY");
      expect(summary.classList.contains("open-texts-author-header")).toBe(true);
      expect(summary.querySelector(".open-texts-author-name")).not.toBeNull();
      expect(summary.querySelector(".open-texts-author-count")).not.toBeNull();
      const chevron = summary.querySelector(".author-card-chevron")!;
      expect(chevron.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("tags each work row with its source, period and lowercased volume label", () => {
    const doc = new JSDOM(
      renderOpenTextsCatalogContentHtml(SEED_OPEN_TEXTS_CATALOG_BUNDLE)
    ).window.document;
    const items = Array.from(
      doc.querySelectorAll<HTMLElement>(".open-texts-work-item")
    );
    expect(items).toHaveLength(SEED_OPEN_TEXTS_CATALOG_BUNDLE.entries.length);

    const link = doc.querySelector(
      'a[href="/opentexts?open=pl%2Fstoa0022.stoa001.opp-lat1"]'
    )!;
    const row = link.closest<HTMLElement>(".open-texts-work-item")!;
    expect(row.dataset.source).toBe("patrologia_latina");
    expect(row.dataset.period).toBe("patristic");
    expect(row.dataset.volume).toBe("pl 16");

    // The "(filtered from N total)" note is hidden until the user filters.
    const count = doc.querySelector('[data-role="open-texts-count"]')!;
    count.querySelectorAll("[hidden]").forEach((el) => el.remove());
    expect(count.textContent!.replace(/\s+/g, " ").trim()).toBe(
      `Showing ${items.length} works across ${
        doc.querySelectorAll(".open-texts-author-group").length
      } authors`
    );
  });

  it("renders the reader host page with common.js, reader.js, external.js, and dict.js prefetch", () => {
    const entry = SEED_OPEN_TEXTS_CATALOG_BUNDLE.entries[0];
    const sourceMeta = SEED_OPEN_TEXTS_CATALOG_BUNDLE.sources[entry.source]!;
    const payload: OpenTextReaderPayload = {
      entry,
      sourceMeta,
      initialSection: "2",
      backHref: "/opentexts",
    };

    const html = renderOpenTextReaderPageHtml(payload);
    expect(html).toContain("<morcus-open-text-reader");
    expect(html).toContain(`data-open-text-id="${entry.id}"`);
    expect(html).toContain(`data-commit="${sourceMeta.commit}"`);
    expect(html).toContain(`data-role="${OPEN_TEXT_READER_ROLES.payload}"`);
    expect(html).toContain('"initialSection":"2"');
    expect(html).toContain("/assets/common.js");
    expect(html).toContain("/assets/reader.js");
    expect(html).toContain("/assets/external.js");
    expect(html).toContain('<link rel="prefetch" href="/assets/dict.js">');
  });
});

describe("createOpenTextsRoutes", () => {
  function buildApp() {
    const app = express();
    app.use(
      createOpenTextsRoutes({
        bundle: SEED_OPEN_TEXTS_CATALOG_BUNDLE,
      })
    );
    return app;
  }

  it("serves GET /opentexts catalog listing", async () => {
    const res = await request(buildApp()).get("/opentexts");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Ambrosius");
    expect(res.text).toContain("De Officiis Ministrorum Libri Tres");
  });

  it("ignores filter query params on GET /opentexts (filtering is client-side)", async () => {
    const res = await request(buildApp()).get(
      "/opentexts?source=thelatinlibrary&period=late_antique"
    );
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="author-apicius"');
    expect(res.text).toContain('id="author-ambrosius"');
  });

  it("serves GET /opentexts?open=<id> with reader host and X-Robots-Tag", async () => {
    const res = await request(buildApp()).get(
      "/opentexts?open=pl/stoa0022.stoa001.opp-lat1&page=3"
    );
    expect(res.status).toBe(200);
    expect(res.headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(res.text).toContain("<morcus-open-text-reader");
    expect(res.text).toContain('"initialSection":"3"');
  });

  it("accepts ?section= as an alias for ?page= on GET /opentexts?open=<id>", async () => {
    const res = await request(buildApp()).get(
      "/opentexts?open=pl/stoa0022.stoa001.opp-lat1&section=4"
    );
    expect(res.status).toBe(200);
    expect(res.text).toContain('"initialSection":"4"');
  });

  it("returns 404 when GET /opentexts?open=<id> specifies an unknown work id", async () => {
    const res = await request(buildApp()).get(
      "/opentexts?open=pl/does_not_exist"
    );
    expect(res.status).toBe(404);
    expect(res.text).toContain("pl/does_not_exist");
  });
});
