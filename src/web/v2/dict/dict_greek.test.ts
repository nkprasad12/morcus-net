/**
 * @jest-environment jsdom
 */
import {
  hasGreek,
  getLogeionUrl,
  EMBEDDED_LOGEION_SETTING_KEY,
} from "@/web/v2/dict/dict_greek.common";
import { renderGreekFallbackHtml } from "@/web/v2/dict/dict_greek.server";
import { renderDictResultsHtml } from "@/web/v2/dict/dict_page.server";
import "@/web/v2/dict/dict_greek.client";
import { settingsStore } from "@/web/v2/core/index.client";

describe("Greek Query Fallback & Logeion Integration", () => {
  describe("hasGreek detection", () => {
    test("detects standard Greek words", () => {
      expect(hasGreek("λόγος")).toBe(true);
      expect(hasGreek("θεός")).toBe(true);
      expect(hasGreek("ψυχή")).toBe(true);
    });

    test("detects polytonic Greek with diacritics", () => {
      expect(hasGreek("ἄνθρωπος")).toBe(true);
      expect(hasGreek("Ἑλλάς")).toBe(true);
      expect(hasGreek("ἀληθεία")).toBe(true);
      expect(hasGreek("καλὸς κἀγαθός")).toBe(true);
    });

    test("detects uppercase Greek characters", () => {
      expect(hasGreek("ΛΌΓΟΣ")).toBe(true);
      expect(hasGreek("ἈΘΉΝΑ")).toBe(true);
    });

    test("detects Greek within mixed text", () => {
      expect(hasGreek("Greek: λόγος")).toBe(true);
      expect(hasGreek("word (λόγος)")).toBe(true);
    });

    test("returns false for Latin, German, numbers, and punctuation", () => {
      expect(hasGreek("verbum")).toBe(false);
      expect(hasGreek("amare")).toBe(false);
      expect(hasGreek("caesar")).toBe(false);
      expect(hasGreek("straße")).toBe(false);
      expect(hasGreek("12345")).toBe(false);
      expect(hasGreek(".,?!-")).toBe(false);
      expect(hasGreek("")).toBe(false);
    });
  });

  describe("getLogeionUrl", () => {
    test("generates properly encoded URL", () => {
      expect(getLogeionUrl("λόγος")).toBe(
        `https://logeion.uchicago.edu/${encodeURIComponent("λόγος")}`
      );
      expect(getLogeionUrl(" ἄνθρωπος ")).toBe(
        `https://logeion.uchicago.edu/${encodeURIComponent("ἄνθρωπος")}`
      );
    });
  });

  describe("renderGreekFallbackHtml", () => {
    test("renders fallback banner with direct link and toggleable embed", () => {
      const html = renderGreekFallbackHtml("λόγος");
      expect(html).toContain('class="v2-greek-fallback"');
      expect(html).toContain('lang="el"');
      expect(html).not.toContain("v2-greek-badge");
      expect(html).toContain('class="v2-greek-title"');
      expect(html).toContain("This site does not (yet) support Greek.");
      expect(html).toContain("λόγος");
      expect(html).toContain(
        'href="https://logeion.uchicago.edu/%CE%BB%CF%8C%CE%B3%CE%BF%CF%82"'
      );
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');
      expect(html).toContain("<morcus-greek-embed");
      expect(html).toContain('class="v2-greek-details"');
      expect(html).toContain('class="v2-action-btn v2-greek-toggle-btn"');
      expect(html).toContain("Open Logeion Embed");
      expect(html).toContain("<iframe");
      expect(html).toContain('loading="lazy"');
      expect(html).toContain('class="v2-greek-frame"');
      expect(html).toContain('class="v2-greek-auto-open-checkbox"');
      expect(html).toContain("Automatically open embedded Logeion searches");
    });

    test("escapes HTML in query", () => {
      const html = renderGreekFallbackHtml("<script>λόγος</script>");
      expect(html).not.toContain("<script>λόγος</script>");
      expect(html).toContain("&lt;script&gt;λόγος&lt;/script&gt;");
    });

    test("is returned by renderDictResultsHtml when query has Greek", () => {
      const html = renderDictResultsHtml("λόγος");
      expect(html).toContain('class="v2-greek-fallback"');
      expect(html).toContain("This site does not (yet) support Greek.");
    });
  });

  describe("MorcusGreekEmbed client component", () => {
    beforeEach(() => {
      localStorage.clear();
      document.body.innerHTML = "";
    });

    afterEach(() => {
      document.body.innerHTML = "";
    });

    test("renders default state with embed closed and checkbox unchecked", () => {
      document.body.innerHTML = renderGreekFallbackHtml("λόγος");

      const embedEl = document.querySelector("morcus-greek-embed");
      const details =
        embedEl?.querySelector<HTMLDetailsElement>(".v2-greek-details");
      const toggleText = embedEl?.querySelector<HTMLElement>(
        ".v2-greek-toggle-text"
      );
      const checkbox = embedEl?.querySelector<HTMLInputElement>(
        ".v2-greek-auto-open-checkbox"
      );

      expect(embedEl).not.toBeNull();
      expect(details?.open).toBe(false);
      expect(checkbox?.checked).toBe(false);
      expect(toggleText?.textContent).toBe("Open Logeion Embed");
    });

    test("auto-opens embed when localStorage preference is set", () => {
      localStorage.setItem(EMBEDDED_LOGEION_SETTING_KEY, "true");
      document.body.innerHTML = renderGreekFallbackHtml("λόγος");

      const embedEl = document.querySelector("morcus-greek-embed");
      const details =
        embedEl?.querySelector<HTMLDetailsElement>(".v2-greek-details");
      const toggleText = embedEl?.querySelector<HTMLElement>(
        ".v2-greek-toggle-text"
      );
      const checkbox = embedEl?.querySelector<HTMLInputElement>(
        ".v2-greek-auto-open-checkbox"
      );

      expect(details?.open).toBe(true);
      expect(checkbox?.checked).toBe(true);
      expect(toggleText?.textContent).toBe("Close Logeion Embed");
    });

    test("auto-opens embed when GlobalSettings autoOpenLogeion is true", () => {
      settingsStore.update({ autoOpenLogeion: true });
      document.body.innerHTML = renderGreekFallbackHtml("λόγος");

      const embedEl = document.querySelector("morcus-greek-embed");
      const details =
        embedEl?.querySelector<HTMLDetailsElement>(".v2-greek-details");
      const checkbox = embedEl?.querySelector<HTMLInputElement>(
        ".v2-greek-auto-open-checkbox"
      );

      expect(details?.open).toBe(true);
      expect(checkbox?.checked).toBe(true);
    });

    test("checking auto-open checkbox saves setting and opens embed", () => {
      document.body.innerHTML = renderGreekFallbackHtml("λόγος");

      const embedEl = document.querySelector("morcus-greek-embed")!;
      const details =
        embedEl.querySelector<HTMLDetailsElement>(".v2-greek-details")!;
      const checkbox = embedEl.querySelector<HTMLInputElement>(
        ".v2-greek-auto-open-checkbox"
      )!;
      const toggleText = embedEl.querySelector<HTMLElement>(
        ".v2-greek-toggle-text"
      )!;

      expect(details.open).toBe(false);

      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change"));

      expect(localStorage.getItem(EMBEDDED_LOGEION_SETTING_KEY)).toBe("true");
      expect(settingsStore.get().autoOpenLogeion).toBe(true);
      expect(details.open).toBe(true);
      expect(toggleText.textContent).toBe("Close Logeion Embed");
    });

    test("toggling details updates button text and icon", () => {
      document.body.innerHTML = renderGreekFallbackHtml("λόγος");

      const embedEl = document.querySelector("morcus-greek-embed")!;
      const details =
        embedEl.querySelector<HTMLDetailsElement>(".v2-greek-details")!;
      const toggleText = embedEl.querySelector<HTMLElement>(
        ".v2-greek-toggle-text"
      )!;

      expect(toggleText.textContent).toBe("Open Logeion Embed");

      details.open = true;
      details.dispatchEvent(new Event("toggle"));
      expect(toggleText.textContent).toBe("Close Logeion Embed");

      details.open = false;
      details.dispatchEvent(new Event("toggle"));
      expect(toggleText.textContent).toBe("Open Logeion Embed");
    });
  });
});
