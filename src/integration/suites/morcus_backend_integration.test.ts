import { test, expect } from "@playwright/test";

/**
 * Server smoke tests for a built morcus.net image (CI runs them against the
 * Docker image via `npm run integration-tests`; locally,
 * `./morcus.sh e2e --docker`). No browser: plain `fetch` against the HTML
 * pages and JSON endpoints UI V2 serves. They also pass against the dev server,
 * but their point is what only a production build can get wrong: a missing
 * artifact (a dictionary database, the library, the Rust corpus bindings, PWA
 * files) or serving it with the wrong headers.
 */

const BASE_URL = process.env.BASE_URL;

function get(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, init);
}

async function getText(path: string): Promise<string> {
  const res = await get(path);
  expect(res.status, path).toBe(200);
  return res.text();
}

/** The `Location` of a redirect, without following it. */
async function redirectTarget(path: string): Promise<string | null> {
  const res = await get(path, { redirect: "manual" });
  expect([301, 302], path).toContain(res.status);
  return res.headers.get("location");
}

test.describe("morcus.net backend integration", { tag: "@backend" }, () => {
  test.skip(
    ({ browserName, isMobile }) => browserName !== "chromium" || isMobile,
    "Backend integration does not use the browser, so only needs to run once."
  );

  test.describe("static and PWA files", () => {
    test("serves the PWA manifest", async () => {
      const res = await get("/public/pwa.webmanifest");
      expect(res.headers.get("content-type")).toContain(
        "application/manifest+json"
      );
      const manifest = await res.json();
      expect(manifest.name).toBe("Morcus Latin Tools");
      expect(manifest.short_name).toBe("Morcus");
    });

    test("serves Android TWA asset links", async () => {
      const res = await get("/.well-known/assetlinks.json");
      expect(res.status).toBe(200);
      expect(Array.isArray(await res.json())).toBe(true);
    });

    test("serves robots.txt and the V1 service worker cleanup script", async () => {
      expect(await getText("/robots.txt")).toContain("Disallow: /api/");
      const sw = await get("/serviceworker.js");
      expect(sw.status).toBe(200);
      expect(sw.headers.get("cache-control")).toContain("no-store");
      expect(await sw.text()).toContain("unregister");
    });
  });

  test.describe("dictionary", () => {
    test("Lewis & Short, uninflected", async () => {
      const html = await getText("/dicts?q=canaba&dict=LnS&o=0");
      expect(html).toContain("cannăba");
    });

    test("Lewis & Short, inflected", async () => {
      expect(await getText("/dicts?q=undarum&dict=LnS&o=1")).toContain(
        "billow"
      );
    });

    test("Lewis & Short, inflected with diacritics", async () => {
      const html = await getText(
        `/dicts?q=${encodeURIComponent("occīdit")}&dict=LnS&o=1`
      );
      expect(html).toContain("occīdo");
    });

    test("Lewis & Short, inflected with capitals", async () => {
      expect(await getText("/dicts?q=Undarum&dict=LnS&o=1")).toContain("wave");
    });

    test("Lewis & Short, inflected with a ligature", async () => {
      const html = await getText(
        `/dicts?q=${encodeURIComponent("Ægyptus")}&dict=LnS&o=1`
      );
      expect(html).toContain("Aegyptus");
    });

    test("entries by id in Lewis & Short and Smith & Hall", async () => {
      expect(await getText("/dicts/id/n1153")).toContain("ἀηδών");
      expect(await getText("/dicts/id/sh2708")).toContain("caerŭlĕus");
    });

    test("Smith & Hall, English to Latin", async () => {
      const html = await getText("/dicts?q=influence&dict=SnH");
      expect(html).toContain("Power exerted");
      expect(html).toContain("impello");
    });

    test("serves partials for in-page swaps", async () => {
      const html = await getText("/dicts?q=habeo&dict=LnS&format=partial");
      expect(html).toContain("to have");
      expect(html).not.toContain("<!DOCTYPE html>");
    });

    test("serves autocomplete chunks", async () => {
      const res = await get("/api/completions?prefix=ca");
      expect(res.status).toBe(200);
      const chunks = await res.json();
      expect(chunks["L&S"]).toContain("cānăba");
    });

    test("handles concurrent requests", async () => {
      const pages = await Promise.all(
        Array.from({ length: 10 }, () => getText("/dicts?q=habeo&dict=LnS"))
      );
      for (const html of pages) {
        expect(html).toContain("to have");
      }
    });
  });

  test.describe("library and reader", () => {
    test("lists De bello Gallico in the library", async () => {
      const html = await getText("/library");
      expect(html).toContain('data-work-id="phi0448.phi001.perseus-lat2"');
    });

    test("serves a work by author and name", async () => {
      const html = await getText("/work/caesar/de_bello_gallico/1.1");
      expect(html).toContain("De bello Gallico");
      expect(html).toContain("Gallia est omnis divisa");
    });

    test("serves translations", async () => {
      const html = await getText("/work/sallust/catalina1/1/translation");
      expect(html).toContain("government");
    });
  });

  test.describe("corpus", () => {
    // The Rust corpus bindings only exist in a built image.
    test("runs a query", async () => {
      const query = encodeURIComponent("@lemma:do oscula @case:dat");
      expect(await getText(`/corpus?q=${query}`)).toContain("dedit oscula");
    });

    test("serves lemma shards for autocomplete", async () => {
      const lemmata = await (await get("/api/corpus/lemmata/h")).json();
      expect(lemmata).toContain("habena");
    });
  });

  test.describe("caching and routing", () => {
    test("serves build-versioned fetches as immutable", async () => {
      const html = await getText("/dicts");
      const version = html.match(/<html[^>]*\sdata-version="([^"]+)"/)?.[1];
      expect(version).toBeDefined();
      const res = await get(
        `/api/completions?prefix=ca&v=${encodeURIComponent(version!)}`
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toContain("immutable");
    });

    test("serves the dictionary at the root without a redirect", async () => {
      const res = await get("/", { redirect: "manual" });
      expect(res.status).toBe(200);
      expect(await res.text()).toContain(
        '<link rel="canonical" href="https://morcus.net/dicts">'
      );
    });

    test("redirects V1 URLs that external links still use", async () => {
      expect(await redirectTarget("/work/phi0448.phi001.perseus-lat2")).toMatch(
        /\/work\/caesar\/de_bello_gallico\/1\.1$/
      );
      expect(await redirectTarget("/dicts?q=n1153&o=2")).toBe(
        "/dicts/id/n1153"
      );
      expect(await redirectTarget("/work/caesar/de_bello_gallico?id=1.3")).toBe(
        "/work/caesar/de_bello_gallico/1.3"
      );
    });

    test("answers unknown pages with 404", async () => {
      const res = await get("/notEvenRemotelyReal");
      expect(res.status).toBe(404);
    });
  });
});
