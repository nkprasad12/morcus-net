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
      highlightStrength: 50,
    });
    expect(
      resolveAppearance({ textScale: 400, highlightStrength: -5 })
    ).toMatchObject({ textScale: 160, highlightStrength: 0 });
  });

  test("stores defaults as absent, so they never pin a value", () => {
    expect(appearanceToSettings(resolveAppearance({}))).toEqual({
      darkMode: undefined,
      textFont: undefined,
      textScale: undefined,
      lineSpacing: undefined,
      highlightStrength: undefined,
    });
  });

  test("maps to pre-paint values, with null for every default", () => {
    expect(appearancePrepaint(resolveAppearance({}))).toEqual([
      ["data-theme", null],
      ["--font-text", null],
      ["--text-scale", null],
      ["--text-leading", null],
      ["--highlight-scale", null],
    ]);
    expect(
      appearancePrepaint(
        resolveAppearance({
          darkMode: true,
          textFont: "serif",
          textScale: 120,
          lineSpacing: "relaxed",
          highlightStrength: 30,
        })
      )
    ).toEqual([
      ["data-theme", "dark"],
      ["--font-text", "var(--font-serif)"],
      ["--text-scale", "1.20"],
      ["--text-leading", "1.12"],
      ["--highlight-scale", "0.6"],
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
    root().removeAttribute("style");
    document.body.innerHTML = "";
  }

  beforeEach(resetDocument);
  afterEach(resetDocument);

  const isOpen = () => panel().hasAttribute("open");

  /** Fakes the trigger's box and the viewport width, for the placement tests. */
  function layout(triggerRight: number, viewport: number): () => void {
    q<HTMLElement>("#appearance-btn").getBoundingClientRect = () =>
      ({ right: triggerRight, bottom: 60 } as DOMRect);
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: viewport,
    });
    return () => {
      delete (document.documentElement as { clientWidth?: number }).clientWidth;
    };
  }

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

  test("opens on the document event the settings links dispatch, placed under its trigger", () => {
    mountMenu();
    const restore = layout(900, 1000);
    try {
      document.dispatchEvent(new CustomEvent(OPEN_APPEARANCE_EVENT));
      expect(isOpen()).toBe(true);
      expect(panel().style.top).toBe("68px");
      expect(panel().style.left).toBe("600px");
    } finally {
      restore();
    }
  });

  test("stays inside a narrow viewport when the trigger is at the left (phones)", () => {
    mountMenu();
    const restore = layout(50, 360);
    try {
      document.dispatchEvent(new CustomEvent(OPEN_APPEARANCE_EVENT));
      expect(panel().style.left).toBe("8px");
    } finally {
      restore();
    }
  });

  test("adopts saved settings into the controls on connect", () => {
    settingsStore.update({
      darkMode: false,
      textFont: "serif",
      textScale: 130,
      lineSpacing: "compact",
      highlightStrength: 20,
    });
    mountMenu();
    const checked = (name: string) =>
      q<HTMLInputElement>(`input[name="${name}"]:checked`).value;
    expect(checked("appearance-theme")).toBe("light");
    expect(checked("appearance-font")).toBe("serif");
    expect(checked("appearance-spacing")).toBe("compact");
    expect(q("#appearance-size-label").textContent).toBe("130%");
    expect(q<HTMLInputElement>("#appearance-highlight").value).toBe("20");
    expect(q("#appearance-highlight-value").textContent).toBe("20%");
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

  test("the highlight slider applies while dragging and saves on release", () => {
    mountMenu();
    const slider = q<HTMLInputElement>("#appearance-highlight");
    slider.value = "30";
    slider.dispatchEvent(new Event("input"));
    expect(prop("--highlight-scale")).toBe("0.6");
    expect(settingsStore.get().highlightStrength).toBeUndefined();

    slider.dispatchEvent(new Event("change"));
    expect(settingsStore.get().highlightStrength).toBe(30);
    expect(prepaintSnapshot()["--highlight-scale"]).toBe("0.6");
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

    choose("appearance-theme", "system");
    choose("appearance-font", "sans");
    expect(frameRoot.hasAttribute("data-theme")).toBe(false);
    expect(frameRoot.style.getPropertyValue("--font-text")).toBe("");
  });
});
