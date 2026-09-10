import { renderDictSearchBar } from "@/web/v2/dict/search_bar.server";

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

  test("renders hidden d bitmask input and inflection toggle", () => {
    const html = renderDictSearchBar({
      query: "amare",
      action: "/v2/dicts",
      activeDicts: ["L&S", "GAF"],
      isInflected: true,
    });

    // L&S (1) + GAF (2) = 3
    expect(html).toContain('<input type="hidden" name="d" value="3" />');
    expect(html).toContain('<input type="hidden" name="o" value="0" />');
    expect(html).toContain('id="v2-toggle-inflected"');
    expect(html).toContain('class="v2-inflected-checkbox"');
    expect(html).toContain("checked");
  });

  test("renders unchecked inflection toggle when isInflected is false", () => {
    const html = renderDictSearchBar({
      query: "amare",
      action: "/v2/dicts",
      isInflected: false,
    });

    expect(html).toContain('<input type="hidden" name="o" value="0" />');
    expect(html).toContain('id="v2-toggle-inflected"');
    // Checkbox itself does not have checked attribute
    expect(html).toMatch(/id="v2-toggle-inflected"[^>]*\/>/);
    expect(html).not.toMatch(/id="v2-toggle-inflected"[^>]*checked/);
  });
});
