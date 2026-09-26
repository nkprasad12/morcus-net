import express from "express";
import request from "supertest";

import { UnsafeUrlError } from "@/web/scraping/safe_fetch";
import { createExternalRoutes } from "@/web/v2/external/external_routes.server";

const SOURCE = "https://example.com/cat1.html";
const SOURCE_PARAM = encodeURIComponent(SOURCE);

const TEXT = [
  "Quo usque tandem abutere, Catilina,",
  "patientia nostra?",
  "",
  "Quam diu etiam furor iste tuus nos eludet?",
].join("\n");

function makeApp(scrape: (url: string) => Promise<string>) {
  const app = express();
  app.use("/v2", createExternalRoutes({ scrape }));
  return app;
}

describe("GET /v2/externalReader", () => {
  test("without a url, renders the No-JS import form", async () => {
    const scrape = jest.fn();
    const res = await request(makeApp(scrape)).get("/v2/externalReader");

    expect(res.status).toBe(200);
    expect(res.text).toContain("<!DOCTYPE html>");
    expect(res.text).toContain('action="/v2/externalReader"');
    expect(res.text).toContain('method="get"');
    expect(res.text).toContain('name="url"');
    expect(res.text).toMatch(/value="keep" checked/);
    expect(scrape).not.toHaveBeenCalled();
  });

  test("offers paste as a JS-only tab beside the web-page import", async () => {
    const res = await request(makeApp(jest.fn())).get("/v2/externalReader");

    expect(res.text).toContain(
      '<morcus-external-loader class="external-landing"'
    );
    expect(res.text).toContain('data-page="landing"');
    expect(res.text).toMatch(
      /class="external-source-tabs external-js-only" role="radiogroup"/
    );
    // Paste is the default tab.
    expect(res.text).toMatch(
      /id="external-source-paste" value="paste" checked/
    );
    expect(res.text).toContain('id="external-saved-list"');
    expect(res.text).toContain('class="external-nojs-note"');
    // One form, one set of line-break options for both sources.
    const landing = res.text.slice(
      res.text.indexOf("<morcus-external-loader"),
      res.text.indexOf("</morcus-external-loader>")
    );
    expect(landing.match(/<form /g)).toHaveLength(1);
    expect(landing.match(/name="lines" value="keep"/g)).toHaveLength(1);
    // Pasted text has no `name`, so it can never be submitted to the server.
    expect(res.text).toMatch(/<textarea id="external-text"(?![^>]*name=)/);
    expect(res.text).not.toContain('type="file"');
    expect(res.text).not.toMatch(/method="post"/i);
  });

  test("reopens on the web-page tab after a failed import", async () => {
    const res = await request(
      makeApp(async () => {
        throw new UnsafeUrlError("Local addresses are not allowed");
      })
    ).get(`/v2/externalReader?url=${encodeURIComponent("http://localhost/")}`);

    expect(res.text).toMatch(/id="external-source-url" value="url" checked/);
    expect(res.text).not.toMatch(
      /id="external-source-paste" value="paste" checked/
    );
  });

  test("?local= renders a reader shell for the saved text, never scraping", async () => {
    const scrape = jest.fn();
    const res = await request(makeApp(scrape)).get(
      "/v2/externalReader?local=abc123&lines=verse"
    );

    expect(res.status).toBe(200);
    expect(res.header["x-robots-tag"]).toBe("noindex, nofollow");
    expect(scrape).not.toHaveBeenCalled();
    expect(res.text).toContain("<morcus-reader-view");
    expect(res.text).toContain('data-page="local"');
    expect(res.text).toContain('data-local-key="abc123"');
    expect(res.text).toContain('data-lines="verse"');
    expect(res.text).toContain("<noscript>");
    // Line modes stay on the saved text.
    expect(res.text).toContain(
      'href="/v2/externalReader?local=abc123&amp;lines=prose"'
    );
  });

  test("renders the imported text in the shared reader frame", async () => {
    const scrape = jest.fn(async () => TEXT);
    const res = await request(makeApp(scrape)).get(
      `/v2/externalReader?url=${SOURCE_PARAM}`
    );

    expect(res.status).toBe(200);
    expect(res.header["x-robots-tag"]).toBe("noindex, nofollow");
    expect(scrape).toHaveBeenCalledWith(SOURCE);

    // Same custom element as the library, minus the work.
    expect(res.text).toContain("<morcus-reader-view");
    expect(res.text).toContain('data-external="true"');
    expect(res.text).not.toContain("data-work=");
    expect(res.text).not.toContain('id="reader-toc-drawer"');
    expect(res.text).not.toContain('id="pager-prev"');
    // The library's passage shape, so tokenizing and gutters work unchanged.
    expect(res.text).toContain('id="sec-1"');
    expect(res.text).toContain('data-tokenize-target="true"');
    expect(res.text).toContain("patientia nostra?");
    // Shared dictionary panel and typography popover.
    expect(res.text).toContain('id="dict-frame"');
    expect(res.text).toContain('id="reader-settings-btn"');
    // Title from the first words, tagged with the source; source attributed.
    expect(res.text).toContain(
      "<title>example.com: Quo usque tandem abutere Catilina - Latin Reader"
    );
    expect(res.text).toContain("example.com");
    expect(res.text).toContain("Not part of the Morcus library");
  });

  test("keeps No-JS lookups on the page with the drawer open", async () => {
    const res = await request(makeApp(async () => TEXT)).get(
      `/v2/externalReader?url=${SOURCE_PARAM}&q=tandem`
    );

    expect(res.status).toBe(200);
    expect(res.text).toContain("<title>tandem - Latin Reader");
    expect(res.text).toContain("reader-layout-active");
    expect(res.text).toContain("/v2/dicts?q=tandem&amp;lang=La&amp;o=1");
    // Closing returns to the same import without the lookup.
    expect(res.text).toContain(
      `href="/v2/externalReader?url=${SOURCE_PARAM}#reader-dict-dismissed"`
    );
  });

  test("offers the other line modes as plain links", async () => {
    const res = await request(makeApp(async () => TEXT)).get(
      `/v2/externalReader?url=${SOURCE_PARAM}&lines=verse`
    );

    expect(res.status).toBe(200);
    expect(res.text).toContain('class="reader-section section-verse"');
    expect(res.text).toMatch(
      /<span class="external-mode-link" aria-current="true">Number lines as verse<\/span>/
    );
    expect(res.text).toContain(
      `href="/v2/externalReader?url=${SOURCE_PARAM}&amp;lines=prose"`
    );
    expect(res.text).toContain(`href="/v2/externalReader?url=${SOURCE_PARAM}"`);
  });

  test("redirects to the canonical URL", async () => {
    const app = makeApp(async () => TEXT);

    const withDefault = await request(app).get(
      `/v2/externalReader?url=${SOURCE_PARAM}&lines=keep&utm=x`
    );
    expect(withDefault.status).toBe(302);
    expect(withDefault.header.location).toBe(
      `/v2/externalReader?url=${SOURCE_PARAM}`
    );

    const unencoded = await request(app).get(
      `/v2/externalReader?url=${SOURCE}`
    );
    expect(unencoded.status).toBe(302);
    expect(unencoded.header.location).toBe(
      `/v2/externalReader?url=${SOURCE_PARAM}`
    );
  });

  test("scrapes a shared link once for many readers", async () => {
    const scrape = jest.fn(async () => TEXT);
    const app = makeApp(scrape);
    await request(app).get(`/v2/externalReader?url=${SOURCE_PARAM}`);
    await request(app).get(`/v2/externalReader?url=${SOURCE_PARAM}&q=tandem`);
    expect(scrape).toHaveBeenCalledTimes(1);
  });

  test("on failure, shows the form again with the reason and the address", async () => {
    const res = await request(
      makeApp(async () => {
        throw new UnsafeUrlError("Local addresses are not allowed");
      })
    ).get(`/v2/externalReader?url=${encodeURIComponent("http://localhost/")}`);

    expect(res.status).toBe(400);
    expect(res.text).toContain('role="alert"');
    expect(res.text).toContain("Local addresses are not allowed");
    expect(res.text).toContain('value="http://localhost/"');
    expect(res.text).toContain('aria-invalid="true"');
  });

  test("escapes hostile text and addresses", async () => {
    const hostile = '"><script>alert(1)</script>';
    const search = new URLSearchParams({
      url: `https://example.com/${hostile}`,
      q: hostile,
    });
    const res = await request(makeApp(async () => `${hostile} salve`)).get(
      `/v2/externalReader?${search}`
    );

    expect(res.status).toBe(200);
    expect(res.text).not.toContain("<script>alert(1)</script>");
  });
});
