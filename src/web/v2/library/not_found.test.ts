import {
  renderNotFoundContentHtml,
  renderNotFoundPageHtml,
} from "@/web/v2/library/not_found.server";

jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/v2/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

describe("library not_found SSR", () => {
  describe("renderNotFoundContentHtml", () => {
    test("renders default empty state without arguments", () => {
      const html = renderNotFoundContentHtml();

      expect(html).toContain("library-empty-state");
      expect(html).toContain("not-found-state");
      expect(html).toContain("Classical Work Not Found");
      expect(html).toContain(
        "Could not locate the requested resource in the library catalog."
      );
      expect(html).toContain('href="/v2/library"');
      expect(html).toContain("btn btn-primary");
      expect(html).toContain("Browse Full Library");
      // Must not contain any inline styles
      expect(html).not.toContain("style=");
    });

    test("renders with workSlug and escapes HTML entities", () => {
      const html = renderNotFoundContentHtml({
        workSlug: "caesar/de_bello_gallico",
      });

      expect(html).toContain("not-found-state");
      expect(html).toContain(
        "Could not locate classical work <em>caesar/de_bello_gallico</em> in the library catalog."
      );
      expect(html).not.toContain("style=");
    });

    test("properly escapes XSS payloads in workSlug and title", () => {
      const html = renderNotFoundContentHtml({
        workSlug: '<script>alert("work")</script>',
        title: '<script>alert("title")</script>',
      });

      expect(html).not.toContain("<script>");
      expect(html).toContain(
        "&lt;script&gt;alert(&quot;work&quot;)&lt;/script&gt;"
      );
      expect(html).toContain(
        "&lt;script&gt;alert(&quot;title&quot;)&lt;/script&gt;"
      );
      expect(html).not.toContain("style=");
    });

    test("properly escapes XSS payloads in custom description", () => {
      const html = renderNotFoundContentHtml({
        description: '<script>alert("desc")</script>',
      });

      expect(html).not.toContain("<script>");
      expect(html).toContain(
        "&lt;script&gt;alert(&quot;desc&quot;)&lt;/script&gt;"
      );
    });

    test("renders custom title and custom description when provided", () => {
      const html = renderNotFoundContentHtml({
        title: "Page Not Found",
        description: "The requested document could not be located.",
      });

      expect(html).toContain("Page Not Found");
      expect(html).toContain("The requested document could not be located.");
      expect(html).not.toContain("Classical Work Not Found");
    });
  });

  describe("renderNotFoundPageHtml", () => {
    test("generates complete HTML document with library app bar active", () => {
      const pageHtml = renderNotFoundPageHtml({
        workSlug: "vergil/aeneid_lost",
      });

      expect(pageHtml).toContain("<!DOCTYPE html>");
      expect(pageHtml).toContain(
        "<title>Work Not Found - Morcus Latin Tools</title>"
      );
      expect(pageHtml).toContain('<header class="app-bar">');
      expect(pageHtml).toContain('href="/v2/library"');
      expect(pageHtml).toContain('class="nav-link active"');
      expect(pageHtml).toContain('aria-current="page"');
      expect(pageHtml).toContain("not-found-state");
      expect(pageHtml).toContain("vergil/aeneid_lost");
      expect(pageHtml).not.toContain("style=");
    });
  });
});
