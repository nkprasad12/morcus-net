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
    expect(html).toContain('placeholder="Search for a word"');
    expect(html).toContain('class="v2-search-btn"');
    expect(html).toContain("<svg");
  });

  test("honors a custom action and placeholder", () => {
    const html = renderDictSearchBar({
      query: "Caesar",
      action: "/v2/reader",
      placeholder: "Lookup word in text...",
    });

    expect(html).toContain('action="/v2/reader"');
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

  test("renders status tray with active language chips and inflection badge", () => {
    const html = renderDictSearchBar({
      query: "facio",
      action: "/v2/dicts",
      activeDicts: ["L&S", "S&H", "GRG"],
      isInflected: true,
    });

    expect(html).toContain('class="v2-search-tray"');
    expect(html).toContain('class="v2-lang-chip v2-lang-chip-la"');
    expect(html).toContain('class="v2-lang-chip v2-lang-chip-en"');
    expect(html).toContain('class="v2-lang-chip v2-lang-chip-de"');
    expect(html).toContain('class="v2-inflect-chip is-on"');
    expect(html).toContain("On");
  });

  test("renders status tray with inflection off badge when isInflected is false", () => {
    const html = renderDictSearchBar({
      query: "facio",
      action: "/v2/dicts",
      activeDicts: ["L&S"],
      isInflected: false,
    });

    expect(html).toContain('class="v2-search-tray"');
    expect(html).toContain('class="v2-lang-chip v2-lang-chip-la"');
    expect(html).not.toContain('class="v2-lang-chip v2-lang-chip-en"');
    expect(html).toContain('class="v2-inflect-chip is-off"');
    expect(html).toContain("Off");
  });

  test("omits status tray when includeSettings is false", () => {
    const html = renderDictSearchBar({
      query: "facio",
      action: "/v2/dicts",
      includeSettings: false,
    });

    expect(html).not.toContain('class="v2-search-tray"');
  });
});
