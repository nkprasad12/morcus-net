import { renderDictLandingHtml } from "@/web/v2/dict/landing/dict_landing.server";

describe("renderDictLandingHtml", () => {
  test("renders default landing state when called with no arguments", () => {
    const html = renderDictLandingHtml();
    expect(html).toContain("landing-container");
    expect(html).toContain("All Dictionaries");
    expect(html).toContain("Understanding the Markup");
    expect(html).toContain(
      "Welcome to the dictionary. You can search Latin headwords and inflected forms, and words in English and German."
    );
    expect(html).toContain('data-dict-key="L&S"');
    expect(html).toContain(
      'class="lexicon-badge dict-badge-la dict-enabled">L&S<'
    );
    expect(html).toContain(
      'class="lexicon-badge dict-badge-es dict-disabled">EGL<'
    );
  });

  test("renders default landing state when activeDicts is undefined or empty", () => {
    const html = renderDictLandingHtml([]);
    expect(html).toContain("landing-container");
    expect(html).toContain(
      "Welcome to the dictionary. You can search Latin headwords and inflected forms, and words in English and German."
    );
    expect(html).toContain(
      'class="lexicon-badge dict-badge-la dict-enabled">L&S<'
    );
  });

  test("respects custom activeDicts positional argument", () => {
    const html = renderDictLandingHtml(["L&S", "GAF"]);
    expect(html).toContain(
      "Welcome to the dictionary. You can search Latin headwords and inflected forms."
    );
    expect(html).not.toContain("words in");

    // L&S and GAF enabled, others disabled
    expect(html).toContain(
      'class="lexicon-badge dict-badge-la dict-enabled">L&S<'
    );
    expect(html).toContain(
      'class="lexicon-badge dict-badge-la dict-enabled">GAF<'
    );
    expect(html).toContain(
      'class="lexicon-badge dict-badge-en dict-disabled">S&H<'
    );
  });

  test("respects isInflected = false positional argument", () => {
    const html = renderDictLandingHtml(undefined, false);
    expect(html).toContain(
      "Welcome to the dictionary. You can search Latin headwords, and words in English and German."
    );
    expect(html).not.toContain("inflected forms");
  });

  test("handles single reverse dictionary selection", () => {
    const html = renderDictLandingHtml(["S&H"], true);
    expect(html).toContain(
      "Welcome to the dictionary. You can search words in English."
    );
    expect(html).not.toContain("Latin headwords");
  });
});
