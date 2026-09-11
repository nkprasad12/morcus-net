import {
  computeActiveLanguages,
  renderLangChipsHtml,
  renderInflectChipHtml,
} from "@/web/v2/dict/search_bar.common";

describe("search_bar.common", () => {
  describe("computeActiveLanguages", () => {
    test("extracts unique from languages from active dict keys", () => {
      const langs = computeActiveLanguages(["L&S", "GAF", "S&H", "GRG"]);
      expect(langs).toContain("La");
      expect(langs).toContain("En");
      expect(langs).toContain("De");
    });

    test("ignores wildcard dicts like NUM", () => {
      const langs = computeActiveLanguages(["NUM"]);
      expect(langs).toEqual([]);
    });

    test("handles empty or unknown keys gracefully", () => {
      const langs = computeActiveLanguages(["UNKNOWN"]);
      expect(langs).toEqual([]);
    });
  });

  describe("renderLangChipsHtml", () => {
    test("renders language chips with correct css classes", () => {
      const html = renderLangChipsHtml(["La", "En"]);
      expect(html).toContain('class="v2-lang-chip v2-lang-chip-la"');
      expect(html).toContain('class="v2-lang-chip v2-lang-chip-en"');
      expect(html).toContain("La");
      expect(html).toContain("En");
    });

    test("renders None badge when language list is empty", () => {
      const html = renderLangChipsHtml([]);
      expect(html).toContain('class="v2-lang-chip v2-lang-chip-none"');
      expect(html).toContain("None");
    });
  });

  describe("renderInflectChipHtml", () => {
    test("renders on state", () => {
      const html = renderInflectChipHtml(true);
      expect(html).toContain('class="v2-inflect-chip is-on"');
      expect(html).toContain("On");
    });

    test("renders off state", () => {
      const html = renderInflectChipHtml(false);
      expect(html).toContain('class="v2-inflect-chip is-off"');
      expect(html).toContain("Off");
    });
  });
});
