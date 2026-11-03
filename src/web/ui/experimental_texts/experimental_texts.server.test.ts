/**
 * Unit tests for the Experimental Texts server renderers (`experimental_texts.server.ts`) and
 * Express route handler (`experimental_texts_routes.server.ts`).
 */

import express from "express";
import { JSDOM } from "jsdom";
import request from "supertest";
import { EXPERIMENTAL_TEXTS_TEST_CATALOG } from "@/web/ui/experimental_texts/experimental_texts_test_catalog";
import {
  EXPERIMENTAL_TEXT_READER_ROLES,
  type ExperimentalTextReaderPayload,
} from "@/web/ui/experimental_texts/experimental_texts_contract.common";
import {
  renderExperimentalTextReaderPageHtml,
  renderExperimentalTextsCatalogContentHtml,
  renderExperimentalTextsCatalogPageHtml,
} from "@/web/ui/experimental_texts/experimental_texts.server";
import { createExperimentalTextsRoutes } from "@/web/ui/experimental_texts/experimental_texts_routes.server";

jest.mock("@/web/ui/shell/asset_manifest.server", () => {
  const actual = jest.requireActual("@/web/ui/shell/asset_manifest.server");
  return {
    ...actual,
    getV2AssetHref: (name: string) => `/assets/${name}`,
    getV2CriticalCss: () => "body{background-color:var(--bg)}",
    getV2CriticalJs: () => "/* critical js */",
  };
});

describe("experimental_texts.server", () => {
  it("renders the three-tab Texts bar with Experimental active and the experimental notice", () => {
    const html = renderExperimentalTextsCatalogPageHtml(
      EXPERIMENTAL_TEXTS_TEST_CATALOG
    );

    expect(html).toContain('<nav class="texts-tabs" aria-label="Texts">');
    expect(html).toContain(
      '<a href="/experimentalTexts" class="texts-tab active" aria-current="page"'
    );
    expect(html).toMatch(
      /<span class="texts-tab-label">Experimental<\/span\s*>/
    );
    expect(html).toContain('<aside class="experimental-texts-notice"');
    expect(html).toContain(
      "These texts are experimental, and are more likely to have typos or formatting quirks"
    );
    expect(html).not.toContain("experimental-texts-notice-dot");
    expect(html).toContain(
      'placeholder="Search by author or work (e.g. Ambrosius, Augustine, Epistulae)..."'
    );
    expect(html).toContain(
      '<meta name="description" content="Browse experimental Latin texts from various corpora.">'
    );
    // `external.js` registers <morcus-experimental-texts-view>.
    expect(html).toContain("/assets/common.js");
    expect(html).toContain("/assets/reader.js");
    expect(html).toContain("/assets/external.js");
  });

  it("renders Author -> Works grouped rows, source badges, period chips, and partialCoverage links", () => {
    const html = renderExperimentalTextsCatalogContentHtml(
      EXPERIMENTAL_TEXTS_TEST_CATALOG
    );

    // Author headings
    expect(html).toContain("Ambrosius Mediolanensis (Saint Ambrose)");
    expect(html).toContain("Augustine");
    expect(html).toContain("Apicius");

    // Work links
    expect(html).toContain(
      'href="/experimentalTexts?open=pl%2Fstoa0022.stoa001.opp-lat1"'
    );
    expect(html).toContain("De Officiis Ministrorum Libri Tres");

    // Period chips + source chips; no volume chips (e.g. "PL 16").
    expect(html).not.toContain("PL 16");
    expect(html).toContain(
      '<span class="experimental-texts-meta-chip">Ancient</span>'
    );
    expect(html).toContain(
      '<span class="experimental-texts-meta-chip">Patrologia Latina</span>'
    );
    expect(html).toContain(
      '<span class="experimental-texts-meta-chip">The Latin Library</span>'
    );

    // Partial coverage notice & Library link
    const apicius = EXPERIMENTAL_TEXTS_TEST_CATALOG.entries.find(
      (entry) => entry.partialCoverage !== undefined
    );
    expect(html).toContain("experimental-texts-partial-note");
    expect(html).toContain(apicius?.partialCoverage?.message);
    expect(html).toContain('href="/work/apicius/de_re_coquinaria"');
  });

  it("renders client-side filter controls with no GET form, and an honest No-JS note", () => {
    const doc = new JSDOM(
      renderExperimentalTextsCatalogContentHtml(EXPERIMENTAL_TEXTS_TEST_CATALOG)
    ).window.document;
    const view = doc.querySelector("morcus-experimental-texts-view")!;
    expect(view).not.toBeNull();
    expect(view.querySelector("form")).toBeNull();

    const note = view.querySelector(".experimental-texts-nojs-note")!;
    expect(note.hasAttribute("data-nojs-only")).toBe(true);
    expect(note.textContent).toContain("requires JavaScript");

    // Controls, summary and list only work (and only show) with JS.
    for (const sel of [
      ".experimental-texts-search-form",
      ".experimental-texts-summary-bar",
      ".experimental-texts-main",
    ]) {
      expect(view.querySelector(sel)?.hasAttribute("data-js-only")).toBe(true);
    }

    const input = view.querySelector<HTMLInputElement>(
      "#experimental-texts-search-input"
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
      "ancient",
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
      view.querySelector<HTMLButtonElement>(
        '[data-role="experimental-texts-reset"]'
      )?.hidden
    ).toBe(true);
    expect(
      view.querySelector<HTMLElement>("#experimental-texts-empty-state")?.hidden
    ).toBe(true);
  });

  it("renders each author as a collapsible card, open by default", () => {
    const doc = new JSDOM(
      renderExperimentalTextsCatalogContentHtml(EXPERIMENTAL_TEXTS_TEST_CATALOG)
    ).window.document;
    const groups = Array.from(
      doc.querySelectorAll<HTMLElement>(".experimental-texts-author-group")
    );
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group.tagName).toBe("DETAILS");
      expect(group.hasAttribute("open")).toBe(true);
      expect(group.id).toMatch(/^author-/);
      const summary = group.firstElementChild!;
      expect(summary.tagName).toBe("SUMMARY");
      expect(
        summary.classList.contains("experimental-texts-author-header")
      ).toBe(true);
      expect(
        summary.querySelector(".experimental-texts-author-name")
      ).not.toBeNull();
      // No work count: it competed with the name for room on phones.
      expect(
        summary.querySelector(".experimental-texts-author-count")
      ).toBeNull();
      expect(summary.querySelector(".author-card-count")).toBeNull();
      // The chevron is drawn in CSS (`.author-card-header::after`), so the
      // header holds just the name.
      expect(summary.children).toHaveLength(1);
      expect(summary.querySelector("svg")).toBeNull();
    }
  });

  it("tags each work row with its source, period and lowercased volume label", () => {
    const doc = new JSDOM(
      renderExperimentalTextsCatalogContentHtml(EXPERIMENTAL_TEXTS_TEST_CATALOG)
    ).window.document;
    const items = Array.from(
      doc.querySelectorAll<HTMLElement>(".experimental-texts-work-item")
    );
    expect(items).toHaveLength(EXPERIMENTAL_TEXTS_TEST_CATALOG.entries.length);

    const link = doc.querySelector(
      'a[href="/experimentalTexts?open=pl%2Fstoa0022.stoa001.opp-lat1"]'
    )!;
    const row = link.closest<HTMLElement>(".experimental-texts-work-item")!;
    expect(row.dataset.source).toBe("patrologia_latina");
    expect(row.dataset.period).toBe("ancient");
    expect(row.dataset.volume).toBe("pl 16");
    // The author's other names are searchable too. Names every work of the
    // author shares sit on the author card once, not on each row, and the
    // shown name (the card's heading) isn't repeated there.
    expect(row.hasAttribute("data-author")).toBe(false);
    expect(
      row.closest<HTMLElement>(".experimental-texts-author-group")!.dataset
        .author
    ).toBe("ambrose of milan");
    // An author without other names has no `data-author` anywhere, and a
    // work without a volume label has no `data-volume`.
    const erasmus = doc
      .querySelector(
        'a[href="/experimentalTexts?open=ll%2Ferasmus-querela-pacis"]'
      )!
      .closest<HTMLElement>(".experimental-texts-work-item")!;
    expect(erasmus.dataset.period).toBe("neolatin");
    expect(erasmus.hasAttribute("data-author")).toBe(false);
    expect(erasmus.hasAttribute("data-volume")).toBe(false);
    expect(
      erasmus
        .closest(".experimental-texts-author-group")!
        .hasAttribute("data-author")
    ).toBe(false);

    // The "(filtered from N total)" note is hidden until the user filters.
    const count = doc.querySelector('[data-role="experimental-texts-count"]')!;
    count.querySelectorAll("[hidden]").forEach((el) => el.remove());
    expect(count.textContent!.replace(/\s+/g, " ").trim()).toBe(
      `Showing ${items.length} works across ${
        doc.querySelectorAll(".experimental-texts-author-group").length
      } authors`
    );
  });

  it("renders the reader host page with common.js, reader.js, external.js, and dict.js prefetch", () => {
    const entry = EXPERIMENTAL_TEXTS_TEST_CATALOG.entries[0];
    const sourceMeta = EXPERIMENTAL_TEXTS_TEST_CATALOG.sources[entry.source]!;
    const payload: ExperimentalTextReaderPayload = {
      entry,
      sourceMeta,
      initialSection: "2",
      backHref: "/experimentalTexts",
    };

    const html = renderExperimentalTextReaderPageHtml(payload);
    expect(html).toContain("<morcus-experimental-text-reader");
    expect(html).toContain(`data-experimental-text-id="${entry.id}"`);
    expect(html).toContain(`data-commit="${sourceMeta.commit}"`);
    expect(html).toContain(
      `data-role="${EXPERIMENTAL_TEXT_READER_ROLES.payload}"`
    );
    expect(html).toContain('"initialSection":"2"');
    expect(html).toContain("/assets/common.js");
    expect(html).toContain("/assets/reader.js");
    expect(html).toContain("/assets/external.js");
    expect(html).toContain('<link rel="prefetch" href="/assets/dict.js">');
  });
});

describe("createExperimentalTextsRoutes", () => {
  function buildApp() {
    const app = express();
    app.use(
      createExperimentalTextsRoutes({
        bundle: EXPERIMENTAL_TEXTS_TEST_CATALOG,
      })
    );
    return app;
  }

  it("serves GET /experimentalTexts catalog listing", async () => {
    const res = await request(buildApp()).get("/experimentalTexts");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Ambrosius Mediolanensis (Saint Ambrose)");
    expect(res.text).toContain("De Officiis Ministrorum Libri Tres");
  });

  it("ignores filter query params on GET /experimentalTexts (filtering is client-side)", async () => {
    const res = await request(buildApp()).get(
      "/experimentalTexts?source=thelatinlibrary&period=ancient"
    );
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="author-apicius"');
    expect(res.text).toContain(
      'id="author-ambrosius-mediolanensis-saint-ambrose"'
    );
  });

  it("serves GET /experimentalTexts?open=<id> with reader host and X-Robots-Tag", async () => {
    const res = await request(buildApp()).get(
      "/experimentalTexts?open=pl/stoa0022.stoa001.opp-lat1&page=3"
    );
    expect(res.status).toBe(200);
    expect(res.headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(res.text).toContain("<morcus-experimental-text-reader");
    expect(res.text).toContain('"initialSection":"3"');
  });

  it("ignores ?section= on GET /experimentalTexts?open=<id> (only ?page= picks the page)", async () => {
    const res = await request(buildApp()).get(
      "/experimentalTexts?open=pl/stoa0022.stoa001.opp-lat1&section=4"
    );
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('"initialSection"');
  });

  it("returns an Experimental Texts 404 for an unknown work id", async () => {
    const res = await request(buildApp()).get(
      "/experimentalTexts?open=pl/does_not_exist<b>"
    );
    expect(res.status).toBe(404);
    const doc = new JSDOM(res.text).window.document;
    const state = doc.querySelector(".not-found-state")!;
    expect(state.querySelector("h2")?.textContent).toBe("Text Not Found");
    expect(state.querySelector("em")?.textContent).toBe("pl/does_not_exist<b>");
    expect(state.textContent).toContain("Experimental Texts");
    expect(state.textContent).not.toContain("library catalog");
    expect(
      state.querySelector<HTMLAnchorElement>("a.btn")?.getAttribute("href")
    ).toBe("/experimentalTexts");
  });
});
