import {
  renderAboutContentHtml,
  renderAboutPageHtml,
} from "@/web/v2/about/about.server";

jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

describe("about_ssr", () => {
  test("renderAboutContentHtml includes essential legal and attribution sections", () => {
    const html = renderAboutContentHtml({ commitId: "abcdef123456" });

    // Header
    expect(html).not.toContain("about-header");
    expect(html).toContain(
      "Clicking on the flag icon in the top navigation bar"
    );

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
    expect(pageHtml).toContain('<header class="app-bar">');
    expect(pageHtml).toContain('href="/about"');
    expect(pageHtml).toContain('class="nav-link active"');
    expect(pageHtml).toContain('aria-current="page"');
    expect(pageHtml).toContain('href="/dicts"');
    expect(pageHtml.indexOf('<nav class="nav"')).toBeLessThan(
      pageHtml.indexOf("morcus-theme-toggle")
    );
    expect(pageHtml).toContain("morcus-report-dialog");
    expect(pageHtml).toContain('class="theme-toggle-btn report-btn"');
    expect(pageHtml).toContain('id="report-issue-dialog"');
  });
});
