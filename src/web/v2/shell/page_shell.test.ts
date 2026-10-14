/**
 * @jest-environment jsdom
 */

import {
  renderAppBar,
  renderPageShell,
  resolvePageScripts,
  type V2ActivePage,
} from "@/web/v2/shell/page_shell.server";
import { THEME_COLOR } from "@/web/v2/shell/theme_color.common";

jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/v2/assets/${name}`,
  getV2CriticalCss: () => "/* critical css */",
  getV2CriticalJs: () => "/* critical js */",
}));

describe("renderAppBar", () => {
  const pages: V2ActivePage[] = ["dicts", "library", "corpus", "about"];

  test.each(pages)(
    "marks %s as active with aria-current='page' on desktop and mobile",
    (activePage) => {
      const container = document.createElement("div");
      container.innerHTML = renderAppBar(activePage);

      const navDesktop = container.querySelector(".nav-desktop");
      expect(navDesktop).not.toBeNull();

      const mobileDropdown = container.querySelector(".mobile-menu-dropdown");
      expect(mobileDropdown).not.toBeNull();

      for (const p of pages) {
        const desktopLink = navDesktop!.querySelector(`a[href="/v2/${p}"]`);
        expect(desktopLink).not.toBeNull();

        const mobileLink = mobileDropdown!.querySelector(`a[href="/v2/${p}"]`);
        expect(mobileLink).not.toBeNull();

        if (p === activePage) {
          expect(desktopLink!.classList.contains("active")).toBe(true);
          expect(desktopLink!.getAttribute("aria-current")).toBe("page");

          expect(mobileLink!.classList.contains("active")).toBe(true);
          expect(mobileLink!.getAttribute("aria-current")).toBe("page");
        } else {
          expect(desktopLink!.classList.contains("active")).toBe(false);
          expect(desktopLink!.hasAttribute("aria-current")).toBe(false);

          expect(mobileLink!.classList.contains("active")).toBe(false);
          expect(mobileLink!.hasAttribute("aria-current")).toBe(false);
        }
      }
    }
  );
});

describe("renderPageShell", () => {
  test("renders full document with title and active corpus app bar", () => {
    const html = renderPageShell({
      title: "Corpus Search",
      activePage: "corpus",
      contentHtml: "<div id='content'>Content</div>",
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>Corpus Search</title>");
    expect(html).toContain("<div id='content'>Content</div>");
    expect(html).toContain('href="/v2/corpus"');
    expect(html).toContain('class="nav-link active"');
    expect(html).toContain('src="/v2/assets/common.js"');
    expect(html).toContain('src="/v2/assets/corpus.js"');
  });

  test("hides app bar when hideAppBar is true", () => {
    const html = renderPageShell({
      title: "Embedded View",
      activePage: "dicts",
      contentHtml: "<div>Embedded</div>",
      hideAppBar: true,
    });

    expect(html).not.toContain('<header class="app-bar">');
    expect(html).toContain("body-embedded");
    expect(html).toContain('src="/v2/assets/common.js"');
    expect(html).toContain('src="/v2/assets/dict.js"');
  });

  test("links the manifest, theme colour, OpenGraph tags, and canonical URL on top-level pages only", () => {
    const head = (hideAppBar: boolean, canonicalPath?: string) =>
      renderPageShell({
        title: "Caesar & Gaul",
        canonicalPath,
        activePage: "dicts",
        contentHtml: "<div></div>",
        hideAppBar,
      }).split("</head>")[0];

    const topLevel = head(false, "/v2/dicts?q=Gallia&o=1");
    expect(topLevel).toContain(
      '<link rel="manifest" href="/public/pwa.webmanifest">'
    );
    expect(topLevel).toContain(
      `<meta name="theme-color" content="${THEME_COLOR.light}">`
    );
    expect(topLevel).toContain(
      '<link rel="canonical" href="https://morcus.net/v2/dicts?q=Gallia&amp;o=1">'
    );
    expect(topLevel).toContain(
      '<meta property="og:url" content="https://morcus.net/v2/dicts?q=Gallia&amp;o=1">'
    );
    expect(topLevel).toContain(
      '<meta property="og:site_name" content="Morcus Latin Tools">'
    );
    expect(topLevel).toContain(
      '<meta property="og:title" content="Caesar &amp; Gaul">'
    );
    expect(topLevel).toContain('<meta property="og:type" content="website">');
    expect(topLevel).toContain(
      '<meta property="og:image" content="https://morcus.net/public/logo512.png">'
    );

    const noCanonical = head(false);
    expect(noCanonical).not.toContain('rel="canonical"');
    expect(noCanonical).not.toContain('property="og:url"');
    expect(noCanonical).toContain('property="og:title"');

    const embedded = head(true, "/v2/dicts?q=Gallia");
    expect(embedded).not.toContain('rel="manifest"');
    expect(embedded).not.toContain('name="theme-color"');
    expect(embedded).not.toContain('rel="canonical"');
    expect(embedded).not.toContain('property="og:');
  });

  test("emits route-specific scripts in dependency order and dict.js prefetch on reader pages", () => {
    expect(resolvePageScripts({ activePage: "about" })).toEqual(["common.js"]);
    expect(resolvePageScripts({ activePage: "dicts" })).toEqual([
      "common.js",
      "dict.js",
    ]);
    expect(resolvePageScripts({ activePage: "library" })).toEqual([
      "common.js",
      "reader.js",
    ]);
    expect(resolvePageScripts({ activePage: "corpus" })).toEqual([
      "common.js",
      "corpus.js",
    ]);
    expect(
      resolvePageScripts({ activePage: "library", isExternal: true })
    ).toEqual(["common.js", "reader.js", "external.js"]);

    const readerHtml = renderPageShell({
      title: "Reader",
      activePage: "library",
      isReader: true,
      contentHtml: "<div>Reader</div>",
    });
    expect(readerHtml).toContain(
      '<link rel="prefetch" href="/v2/assets/dict.js">'
    );
  });

  // `onPageReady` (core/dom/page_ready.client.ts) relies on DOMContentLoaded
  // firing only after every chunk has run. That holds for non-`async` module
  // scripts; DOMContentLoaded does not wait for an `async` one, so global
  // setups could run before the route's components exist (docs/archive/CHUNK_ORDERING_ADR.md).
  test.each([
    { activePage: "about" as const },
    { activePage: "dicts" as const },
    { activePage: "library" as const, isReader: true },
    { activePage: "corpus" as const },
    { activePage: "library" as const, isReader: true, isExternal: true },
  ])("every external script is a non-async module script (%o)", (options) => {
    const html = renderPageShell({
      title: "T",
      contentHtml: "<div></div>",
      ...options,
    });
    const external = [...html.matchAll(/<script\b[^>]*>/g)]
      .map((m) => m[0])
      .filter((tag) => /\ssrc=/.test(tag));
    expect(external).toHaveLength(resolvePageScripts(options).length);
    for (const tag of external) {
      expect(tag).toMatch(/\stype="module"/);
      expect(tag).not.toMatch(/\s(async|defer)[\s=>]/);
    }
  });
});
