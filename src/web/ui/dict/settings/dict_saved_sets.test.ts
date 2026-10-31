/**
 * @jest-environment jsdom
 */
import "@/web/ui/dict/settings/dict_settings.client";
import type { DictSettingsCommit } from "@/web/ui/dict/settings/dict_settings.client";
import { renderDictSearchBar } from "@/web/ui/dict/search/search_bar.server";
import { DEFAULT_DICT_KEYS } from "@/web/ui/dict/settings/dict_bitmask.common";
import {
  DICT_SETS_KEY,
  readDictSets,
} from "@/web/ui/dict/settings/dict_saved_sets.client";

type BarOptions = Partial<Parameters<typeof renderDictSearchBar>[0]>;

function clearCookies() {
  for (const name of ["morcus_d", "morcus_inflected"]) {
    document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
}

function mount(options: BarOptions = {}) {
  document.body.innerHTML = `<div>${renderDictSearchBar({
    action: "/dicts",
    activeDicts: [...DEFAULT_DICT_KEYS],
    ...options,
  })}</div>`;
  const el = document.querySelector<HTMLElement>("morcus-dict-settings")!;
  const commits: DictSettingsCommit[] = [];
  el.addEventListener("dict-settings-commit", (e) => {
    if (e instanceof CustomEvent) commits.push(e.detail);
  });
  const dialog = el.querySelector<HTMLDialogElement>("dialog")!;
  document.querySelector<HTMLElement>("#dict-settings-btn")!.click();
  return { el, dialog, commits };
}

function checkedKeys(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(".dict-checkbox:checked"),
    (cb) => cb.dataset.key!
  );
}

/** Ticks exactly `keys`. */
function tick(keys: readonly string[]) {
  for (const cb of document.querySelectorAll<HTMLInputElement>(
    ".dict-checkbox"
  )) {
    cb.checked = keys.includes(cb.dataset.key!);
  }
}

function nameField(el: HTMLElement): HTMLInputElement {
  return el.querySelector<HTMLInputElement>(".dict-set-name")!;
}

function chipNames(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll(".dict-set-apply"), (b) =>
    b.textContent!.trim()
  );
}

beforeEach(() => {
  localStorage.clear();
  clearCookies();
  window.history.replaceState(null, "", "/dicts");
});

afterEach(() => {
  document.body.innerHTML = "";
  jest.restoreAllMocks();
});

describe("saved dictionary sets", () => {
  test("Save current stores the ticked dictionaries under the typed name", () => {
    const { el } = mount();
    tick(["S&H", "R&A"]);
    nameField(el).value = " Prose ";
    el.querySelector<HTMLElement>(".dict-set-save")!.click();

    expect(readDictSets()).toEqual([{ name: "Prose", d: "1c" }]);
    expect(chipNames(el)).toEqual(["Prose"]);
    expect(el.querySelector(".dict-set-apply")!.getAttribute("title")).toBe(
      "S&H, R&A"
    );
    expect(nameField(el).value).toBe("");
    // Confirmed in the field, until the user types again.
    expect(nameField(el).placeholder).toBe("Saved \u201cProse\u201d");
    nameField(el).value = "x";
    nameField(el).dispatchEvent(new Event("input", { bubbles: true }));
    expect(nameField(el).placeholder).toBe("Name (optional)");
  });

  test("sets are picked above the dictionary list and saved below it", () => {
    localStorage.setItem(
      DICT_SETS_KEY,
      JSON.stringify([{ name: "Prose", d: "1c" }])
    );
    const { el } = mount();
    const list = el.querySelector(".dict-list")!;
    const follows = (a: Element, b: Element) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows(el.querySelector("#dict-saved-list")!, list)).toBe(true);
    expect(follows(list, el.querySelector(".dict-save-set")!)).toBe(true);
  });

  test("a blank name falls back to the dictionaries' keys", () => {
    const { el } = mount();
    tick(["L&S", "GAF"]);
    nameField(el).value = "   ";
    el.querySelector<HTMLElement>(".dict-set-save")!.click();
    expect(chipNames(el)).toEqual(["L&S, GAF"]);
  });

  test("Enter in the name field saves and keeps the dialog open", () => {
    const { el, dialog, commits } = mount();
    tick(["L&S"]);
    nameField(el).value = "LS";
    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    nameField(el).dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(chipNames(el)).toEqual(["LS"]);
    expect(dialog.open).toBe(true);
    expect(commits).toEqual([]);
  });

  test("nothing is saved with no dictionaries ticked", () => {
    const { el } = mount();
    tick([]);
    nameField(el).value = "Empty";
    el.querySelector<HTMLElement>(".dict-set-save")!.click();
    expect(readDictSets()).toEqual([]);
  });

  test("saving under an existing name replaces that set in place", () => {
    localStorage.setItem(
      DICT_SETS_KEY,
      JSON.stringify([
        { name: "Prose", d: "1c" },
        { name: "Latin", d: "f" },
      ])
    );
    const { el } = mount();
    tick(["L&S"]);
    nameField(el).value = "prose";
    el.querySelector<HTMLElement>(".dict-set-save")!.click();
    expect(readDictSets()).toEqual([
      { name: "prose", d: "1" },
      { name: "Latin", d: "f" },
    ]);
  });

  test("picking a set ticks exactly its dictionaries, closes, and commits once", () => {
    localStorage.setItem(
      DICT_SETS_KEY,
      JSON.stringify([{ name: "Prose", d: "1c" }])
    );
    const { el, dialog, commits } = mount();
    el.querySelector<HTMLElement>(".dict-set-apply")!.click();

    expect(dialog.open).toBe(false);
    expect(checkedKeys()).toEqual(["S&H", "R&A"]);
    expect(commits).toEqual([
      { dictKeys: ["S&H", "R&A"], bitmask: "1c", isInflected: true },
    ]);
    expect(document.cookie).toContain("morcus_d=1c");
  });

  test("× removes a set", () => {
    localStorage.setItem(
      DICT_SETS_KEY,
      JSON.stringify([
        { name: "Prose", d: "1c" },
        { name: "Latin", d: "f" },
      ])
    );
    const { el } = mount();
    el.querySelector<HTMLElement>(".dict-set-remove")!.click();
    expect(chipNames(el)).toEqual(["Latin"]);
    expect(readDictSets()).toEqual([{ name: "Latin", d: "f" }]);
  });

  test("chips act on their set by name, even after another tab changed the list", () => {
    localStorage.setItem(
      DICT_SETS_KEY,
      JSON.stringify([
        { name: "Prose", d: "1c" },
        { name: "Verse", d: "f" },
      ])
    );
    const { el, dialog } = mount();
    // Another tab removes "Prose"; this page's chips are now stale.
    localStorage.setItem(
      DICT_SETS_KEY,
      JSON.stringify([{ name: "Verse", d: "f" }])
    );
    el.querySelector<HTMLElement>(
      '.dict-set-remove[data-name="Prose"]'
    )!.click();
    expect(readDictSets()).toEqual([{ name: "Verse", d: "f" }]);

    localStorage.setItem(DICT_SETS_KEY, JSON.stringify([]));
    el.querySelector<HTMLElement>(
      '.dict-set-apply[data-name="Verse"]'
    )!.click();
    // A set that no longer exists ticks nothing and leaves the dialog open.
    expect(dialog.open).toBe(true);
  });

  test("opening the dialog redraws the chips from storage", () => {
    const { el, dialog } = mount();
    dialog.querySelector<HTMLElement>(".dict-settings-done")!.click();
    localStorage.setItem(
      DICT_SETS_KEY,
      JSON.stringify([{ name: "Prose", d: "1c" }])
    );
    document.querySelector<HTMLElement>("#dict-settings-btn")!.click();
    expect(chipNames(el)).toEqual(["Prose"]);
  });

  test("Save these is disabled while no dictionary is ticked", () => {
    const { el } = mount();
    const save = el.querySelector<HTMLButtonElement>(".dict-set-save")!;
    expect(save.disabled).toBe(false);
    tick([]);
    el.querySelector("form")!.dispatchEvent(
      new Event("change", { bubbles: true })
    );
    expect(save.disabled).toBe(true);
  });

  test("closing the dialog clears the name field and its confirmation", () => {
    const { el, dialog } = mount();
    nameField(el).value = "Prose";
    el.querySelector<HTMLElement>(".dict-set-save")!.click();
    nameField(el).value = "draft";
    dialog.querySelector<HTMLElement>(".dict-settings-done")!.click();
    expect(nameField(el).value).toBe("");
    expect(nameField(el).placeholder).toBe("Name (optional)");
  });

  test("removing a set keeps focus in the dialog", () => {
    localStorage.setItem(
      DICT_SETS_KEY,
      JSON.stringify([
        { name: "Prose", d: "1c" },
        { name: "Verse", d: "f" },
      ])
    );
    const { el } = mount();
    el.querySelector<HTMLElement>(".dict-set-remove")!.click();
    expect(document.activeElement?.textContent?.trim()).toBe("Verse");
    el.querySelector<HTMLElement>(".dict-set-remove")!.click();
    expect(document.activeElement).toBe(nameField(el));
  });

  test("names are compared ignoring case and outer spaces", () => {
    localStorage.setItem(
      DICT_SETS_KEY,
      JSON.stringify([{ name: " Prose ", d: "1c" }])
    );
    const { el } = mount();
    tick(["L&S"]);
    nameField(el).value = "prose";
    el.querySelector<HTMLElement>(".dict-set-save")!.click();
    expect(readDictSets()).toEqual([{ name: "prose", d: "1" }]);
  });

  test("invalid stored entries are dropped, valid ones kept", () => {
    localStorage.setItem(
      DICT_SETS_KEY,
      JSON.stringify([
        { name: "Prose", d: "1c" },
        { name: "", d: "1" },
        { name: "Bad", d: "L&S;GAF" },
        "junk",
      ])
    );
    const { el } = mount();
    expect(chipNames(el)).toEqual(["Prose"]);
  });

  test("names are escaped", () => {
    localStorage.setItem(
      DICT_SETS_KEY,
      JSON.stringify([{ name: "<b>x</b>", d: "1" }])
    );
    const { el } = mount();
    expect(chipNames(el)).toEqual(["<b>x</b>"]);
    expect(el.querySelector(".dict-set-apply b")).toBeNull();
  });

  test.each([
    ["guest mode", { guest: { returnHref: "/dicts" } }],
    ["scoped views", { scoped: true, lang: "La" }],
  ])("not offered in %s", (_label, options) => {
    mount(options);
    expect(document.querySelector("#dict-saved-list")).toBeNull();
    expect(document.querySelector(".dict-save-set")).toBeNull();
  });
});
