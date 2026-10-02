/**
 * @jest-environment jsdom
 */
import "@/web/v2/dict/dict_settings.client";
import type { DictSettingsCommit } from "@/web/v2/dict/dict_settings.client";
import { revealHashTarget } from "@/web/v2/core/reveal.client";
import { renderDictSearchBar } from "@/web/v2/dict/search_bar.server";

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
  wrapper.innerHTML = renderDictSearchBar({ action: "/v2/dicts", ...options });
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
    ).toBe("1");
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

    m.dialog.querySelector<HTMLElement>("[data-dialog-close]")!.click();
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
    // Connect recorded the initial scale for pre-paint; the input tick didn't.
    const prepaint = () =>
      JSON.parse(localStorage.getItem("morcus_prepaint") ?? "{}");
    expect(prepaint()["--highlight-scale"]).toBe("1");

    slider.dispatchEvent(new Event("change"));
    expect(JSON.parse(localStorage.getItem("GlobalSettings")!)).toEqual(
      expect.objectContaining({ highlightStrength: 80 })
    );
    expect(prepaint()["--highlight-scale"]).toBe("1.6");
    // Strength isn't a content setting.
    expect(m.commits).toEqual([]);
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
    // Regression (F1–F5): the client used to re-resolve URL → localStorage → default and then
    // overwrite the server-rendered checkboxes with the result.
    window.history.replaceState({}, "", "/v2/dicts?q=amo&d=an&o=1");
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

  describe("pre-hydration edits (PH1)", () => {
    test("edits in a still-open (hash-targeted) dialog are a draft that applies on close", () => {
      window.history.replaceState(null, "", "/v2/dicts#dict-settings");
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
});

describe("MorcusDictSettings in scoped and guest views", () => {
  test("a scoped view never saves changes, but still applies them", () => {
    const m = mount({ activeDicts: ["L&S"], scoped: true });
    m.trigger.click();
    toggle(checkbox(m.el, "GAF"), true);
    toggle(m.el.querySelector<HTMLInputElement>("#toggle-inflected")!, false);
    clickDone(m);

    expect(m.commits).toHaveLength(1);
    expect(document.cookie).not.toContain("morcus_d=");
    expect(document.cookie).not.toContain("morcus_inflected=");
  });

  test("guest mode's locked controls stay locked, and Done only closes", () => {
    document.cookie = "morcus_d=1; Path=/"; // L&S only
    const m = mount({
      activeDicts: ["GAF"],
      guest: { returnHref: "/v2/dicts?q=amo" },
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
