/**
 * @jest-environment jsdom
 */

import {
  renderAppBar,
  renderPageShell,
  type V2ActivePage,
} from "@/web/v2/shell/page_shell.server";

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
  });
});
