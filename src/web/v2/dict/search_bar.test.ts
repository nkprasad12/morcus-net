/**
 * @jest-environment jsdom
 */
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

  /** The search form and the settings dialog's own form, parsed. */
  function forms(html: string) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return {
      doc,
      search: doc.querySelector<HTMLFormElement>("form.search-form")!,
      settings: doc.querySelector<HTMLFormElement>(
        "dialog#dict-settings form.dict-settings-form"
      )!,
    };
  }

  test("the search form carries the rendered d and o; the dialog's form owns the controls", () => {
    const html = renderDictSearchBar({
      query: "amare",
      action: "/v2/dicts",
      activeDicts: ["L&S", "GAF"],
      isInflected: true,
    });
    const { search, settings } = forms(html);

    // Searches keep what's on screen: L&S (1) + GAF (2) = 3.
    expect(new FormData(search).get("d")).toBe("3");
    expect(new FormData(search).get("o")).toBe("1");
    expect(search.querySelector('[name="dict"]')).toBeNull();

    // The dialog is outside the search form, so Enter in the search box never submits it.
    expect(search.contains(settings)).toBe(false);
    expect(settings.querySelectorAll('[name="dict"]')).toHaveLength(
      LatinDict.AVAILABLE.length
    );
    expect(settings.querySelector('[name="d"]')).toBeNull();
    expect(new FormData(settings).getAll("dict")).toEqual(["L&S", "GAF"]);
    expect(new FormData(settings).getAll("o")).toEqual(["0", "1"]);
    expect(new FormData(settings).get("q")).toBe("amare");
  });

  test("the tray trigger is a hash link to the dialog", () => {
    const { doc } = forms(
      renderDictSearchBar({ query: "amo", action: "/v2/dicts" })
    );
    const trigger = doc.querySelector<HTMLAnchorElement>("#dict-settings-btn")!;
    expect(trigger.getAttribute("href")).toBe("#dict-settings");
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(
      doc.querySelector("morcus-dict-settings > dialog#dict-settings")
    ).not.toBeNull();
    // The X needs JS; without it, Back (or Done) leaves.
    expect(
      doc
        .querySelector("#dict-settings [data-dialog-close]")
        ?.hasAttribute("data-js-only")
    ).toBe(true);
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

  test("Done is the settings form's save submitter", () => {
    const { settings } = forms(
      renderDictSearchBar({ query: "amo", action: "/v2/dicts" })
    );
    const submits = settings.querySelectorAll('button[type="submit"]');
    expect(submits).toHaveLength(1);
    expect(submits[0].classList.contains("dict-settings-done")).toBe(true);
    expect(submits[0].getAttribute("name")).toBe("save");
    expect(submits[0].getAttribute("value")).toBe("1");
  });

  test("the search form's only submit button is the search button, so Enter never saves", () => {
    const { search } = forms(
      renderDictSearchBar({ query: "amo", action: "/v2/dicts" })
    );
    const submits = search.querySelectorAll('button[type="submit"]');
    expect(submits).toHaveLength(1);
    expect(submits[0].classList.contains("search-btn")).toBe(true);
    expect(search.querySelector('[name="save"]')).toBeNull();
  });

  test("renders no guest chip or scoped marker by default", () => {
    const html = renderDictSearchBar({ query: "amo", action: "/v2/dicts" });
    expect(html).not.toContain("guest-chip");
    expect(html).not.toContain("settings-guest-note");
    expect(html).not.toContain("disabled");
    expect(html).not.toContain("data-scoped");
  });

  describe("guest mode", () => {
    const html = renderDictSearchBar({
      query: "amo",
      action: "/v2/dicts",
      activeDicts: ["GAF"],
      isInflected: false,
      guest: { returnHref: "/v2/dicts?q=amo&x=<" },
    });

    test("explains itself and links back to the user's settings", () => {
      expect(html).toContain("Using link settings");
      expect(html).toContain("settings-guest-note");
      const returnLink =
        '<a class="guest-return" href="/v2/dicts?q=amo&amp;x=&lt;">Restore saved</a>';
      // Once in the tray chip, once in the popover note.
      expect(html.split(returnLink).length - 1).toBe(2);
    });

    test("locks the content settings and offers no way to save", () => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const controls = doc.querySelectorAll<HTMLInputElement>(
        ".dict-checkbox, .inflected-checkbox"
      );
      expect(controls.length).toBeGreaterThan(1);
      for (const c of Array.from(controls)) expect(c.disabled).toBe(true);
      expect(doc.querySelector('[name="save"]')).toBeNull();
    });

    test("carries the link's settings in hidden fields, so a new search keeps them", () => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const form = doc.querySelector<HTMLFormElement>("form.search-form")!;
      const submitted = new URLSearchParams();
      for (const el of Array.from(form.elements)) {
        if (!(el instanceof HTMLInputElement) || el.disabled || !el.name)
          continue;
        if (el.type === "checkbox" && !el.checked) continue;
        submitted.append(el.name, el.value);
      }
      expect(submitted.getAll("d")).toEqual(["2"]);
      expect(submitted.getAll("o")).toEqual(["0"]);
      expect(submitted.getAll("dict")).toEqual([]);
    });
  });

  test("a scoped view marks the settings form data-scoped, and Done doesn't save", () => {
    const { settings } = forms(
      renderDictSearchBar({ query: "amo", action: "/v2/dicts", scoped: true })
    );
    expect(settings.hasAttribute("data-scoped")).toBe(true);
    expect(settings.querySelector('[name="save"]')).toBeNull();
    expect(settings.querySelector(".dict-settings-done")).not.toBeNull();
  });
});
