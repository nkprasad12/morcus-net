import { renderDictLandingHtml } from "@/web/ui/dict/landing/dict_landing.server";

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

  test("renders #whats-new only when latestPost has a valid date and non-empty description", () => {
    const withPost = renderDictLandingHtml(undefined, true, {
      date: "2026-10-25",
      description: "New corpus features.",
      url: "https://updates.morcus.net/2026/10/25/Corpus.html",
    });
    expect(withPost).toContain('id="landing-welcome"');
    expect(withPost).toContain(
      '<p class="whats-new" id="whats-new" data-wn-date="2026-10-25"><span class="wn-tag">New update</span> New corpus features. <a href="https://updates.morcus.net/2026/10/25/Corpus.html" target="_blank" rel="noopener">Read more →</a></p>'
    );

    const withoutDesc = renderDictLandingHtml(undefined, true, {
      date: "2026-10-25",
      url: "https://updates.morcus.net/2026/10/25/Corpus.html",
    });
    expect(withoutDesc).not.toContain("whats-new");
  });
});
