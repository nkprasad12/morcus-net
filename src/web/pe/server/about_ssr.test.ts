import {
  renderAboutContentHtml,
  renderAboutPageHtml,
} from "@/web/pe/server/about_ssr";

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
    expect(pageHtml).toContain('<header class="pe-app-bar">');
    expect(pageHtml).toContain('href="/pe/about"');
    expect(pageHtml).toContain('class="pe-nav-link active"');
    expect(pageHtml).toContain('aria-current="page"');
    expect(pageHtml).toContain('href="/pe/dicts"');
  });
});
