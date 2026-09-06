import {
  renderAboutContentHtml,
  renderAboutPageHtml,
} from "@/web/v2/server/about_ssr";

jest.mock("@/web/v2/server/asset_manifest", () => ({
  getV2AssetHref: (name: string) => `/v2/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--v2-bg)}",
}));

describe("about_ssr", () => {
  test("renderAboutContentHtml includes essential legal and attribution sections", () => {
    const html = renderAboutContentHtml({ commitId: "abcdef123456" });

    // Header
    expect(html).toContain("About M&oacute;rcus");

    // Site & License
    expect(html).toContain("GPL-3.0");
    expect(html).toContain("https://github.com/nkprasad12/morcus-net");
    expect(html).toContain("Latin Discord");

    // Dictionary & Perseus
    expect(html).toContain("Lewis &amp; Short");
    expect(html).toContain("CC BY-SA 4.0");
    expect(html).toContain("https://github.com/PerseusDL/lexica");

    // Acknowledgements
    expect(html).toContain("Perseus project");
    expect(html).toContain("Quillful");
    expect(html).toContain("Remus");

    // Commit ID link
    expect(html).toContain(
      "https://github.com/nkprasad12/morcus-net/commit/abcdef123456"
    );
    expect(html).toContain("abcdef1");
  });

  test("renderAboutPageHtml generates complete HTML document with app bar", () => {
    const pageHtml = renderAboutPageHtml();
    expect(pageHtml).toContain("<!DOCTYPE html>");
    expect(pageHtml).toContain("<title>About - Morcus Latin Tools</title>");
    expect(pageHtml).toContain('<header class="v2-app-bar">');
    expect(pageHtml).toContain('href="/v2/about"');
    expect(pageHtml).toContain('class="v2-nav-link active"');
    expect(pageHtml).toContain('aria-current="page"');
    expect(pageHtml).toContain('href="/v2/dicts"');
    expect(pageHtml.indexOf('<nav class="v2-nav"')).toBeLessThan(
      pageHtml.indexOf("morcus-theme-toggle")
    );
    expect(pageHtml).toContain("morcus-report-dialog");
    expect(pageHtml).toContain('class="v2-theme-toggle-btn v2-report-btn"');
    expect(pageHtml).toContain('id="report-issue-dialog"');
  });
});
