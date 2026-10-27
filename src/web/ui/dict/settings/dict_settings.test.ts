/**
 * @jest-environment jsdom
 */
import "@/web/ui/dict/settings/dict_settings.client";
import type { DictSettingsCommit } from "@/web/ui/dict/settings/dict_settings.client";
import {
  revealHashTarget,
  revealTarget,
} from "@/web/ui/core/nav/reveal.client";
import { renderDictSearchBar } from "@/web/ui/dict/search/search_bar.server";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import {
  decodeDictBitmask,
  encodeDictBitmask,
} from "@/web/ui/dict/settings/dict_bitmask.common";
import { OPEN_APPEARANCE_EVENT } from "@/web/ui/shell/appearance_events.common";

type BarOptions = Partial<Parameters<typeof renderDictSearchBar>[0]>;

interface Mounted {
  el: HTMLElement;
  trigger: HTMLElement;
  dialog: HTMLDialogElement;
  form: HTMLFormElement;
  commits: DictSettingsCommit[];
}

/** Builds the whole search bar (trigger in the search form, dialog after it), detached. */
function build(options: BarOptions = {}): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderDictSearchBar({ action: "/dicts", ...options });
  return wrapper;
}

function attach(wrapper: HTMLDivElement): Mounted {
  const el = wrapper.querySelector<HTMLElement>("morcus-dict-settings")!;
  const commits: DictSettingsCommit[] = [];
  el.addEventListener("dict-settings-commit", (e) => {
    if (e instanceof CustomEvent) commits.push(e.detail);
  });
  document.body.appendChild(wrapper);
  return {
    el,
    trigger: document.querySelector<HTMLElement>("#dict-settings-btn")!,
    dialog: el.querySelector<HTMLDialogElement>("dialog#dict-settings")!,
    form: el.querySelector<HTMLFormElement>("form.dict-settings-form")!,
    commits,
  };
}

function mount(options: BarOptions = {}): Mounted {
  return attach(build(options));
}

function checkbox(root: ParentNode, key: string): HTMLInputElement {
  return root.querySelector<HTMLInputElement>(
    `.dict-checkbox[data-key="${key}"]`
  )!;
}

function toggle(input: HTMLInputElement, checked: boolean) {
  input.checked = checked;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function clickDone(m: Mounted) {
  m.dialog.querySelector<HTMLElement>(".dict-settings-done")!.click();
}

function clearCookies() {
  for (const name of ["morcus_d", "morcus_inflected"]) {
    document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
}

beforeEach(() => {
  localStorage.clear();
  clearCookies();
  document.documentElement.style.removeProperty("--highlight-scale");
  document.documentElement.removeAttribute("data-highlight-style");
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  document.body.innerHTML = "";
  clearCookies();
  window.history.replaceState(null, "", "/");
});

describe("MorcusDictSettings", () => {
  test("renders default state with 50% highlight strength, dialog closed", () => {
    const m = mount();
    expect(m.dialog.open).toBe(false);
    expect(
      m.el.querySelector<HTMLInputElement>(".settings-slider")?.value
    ).toBe("50");
    expect(m.el.querySelector(".settings-value")?.textContent).toBe("50%");
    expect(
      document.documentElement.style.getPropertyValue("--highlight-scale")
    ).toBe("");
  });

  test("loads initial strength from localStorage if present", () => {
    localStorage.setItem(
      "GlobalSettings",
      JSON.stringify({ highlightStrength: 20, darkMode: false })
    );
    const m = mount();
    expect(
      m.el.querySelector<HTMLInputElement>(".settings-slider")?.value
    ).toBe("20");
    expect(m.el.querySelector(".settings-value")?.textContent).toBe("20%");
    expect(
      document.documentElement.style.getPropertyValue("--highlight-scale")
    ).toBe("0.4");
  });

  test("the trigger opens the dialog and tracks aria-expanded", () => {
    const m = mount();
    m.trigger.click();
    expect(m.dialog.open).toBe(true);
    expect(m.trigger.getAttribute("aria-expanded")).toBe("true");

    clickDone(m);
    expect(m.dialog.open).toBe(false);
    expect(m.trigger.getAttribute("aria-expanded")).toBe("false");
  });

  test("highlight strength is live: scale on input, persisted on change", () => {
    const m = mount();
    const slider = m.el.querySelector<HTMLInputElement>(".settings-slider")!;

    slider.value = "80";
    slider.dispatchEvent(new Event("input"));
    expect(
      document.documentElement.style.getPropertyValue("--highlight-scale")
    ).toBe("1.6");
    expect(m.el.querySelector(".settings-value")?.textContent).toBe("80%");
    expect(localStorage.getItem("GlobalSettings")).toBeNull();
    // Connect omitted the default scale from pre-paint; the input tick didn't record yet.
    const prepaint = () =>
      JSON.parse(localStorage.getItem("morcus_prepaint") ?? "{}");
    expect(prepaint()["--highlight-scale"]).toBeUndefined();

    slider.dispatchEvent(new Event("change"));
    expect(JSON.parse(localStorage.getItem("GlobalSettings")!)).toEqual(
      expect.objectContaining({ highlightStrength: 80 })
    );
    expect(prepaint()["--highlight-scale"]).toBe("1.6");

    // Returning to the default (50%) removes the inline property and pre-paint entry.
    slider.value = "50";
    slider.dispatchEvent(new Event("input"));
    expect(
      document.documentElement.style.getPropertyValue("--highlight-scale")
    ).toBe("");
    slider.dispatchEvent(new Event("change"));
    expect(prepaint()["--highlight-scale"]).toBeUndefined();
    // Strength isn't a content setting.
    expect(m.commits).toEqual([]);
  });

  describe("highlight style", () => {
    const radio = (m: Mounted, value: string) =>
      m.el.querySelector<HTMLInputElement>(
        `input[name="highlight-style"][value="${value}"]`
      )!;
    const prepaint = () =>
      JSON.parse(localStorage.getItem("morcus_prepaint") ?? "{}");
    const root = () => document.documentElement;

    test("is rendered disabled, so it never joins the no-JS form submission", () => {
      const wrapper = build();
      const radios = wrapper.querySelectorAll<HTMLInputElement>(
        'input[name="highlight-style"]'
      );
      expect(radios).toHaveLength(2);
      for (const r of radios) expect(r.disabled).toBe(true);
      const form = wrapper.querySelector<HTMLFormElement>("form")!;
      expect(new FormData(form).has("highlight-style")).toBe(false);
    });

    test("is enabled on upgrade, Highlight by default", () => {
      const m = mount();
      expect(radio(m, "background").disabled).toBe(false);
      expect(radio(m, "background").checked).toBe(true);
      expect(root().hasAttribute("data-highlight-style")).toBe(false);
    });

    test("Colored text applies live, saves, and records pre-paint", () => {
      const m = mount();
      toggle(radio(m, "text"), true);
      expect(root().getAttribute("data-highlight-style")).toBe("text");
      expect(JSON.parse(localStorage.getItem("GlobalSettings")!)).toEqual(
        expect.objectContaining({ highlightStyle: "text" })
      );
      expect(prepaint()["data-highlight-style"]).toBe("text");

      // Highlight is the default: stored as absent, attribute removed.
      toggle(radio(m, "background"), true);
      expect(root().hasAttribute("data-highlight-style")).toBe(false);
      expect(
        JSON.parse(localStorage.getItem("GlobalSettings") ?? "{}")
      ).not.toHaveProperty("highlightStyle");
      expect(prepaint()).not.toHaveProperty("data-highlight-style");
      // Neither is a content setting.
      expect(m.commits).toEqual([]);
    });

    test("adopts the saved style and heals a stale snapshot on connect", () => {
      localStorage.setItem(
        "GlobalSettings",
        JSON.stringify({ highlightStyle: "text" })
      );
      localStorage.setItem("morcus_prepaint", JSON.stringify({}));
      const m = mount();
      expect(radio(m, "text").checked).toBe(true);
      expect(root().getAttribute("data-highlight-style")).toBe("text");
      expect(prepaint()["data-highlight-style"]).toBe("text");
    });

    test("is disabled again on disconnect, so a left-behind form omits it", () => {
      const m = mount();
      expect(new FormData(m.form).has("highlight-style")).toBe(true);
      m.el.remove();
      expect(radio(m, "background").disabled).toBe(true);
      expect(new FormData(m.form).has("highlight-style")).toBe(false);
    });

    test("ignores an invalid saved style", () => {
      localStorage.setItem(
        "GlobalSettings",
        JSON.stringify({ highlightStyle: "neon" })
      );
      const m = mount();
      expect(radio(m, "background").checked).toBe(true);
      expect(root().hasAttribute("data-highlight-style")).toBe(false);
    });
  });

  test("content changes apply only when the dialog closes, once", () => {
    const m = mount();
    m.trigger.click();

    toggle(checkbox(m.el, "L&S"), false);
    toggle(checkbox(m.el, "EGL"), true);
    const inflected =
      m.el.querySelector<HTMLInputElement>("#toggle-inflected")!;
    toggle(inflected, false);

    // Nothing applies while the dialog is open.
    expect(m.commits).toEqual([]);
    expect(document.cookie).not.toContain("morcus_d=");

    clickDone(m);
    expect(m.dialog.open).toBe(false);
    expect(m.commits).toHaveLength(1);
    expect(m.commits[0].dictKeys).toContain("EGL");
    expect(m.commits[0].dictKeys).not.toContain("L&S");
    expect(m.commits[0].isInflected).toBe(false);
    expect(m.commits[0].bitmask).toBeTruthy();
    expect(document.cookie).toContain("morcus_d=");
    expect(document.cookie).toContain("morcus_inflected=0");
    // The cookie is the only durable store.
    expect(localStorage.getItem("SEARCH_SETTINGS_KEY")).toBeNull();
    expect(localStorage.getItem("GlobalSettings") ?? "").not.toContain(
      "inflectedSearch"
    );
  });

  test("Escape commits too, without committing twice", () => {
    const m = mount();
    m.trigger.click();
    toggle(checkbox(m.el, "EGL"), true);

    // Native Escape fires `cancel` then `close`.
    m.dialog.dispatchEvent(new Event("cancel"));
    m.dialog.removeAttribute("open");
    m.dialog.dispatchEvent(new Event("close"));

    expect(m.commits).toHaveLength(1);
  });

  test("closing with nothing changed commits nothing", () => {
    const m = mount();
    m.trigger.click();
    toggle(checkbox(m.el, "EGL"), true);
    toggle(checkbox(m.el, "EGL"), false);
    clickDone(m);

    expect(m.commits).toEqual([]);
    expect(document.cookie).not.toContain("morcus_d=");
  });

  test("a second session diffs against the last commit", () => {
    const m = mount();
    m.trigger.click();
    toggle(checkbox(m.el, "EGL"), true);
    clickDone(m);

    m.trigger.click();
    clickDone(m);
    expect(m.commits).toHaveLength(1);

    m.trigger.click();
    toggle(checkbox(m.el, "EGL"), false);
    clickDone(m);
    expect(m.commits).toHaveLength(2);
    expect(m.commits[1].dictKeys).not.toContain("EGL");
  });

  test("adopts the server-rendered selection, ignoring the URL and localStorage", () => {
    // The client adopts the server-rendered checkboxes rather than re-resolving
    // the URL or localStorage.
    window.history.replaceState({}, "", "/dicts?q=amo&d=an&o=1");
    localStorage.setItem("SEARCH_SETTINGS_KEY", "L&S;GRG");
    localStorage.setItem(
      "GlobalSettings",
      JSON.stringify({ inflectedSearch: true })
    );

    const m = mount({ activeDicts: ["GAF"], isInflected: false });

    const checked = Array.from(
      m.el.querySelectorAll<HTMLInputElement>(".dict-checkbox")
    )
      .filter((cb) => cb.checked)
      .map((cb) => cb.dataset.key);
    expect(checked).toEqual(["GAF"]);
    expect(
      m.el.querySelector<HTMLInputElement>("#toggle-inflected")!.checked
    ).toBe(false);
  });

  test("disconnecting closes the dialog and drops the draft", () => {
    const m = mount();
    m.trigger.click();
    toggle(checkbox(m.el, "EGL"), true);

    m.el.remove();
    expect(m.dialog.open).toBe(false);
    expect(m.trigger.getAttribute("aria-expanded")).toBe("false");
    expect(checkbox(m.el, "EGL").checked).toBe(false);
    expect(m.commits).toEqual([]);
  });

  test("unchecking every dictionary disables Done and restores committed selection on Escape", () => {
    const m = mount({ activeDicts: ["L&S"] });
    const doneBtn = m.dialog.querySelector<HTMLButtonElement>(
      "button.dict-settings-done"
    )!;
    expect(doneBtn.disabled).toBe(false);

    m.trigger.click();
    toggle(checkbox(m.el, "L&S"), false);
    expect(doneBtn.disabled).toBe(true);

    // Closing via Escape with 0 dictionaries checked restores the committed selection without committing.
    m.dialog.dispatchEvent(new Event("cancel"));
    m.dialog.removeAttribute("open");
    m.dialog.dispatchEvent(new Event("close"));

    expect(m.commits).toEqual([]);
    expect(checkbox(m.el, "L&S").checked).toBe(true);
    expect(doneBtn.disabled).toBe(false);
    expect(document.cookie).not.toContain("morcus_d=");
  });

  test("committing an inflection-only change saves both morcus_d and morcus_inflected cookies", () => {
    const m = mount({ activeDicts: ["L&S", "GAF"], isInflected: true });
    m.trigger.click();
    toggle(m.el.querySelector<HTMLInputElement>("#toggle-inflected")!, false);
    clickDone(m);

    expect(m.commits).toHaveLength(1);
    expect(document.cookie).toContain("morcus_d=3");
    expect(document.cookie).toContain("morcus_inflected=0");
  });

  describe("pre-hydration edits (PH1)", () => {
    test("edits in a still-open (hash-targeted) dialog are a draft that applies on close", () => {
      window.history.replaceState(null, "", "/dicts#dict-settings");
      const wrapper = build();
      // The user opened the dialog via `:target` and clicked before the upgrade.
      toggle(checkbox(wrapper, "L&S"), false);
      toggle(checkbox(wrapper, "EGL"), true);

      const m = attach(wrapper);
      // Page-ready hands the hash over: the element opens the dialog and clears the hash.
      revealHashTarget();
      expect(m.dialog.open).toBe(true);
      expect(window.location.hash).toBe("");
      expect(checkbox(m.el, "L&S").checked).toBe(false);
      expect(checkbox(m.el, "EGL").checked).toBe(true);
      expect(m.commits).toEqual([]);

      clickDone(m);
      expect(m.commits).toHaveLength(1);
      expect(m.commits[0].dictKeys).toContain("EGL");
      expect(m.commits[0].dictKeys).not.toContain("L&S");
    });

    test("edits in a dialog closed again before upgrade are discarded", () => {
      const wrapper = build();
      toggle(checkbox(wrapper, "EGL"), true);

      const m = attach(wrapper);
      expect(m.dialog.open).toBe(false);
      expect(checkbox(m.el, "EGL").checked).toBe(false);
      expect(m.commits).toEqual([]);
    });
  });

  describe("appearance link", () => {
    function link(m: Mounted): HTMLButtonElement {
      return m.el.querySelector<HTMLButtonElement>("#dict-appearance-link")!;
    }

    function addAppearanceMenu() {
      document.body.appendChild(
        document.createElement("morcus-appearance-menu")
      );
    }

    test("is hidden when the page has no Appearance menu (embedded views)", () => {
      const m = mount();
      expect(link(m)).not.toBeNull();
      expect(link(m).hidden).toBe(true);
    });

    test("is shown when the page has an Appearance menu", () => {
      addAppearanceMenu();
      const m = mount();
      expect(link(m).hidden).toBe(false);
    });

    test("closes the dialog, commits the draft, and opens the Appearance menu", () => {
      addAppearanceMenu();
      const m = mount();
      const opened = jest.fn();
      document.addEventListener(OPEN_APPEARANCE_EVENT, opened);
      try {
        m.trigger.click();
        expect(m.dialog.open).toBe(true);
        toggle(checkbox(m.el, "EGL"), true);

        link(m).click();

        expect(m.dialog.open).toBe(false);
        expect(m.trigger.getAttribute("aria-expanded")).toBe("false");
        expect(m.commits).toHaveLength(1);
        expect(m.commits[0].dictKeys).toContain("EGL");
        expect(opened).toHaveBeenCalledTimes(1);
        expect(opened.mock.calls[0][0]).toBeInstanceOf(CustomEvent);
      } finally {
        document.removeEventListener(OPEN_APPEARANCE_EVENT, opened);
      }
    });
  });

  test("revealing the dialog is idempotent when called twice", () => {
    const m = mount();
    const setAttr = jest.spyOn(m.dialog, "setAttribute");
    expect(m.dialog.open).toBe(false);

    revealTarget(m.dialog);
    expect(m.dialog.open).toBe(true);
    expect(m.trigger.getAttribute("aria-expanded")).toBe("true");
    expect(setAttr).toHaveBeenCalledTimes(1);

    // Already open: revealing again is a no-op rather than re-opening or toggling.
    revealTarget(m.dialog);
    expect(m.dialog.open).toBe(true);
    expect(m.trigger.getAttribute("aria-expanded")).toBe("true");
    expect(setAttr).toHaveBeenCalledTimes(1);
  });
});

describe("MorcusDictSettings in scoped and guest views", () => {
  test("a scoped lang=La view saves only its dictionaries, and never inflection", () => {
    // Every dictionary saved, plus a stale inflection preference that must survive.
    document.cookie = `morcus_d=${encodeDictBitmask(
      LatinDict.AVAILABLE.map((d) => d.key)
    )}; Path=/`;
    document.cookie = "morcus_inflected=0; Path=/";
    const m = mount({
      activeDicts: ["L&S", "GAF", "GES", "FOR", "NUM"],
      isInflected: true,
      scoped: true,
      lang: "La",
    });
    m.trigger.click();
    toggle(checkbox(m.el, "GAF"), false);
    clickDone(m);

    expect(m.commits).toEqual([
      expect.objectContaining({
        dictKeys: ["L&S", "GES", "FOR", "NUM"],
        isInflected: true,
      }),
    ]);
    const saved = decodeDictBitmask(
      /morcus_d=([^;]+)/.exec(document.cookie)![1]
    );
    expect(new Set(saved)).toEqual(
      new Set(["L&S", "GES", "FOR", "NUM", "S&H", "R&A", "GRG", "EGL"])
    );
    expect(document.cookie).toContain("morcus_inflected=0");
  });

  test("a scoped save merges against the cookie as it is at commit time", () => {
    const m = mount({ activeDicts: ["L&S"], scoped: true, lang: "La" });
    // Another tab saves S&H only after this page rendered.
    document.cookie = `morcus_d=${encodeDictBitmask(["S&H"])}; Path=/`;
    m.trigger.click();
    toggle(checkbox(m.el, "GAF"), true);
    clickDone(m);

    const saved = decodeDictBitmask(
      /morcus_d=([^;]+)/.exec(document.cookie)![1]
    );
    expect(new Set(saved)).toEqual(new Set(["L&S", "GAF", "S&H"]));
  });

  test("guest mode's locked controls stay locked, and Done only closes", () => {
    document.cookie = "morcus_d=1; Path=/"; // L&S only
    const m = mount({
      activeDicts: ["GAF"],
      guest: { returnHref: "/dicts?q=amo" },
    });

    const controls = Array.from(
      m.el.querySelectorAll<HTMLInputElement>(
        ".dict-checkbox, #toggle-inflected"
      )
    );
    expect(controls.every((c) => c.disabled)).toBe(true);
    const checked = controls
      .filter((c) => c.classList.contains("dict-checkbox") && c.checked)
      .map((c) => c.dataset.key);
    expect(checked).toEqual(["GAF"]);

    m.trigger.click();
    clickDone(m);
    expect(m.dialog.open).toBe(false);
    expect(m.commits).toEqual([]);
    expect(document.cookie).toContain("morcus_d=1");
  });
});
