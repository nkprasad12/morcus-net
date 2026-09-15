import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { renderDictSearchBar } from "@/web/v2/dict/search_bar.server";

describe("renderDictSearchBar", () => {
  test("renders default dictionary search bar", () => {
    const html = renderDictSearchBar({
      query: "habeo",
      action: "/v2/dicts",
    });

    expect(html).toContain('class="search-form"');
    expect(html).toContain('action="/v2/dicts"');
    expect(html).toContain('value="habeo"');
    expect(html).toContain("<morcus-dict-settings>");
    expect(html).toContain('class="input"');
    expect(html).toContain('placeholder="Search for a word"');
    expect(html).toContain('class="search-btn"');
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

  test("renders dict checkboxes instead of a stale bitmask, plus the inflection toggle", () => {
    const html = renderDictSearchBar({
      query: "amare",
      action: "/v2/dicts",
      activeDicts: ["L&S", "GAF"],
      isInflected: true,
    });

    // The checkboxes are the live controls; a hidden bitmask beside them would be frozen to this
    // render and would override the user's No-JS changes on submit.
    expect(html).not.toContain('name="d"');
    expect(html.match(/name="dict"/g)).toHaveLength(LatinDict.AVAILABLE.length);
    expect(html.match(/checked/g)).toHaveLength(3); // L&S, GAF, and the inflection toggle
    expect(html).toContain('<input type="hidden" name="o" value="0" />');
    expect(html).toContain('id="toggle-inflected"');
    expect(html).toContain('class="inflected-checkbox"');
    expect(html).toContain("checked");
  });

  test("keeps the hidden d bitmask when the settings popover is omitted", () => {
    const html = renderDictSearchBar({
      query: "amare",
      action: "/v2/dicts",
      activeDicts: ["L&S", "GAF"],
      includeSettings: false,
    });

    // No checkboxes are rendered here, so the hidden field is the form's only dictionary state.
    // L&S (1) + GAF (2) = 3
    expect(html).toContain('<input type="hidden" name="d" value="3" />');
    expect(html).not.toContain('name="dict"');
  });

  test("renders unchecked inflection toggle when isInflected is false", () => {
    const html = renderDictSearchBar({
      query: "amare",
      action: "/v2/dicts",
      isInflected: false,
    });

    expect(html).toContain('<input type="hidden" name="o" value="0" />');
    expect(html).toContain('id="toggle-inflected"');
    // Checkbox itself does not have checked attribute
    expect(html).toMatch(/id="toggle-inflected"[^>]*\/>/);
    expect(html).not.toMatch(/id="toggle-inflected"[^>]*checked/);
  });

  test("renders status tray with active language chips and inflection badge", () => {
    const html = renderDictSearchBar({
      query: "facio",
      action: "/v2/dicts",
      activeDicts: ["L&S", "S&H", "GRG"],
      isInflected: true,
    });

    expect(html).toContain('class="search-tray"');
    expect(html).toContain('class="lang-chip lang-chip-la"');
    expect(html).toContain('class="lang-chip lang-chip-en"');
    expect(html).toContain('class="lang-chip lang-chip-de"');
    expect(html).toContain('class="inflect-chip is-on"');
    expect(html).toContain("On");
  });

  test("renders status tray with inflection off badge when isInflected is false", () => {
    const html = renderDictSearchBar({
      query: "facio",
      action: "/v2/dicts",
      activeDicts: ["L&S"],
      isInflected: false,
    });

    expect(html).toContain('class="search-tray"');
    expect(html).toContain('class="lang-chip lang-chip-la"');
    expect(html).not.toContain('class="lang-chip lang-chip-en"');
    expect(html).toContain('class="inflect-chip is-off"');
    expect(html).toContain("Off");
  });

  test("omits status tray when includeSettings is false", () => {
    const html = renderDictSearchBar({
      query: "facio",
      action: "/v2/dicts",
      includeSettings: false,
    });

    expect(html).not.toContain('class="search-tray"');
  });
});
