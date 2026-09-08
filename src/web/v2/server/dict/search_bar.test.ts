import { renderDictSearchBar } from "@/web/v2/server/dict/search_bar";

describe("renderDictSearchBar", () => {
  test("renders default dictionary search bar", () => {
    const html = renderDictSearchBar({
      query: "habeo",
      action: "/v2/dicts",
    });

    expect(html).toContain('class="v2-search-form"');
    expect(html).toContain('action="/v2/dicts"');
    expect(html).toContain('value="habeo"');
    expect(html).toContain("<morcus-dict-settings>");
    expect(html).toContain('class="v2-input"');
    expect(html).toContain('class="v2-search-btn"');
    expect(html).toContain("<svg");
  });

  test("renders custom reader search bar with custom classes", () => {
    const html = renderDictSearchBar({
      query: "Caesar",
      action: "/v2/reader",
      formClass: "v2-reader-search-form",
      inputClass: "v2-reader-input",
      placeholder: "Lookup word in text...",
    });

    expect(html).toContain('class="v2-search-form v2-reader-search-form"');
    expect(html).toContain('action="/v2/reader"');
    expect(html).toContain('class="v2-input v2-reader-input"');
    expect(html).toContain('placeholder="Lookup word in text..."');
    expect(html).toContain('value="Caesar"');
    expect(html).toContain("<morcus-dict-settings>");
  });

  test("can omit settings component when includeSettings is false", () => {
    const html = renderDictSearchBar({
      query: "",
      action: "/v2/dicts",
      includeSettings: false,
    });

    expect(html).not.toContain("<morcus-dict-settings>");
    expect(html).toContain('value=""');
  });

  test("escapes HTML in query", () => {
    const html = renderDictSearchBar({
      query: '<script>alert("xss")</script>',
      action: "/v2/dicts",
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
