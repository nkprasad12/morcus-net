/**
 * @jest-environment jsdom
 */
import "@/web/ui/shell/appearance_menu.client";
import { PREPAINT_KEY, settingsStore } from "@/web/ui/core/index.client";
import {
  appearancePrepaint,
  appearanceToSettings,
  resolveAppearance,
} from "@/web/ui/shell/appearance.client";
import { OPEN_APPEARANCE_EVENT } from "@/web/ui/shell/appearance_events.common";
import { renderAppBar } from "@/web/ui/shell/page_shell.server";
import { THEME_COLOR } from "@/web/ui/shell/theme_color.common";

function prepaintSnapshot(): Record<string, string> {
  return JSON.parse(localStorage.getItem(PREPAINT_KEY) ?? "{}");
}

const root = () => document.documentElement;
const prop = (name: string) => root().style.getPropertyValue(name);

describe("appearance settings mapping", () => {
  test("resolves defaults and clamps out-of-range numbers", () => {
    expect(resolveAppearance({})).toEqual({
      theme: "system",
      textFont: "sans",
      textScale: 100,
      lineSpacing: "normal",
      contrastLight: "normal",
      contrastDark: "normal",
    });
    expect(resolveAppearance({ textScale: 400 })).toMatchObject({
      textScale: 160,
    });
    expect(resolveAppearance({ textScale: 10 })).toMatchObject({
      textScale: 70,
    });
  });

  test("stores defaults as absent, so they never pin a value", () => {
    expect(appearanceToSettings(resolveAppearance({}))).toEqual({
      darkMode: undefined,
      textFont: undefined,
      textScale: undefined,
      lineSpacing: undefined,
      textContrastLight: undefined,
      textContrastDark: undefined,
    });
  });

  test("maps to pre-paint values, with null for every default", () => {
    expect(appearancePrepaint(resolveAppearance({}))).toEqual([
      ["data-theme", null],
      ["--font-text", null],
      ["--text-scale", null],
      ["--text-leading", null],
      ["data-text-contrast-light", null],
      ["data-text-contrast-dark", null],
    ]);
    expect(
      appearancePrepaint(
        resolveAppearance({
          darkMode: true,
          textFont: "serif",
          textScale: 120,
          lineSpacing: "relaxed",
          textContrastLight: "softer",
          textContrastDark: "highest",
        })
      )
    ).toEqual([
      ["data-theme", "dark"],
      ["--font-text", "var(--font-serif)"],
      ["--text-scale", "1.20"],
      ["--text-leading", "1.12"],
      ["data-text-contrast-light", "softer"],
      ["data-text-contrast-dark", "highest"],
    ]);
  });
});

describe("MorcusAppearanceMenu", () => {
  function mountMenu(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = renderAppBar("dicts");
    const el = wrapper.querySelector<HTMLElement>("morcus-appearance-menu")!;
    document.body.appendChild(el);
    return el;
  }

  const q = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;
  const panel = () => q<HTMLElement>("#appearance-popover");

  function choose(name: string, value: string) {
    const radio = q<HTMLInputElement>(
      `input[name="${name}"][value="${value}"]`
    );
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function resetDocument() {
    localStorage.clear();
    root().removeAttribute("data-theme");
    root().removeAttribute("data-text-contrast-light");
    root().removeAttribute("data-text-contrast-dark");
    root().removeAttribute("style");
    document.body.innerHTML = "";
  }

  beforeEach(resetDocument);
  afterEach(resetDocument);

  const isOpen = () => panel().hasAttribute("open");

  test("is a modal dialog that the trigger opens and the close button closes", () => {
    mountMenu();
    expect(panel().tagName).toBe("DIALOG");
    expect(isOpen()).toBe(false);

    q<HTMLButtonElement>("#appearance-btn").click();
    expect(isOpen()).toBe(true);
    expect(q("#appearance-btn").getAttribute("aria-expanded")).toBe("true");

    q<HTMLButtonElement>("#appearance-close-btn").click();
    expect(isOpen()).toBe(false);
    expect(q("#appearance-btn").getAttribute("aria-expanded")).toBe("false");
  });

  test("opens centred on the document event the settings links dispatch", () => {
    mountMenu();
    document.dispatchEvent(new CustomEvent(OPEN_APPEARANCE_EVENT));
    expect(isOpen()).toBe(true);
    expect(q("#appearance-btn").getAttribute("aria-expanded")).toBe("true");
    // The UA styles centre a modal dialog; nothing is placed inline.
    expect(panel().style.top).toBe("");
    expect(panel().style.left).toBe("");
  });

  test("closes and resets its trigger when disconnected", () => {
    const el = mountMenu();
    q<HTMLButtonElement>("#appearance-btn").click();
    const btn = q("#appearance-btn");
    const dialog = panel();
    expect(dialog.hasAttribute("open")).toBe(true);
    el.remove();
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  test("adopts saved settings into the controls on connect", () => {
    settingsStore.update({
      darkMode: false,
      textFont: "serif",
      textScale: 130,
      lineSpacing: "compact",
    });
    mountMenu();
    const checked = (name: string) =>
      q<HTMLInputElement>(`input[name="${name}"]:checked`).value;
    expect(checked("appearance-theme")).toBe("light");
    expect(checked("appearance-font")).toBe("serif");
    expect(checked("appearance-spacing")).toBe("compact");
    expect(q("#appearance-size-label").textContent).toBe("130%");
  });

  test("has no highlight-strength control (it lives in the dictionary settings)", () => {
    mountMenu();
    expect(
      document.querySelector("#appearance-popover input[type=range]")
    ).toBeNull();
  });

  test("leaves the dictionary's highlight strength alone, even on reset", () => {
    settingsStore.update({ highlightStrength: 20, textScale: 120 });
    mountMenu();
    q<HTMLButtonElement>("#appearance-reset-btn").click();
    expect(settingsStore.get()).toEqual({ highlightStrength: 20 });
  });

  test("each control applies live, saves, and records pre-paint", () => {
    mountMenu();

    choose("appearance-font", "serif");
    expect(prop("--font-text")).toBe("var(--font-serif)");
    expect(settingsStore.get().textFont).toBe("serif");

    choose("appearance-spacing", "relaxed");
    expect(prop("--text-leading")).toBe("1.12");
    expect(settingsStore.get().lineSpacing).toBe("relaxed");

    q<HTMLButtonElement>("#appearance-size-inc").click();
    expect(prop("--text-scale")).toBe("1.05");
    expect(q("#appearance-size-label").textContent).toBe("105%");
    expect(settingsStore.get().textScale).toBe(105);

    expect(prepaintSnapshot()).toEqual(
      expect.objectContaining({
        "--font-text": "var(--font-serif)",
        "--text-leading": "1.12",
        "--text-scale": "1.05",
      })
    );
  });

  test("text size stops at its bounds and disables the stepper there", () => {
    settingsStore.update({ textScale: 155 });
    mountMenu();
    const inc = q<HTMLButtonElement>("#appearance-size-inc");
    inc.click();
    expect(settingsStore.get().textScale).toBe(160);
    expect(inc.disabled).toBe(true);
    inc.click();
    expect(settingsStore.get().textScale).toBe(160);
  });

  test("reset restores every default and clears the pre-paint values", () => {
    settingsStore.update({ darkMode: true, textFont: "serif", textScale: 120 });
    mountMenu();
    expect(root().getAttribute("data-theme")).toBe("dark");

    q<HTMLButtonElement>("#appearance-reset-btn").click();
    expect(root().hasAttribute("data-theme")).toBe(false);
    expect(prop("--font-text")).toBe("");
    expect(prop("--text-scale")).toBe("");
    expect(settingsStore.get()).toEqual({});
    expect(prepaintSnapshot()).toEqual({});
  });

  describe("theme (formerly the theme toggle)", () => {
    test("Light and Dark save and set data-theme; System clears both", () => {
      mountMenu();
      choose("appearance-theme", "dark");
      expect(root().getAttribute("data-theme")).toBe("dark");
      expect(settingsStore.get().darkMode).toBe(true);
      expect(prepaintSnapshot()["data-theme"]).toBe("dark");

      choose("appearance-theme", "light");
      expect(root().getAttribute("data-theme")).toBe("light");
      expect(settingsStore.get().darkMode).toBe(false);

      choose("appearance-theme", "system");
      expect(root().hasAttribute("data-theme")).toBe(false);
      expect(settingsStore.get().darkMode).toBeUndefined();
      expect(prepaintSnapshot()).not.toHaveProperty("data-theme");
    });

    test("heals the snapshot from the saved choice on connect", () => {
      settingsStore.update({ darkMode: true });
      localStorage.setItem(
        PREPAINT_KEY,
        JSON.stringify({ "data-theme": "light" })
      );
      root().setAttribute("data-theme", "light");

      mountMenu();

      expect(root().getAttribute("data-theme")).toBe("dark");
      expect(prepaintSnapshot()["data-theme"]).toBe("dark");
    });

    test("clears a stale snapshot theme when nothing is saved", () => {
      localStorage.setItem(
        PREPAINT_KEY,
        JSON.stringify({ "data-theme": "dark" })
      );
      root().setAttribute("data-theme", "dark");

      mountMenu();

      expect(root().hasAttribute("data-theme")).toBe(false);
      expect(prepaintSnapshot()).not.toHaveProperty("data-theme");
    });

    function addThemeColorMetas(): HTMLMetaElement[] {
      return (["light", "dark"] as const).map((scheme) => {
        const meta = document.createElement("meta");
        meta.name = "theme-color";
        meta.setAttribute("media", `(prefers-color-scheme: ${scheme})`);
        meta.content = "#000000";
        document.head.appendChild(meta);
        return meta;
      });
    }

    test("a saved theme overrides both <meta name=theme-color> tags; System restores each", () => {
      const metas = addThemeColorMetas();
      try {
        mountMenu();
        expect(metas.map((m) => m.content)).toEqual([
          THEME_COLOR.light,
          THEME_COLOR.dark,
        ]);

        choose("appearance-theme", "dark");
        expect(metas.map((m) => m.content)).toEqual([
          THEME_COLOR.dark,
          THEME_COLOR.dark,
        ]);

        choose("appearance-theme", "system");
        expect(metas.map((m) => m.content)).toEqual([
          THEME_COLOR.light,
          THEME_COLOR.dark,
        ]);
      } finally {
        metas.forEach((m) => m.remove());
      }
    });
  });

  describe("reading-text contrast, saved per theme", () => {
    /** A controllable `(prefers-color-scheme: dark)` for the "System" theme. */
    class FakeDarkQuery extends EventTarget {
      constructor(public matches: boolean) {
        super();
      }
      flip(matches: boolean) {
        this.matches = matches;
        this.dispatchEvent(new Event("change"));
      }
    }

    let query: FakeDarkQuery | undefined;
    const originalMatchMedia = window.matchMedia;
    function fakeOsScheme(dark: boolean): FakeDarkQuery {
      query = new FakeDarkQuery(dark);
      const mq = query;
      window.matchMedia = ((media: string) => {
        expect(media).toBe("(prefers-color-scheme: dark)");
        return mq;
      }) as unknown as typeof window.matchMedia;
      return mq;
    }
    afterEach(() => {
      window.matchMedia = originalMatchMedia;
      query = undefined;
    });

    const label = () => q("#appearance-contrast-label").textContent;
    const note = () => q("#appearance-contrast-note").textContent;
    const dec = () => q<HTMLButtonElement>("#appearance-contrast-dec");
    const inc = () => q<HTMLButtonElement>("#appearance-contrast-inc");

    test("the stepper edits only the theme on screen", () => {
      mountMenu();
      choose("appearance-theme", "light");
      expect(label()).toBe("normal");
      expect(note()).toBe("For the light theme");

      inc().click();
      expect(label()).toBe("higher");
      expect(root().getAttribute("data-text-contrast-light")).toBe("higher");
      expect(settingsStore.get()).toMatchObject({
        textContrastLight: "higher",
      });

      choose("appearance-theme", "dark");
      expect(label()).toBe("normal");
      expect(note()).toBe("For the dark theme");
      dec().click();
      expect(label()).toBe("softer");

      expect(settingsStore.get()).toMatchObject({
        textContrastLight: "higher",
        textContrastDark: "softer",
      });
      // Both stay on <html>: the CSS picks the theme's own.
      expect(prepaintSnapshot()).toEqual(
        expect.objectContaining({
          "data-text-contrast-light": "higher",
          "data-text-contrast-dark": "softer",
        })
      );

      choose("appearance-theme", "light");
      expect(label()).toBe("higher");
    });

    test("stops at both ends and disables the button there", () => {
      settingsStore.update({ darkMode: false, textContrastLight: "higher" });
      mountMenu();
      expect(dec().disabled).toBe(false);
      inc().click();
      expect(label()).toBe("highest");
      expect(inc().disabled).toBe(true);
      inc().click();
      expect(settingsStore.get().textContrastLight).toBe("highest");

      for (let i = 0; i < 5; i++) dec().click();
      expect(label()).toBe("softer");
      expect(dec().disabled).toBe(true);
      expect(inc().disabled).toBe(false);
    });

    test("Normal is stored as absent and clears the attribute", () => {
      settingsStore.update({ darkMode: false, textContrastLight: "higher" });
      mountMenu();
      expect(root().getAttribute("data-text-contrast-light")).toBe("higher");
      dec().click();
      expect(label()).toBe("normal");
      expect(settingsStore.get()).not.toHaveProperty("textContrastLight");
      expect(root().hasAttribute("data-text-contrast-light")).toBe(false);
      expect(prepaintSnapshot()).not.toHaveProperty("data-text-contrast-light");
    });

    test("under System, it follows the OS scheme, live", () => {
      const mq = fakeOsScheme(true);
      mountMenu();
      expect(note()).toBe("For the dark theme");
      inc().click();
      expect(settingsStore.get().textContrastDark).toBe("higher");

      mq.flip(false);
      expect(note()).toBe("For the light theme");
      expect(label()).toBe("normal");
      inc().click();
      expect(settingsStore.get()).toMatchObject({
        textContrastLight: "higher",
        textContrastDark: "higher",
      });
    });

    test("without matchMedia, System edits the light theme", () => {
      // jsdom has no matchMedia, like the oldest browsers we serve.
      mountMenu();
      expect(note()).toBe("For the light theme");
    });

    test("reset restores Normal in both themes", () => {
      settingsStore.update({
        textContrastLight: "softer",
        textContrastDark: "highest",
      });
      mountMenu();
      q<HTMLButtonElement>("#appearance-reset-btn").click();
      expect(settingsStore.get()).toEqual({});
      expect(root().hasAttribute("data-text-contrast-light")).toBe(false);
      expect(root().hasAttribute("data-text-contrast-dark")).toBe(false);
    });
  });

  test("mirrors changes into same-origin iframes (the reader's dictionary)", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    iframe.contentDocument!.write("<html><head></head><body></body></html>");
    iframe.contentDocument!.close();
    mountMenu();
    const frameRoot = iframe.contentDocument!.documentElement;

    choose("appearance-theme", "dark");
    choose("appearance-font", "serif");
    expect(frameRoot.getAttribute("data-theme")).toBe("dark");
    expect(frameRoot.style.getPropertyValue("--font-text")).toBe(
      "var(--font-serif)"
    );
    // Contrast too: the embedded dictionary has no menu of its own.
    q<HTMLButtonElement>("#appearance-contrast-inc").click();
    expect(frameRoot.getAttribute("data-text-contrast-dark")).toBe("higher");

    choose("appearance-theme", "system");
    choose("appearance-font", "sans");
    expect(frameRoot.hasAttribute("data-theme")).toBe(false);
    expect(frameRoot.style.getPropertyValue("--font-text")).toBe("");
  });
});
