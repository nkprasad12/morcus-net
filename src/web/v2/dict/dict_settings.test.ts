/**
 * @jest-environment jsdom
 */
import "@/web/v2/dict/dict_settings.client";

describe("MorcusDictSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.removeProperty("--v2-highlight-scale");
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("renders default state with 50% highlight strength", () => {
    const el = document.createElement("morcus-dict-settings");
    document.body.appendChild(el);

    const btn = el.querySelector<HTMLElement>(".v2-settings-btn");
    const details = el.querySelector<HTMLDetailsElement>(".v2-dict-settings-details");
    const slider = el.querySelector<HTMLInputElement>(".v2-settings-slider");
    const valueDisplay = el.querySelector<HTMLElement>(".v2-settings-value");

    expect(btn).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(slider?.value).toBe("50");
    expect(valueDisplay?.textContent).toBe("50%");
    expect(
      document.documentElement.style.getPropertyValue("--v2-highlight-scale")
    ).toBe("1");
  });

  test("loads initial strength from localStorage if present", () => {
    localStorage.setItem(
      "GlobalSettings",
      JSON.stringify({ highlightStrength: 20, darkMode: false })
    );

    const el = document.createElement("morcus-dict-settings");
    document.body.appendChild(el);

    const slider = el.querySelector<HTMLInputElement>(".v2-settings-slider");
    const valueDisplay = el.querySelector<HTMLElement>(".v2-settings-value");

    expect(slider?.value).toBe("20");
    expect(valueDisplay?.textContent).toBe("20%");
    expect(
      document.documentElement.style.getPropertyValue("--v2-highlight-scale")
    ).toBe("0.4");
  });

  test("toggles popover open and closed on button click", () => {
    const el = document.createElement("morcus-dict-settings");
    document.body.appendChild(el);

    const btn = el.querySelector<HTMLElement>(".v2-settings-btn")!;
    const details = el.querySelector<HTMLDetailsElement>(".v2-dict-settings-details")!;

    expect(details.open).toBe(false);

    btn.click();
    expect(details.open).toBe(true);

    btn.click();
    expect(details.open).toBe(false);
  });

  test("updates highlight scale on slider input and persists on change", () => {
    const el = document.createElement("morcus-dict-settings");
    document.body.appendChild(el);

    const slider = el.querySelector<HTMLInputElement>(".v2-settings-slider")!;
    const valueDisplay = el.querySelector<HTMLElement>(".v2-settings-value")!;

    slider.value = "80";
    slider.dispatchEvent(new Event("input"));

    expect(
      document.documentElement.style.getPropertyValue("--v2-highlight-scale")
    ).toBe("1.6");
    expect(valueDisplay.textContent).toBe("80%");

    // Verify localStorage has not updated before change event
    expect(localStorage.getItem("GlobalSettings")).toBeNull();

    // Trigger change
    slider.dispatchEvent(new Event("change"));

    const stored = JSON.parse(localStorage.getItem("GlobalSettings")!);
    expect(stored.highlightStrength).toBe(80);
  });

  test("closes popover on Escape key", () => {
    const el = document.createElement("morcus-dict-settings");
    document.body.appendChild(el);

    const btn = el.querySelector<HTMLElement>(".v2-settings-btn")!;
    const details = el.querySelector<HTMLDetailsElement>(".v2-dict-settings-details")!;

    btn.click();
    expect(details.open).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(details.open).toBe(false);
  });

  test("closes popover on outside pointerdown", () => {
    const el = document.createElement("morcus-dict-settings");
    document.body.appendChild(el);

    const outside = document.createElement("div");
    document.body.appendChild(outside);

    const btn = el.querySelector<HTMLElement>(".v2-settings-btn")!;
    const details = el.querySelector<HTMLDetailsElement>(".v2-dict-settings-details")!;

    btn.click();
    expect(details.open).toBe(true);

    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(details.open).toBe(false);
  });

  test("renders dictionary checkboxes with defaults and handles toggle", () => {
    const el = document.createElement("morcus-dict-settings");
    document.body.appendChild(el);

    const checkboxes = el.querySelectorAll<HTMLInputElement>(".v2-dict-checkbox");
    expect(checkboxes.length).toBeGreaterThan(0);

    // L&S should be checked by default
    const lsCheckbox = Array.from(checkboxes).find(
      (cb) => cb.dataset.key === "L&S"
    )!;
    expect(lsCheckbox.checked).toBe(true);

    // Pozo (EGL) should NOT be checked by default
    const pozoCheckbox = Array.from(checkboxes).find(
      (cb) => cb.dataset.key === "EGL"
    )!;
    expect(pozoCheckbox.checked).toBe(false);

    // Toggle off L&S
    let eventDetail: any = null;
    el.addEventListener("dict-selection-change", (e: any) => {
      eventDetail = e.detail;
    });

    lsCheckbox.checked = false;
    lsCheckbox.dispatchEvent(new Event("change", { bubbles: true }));

    expect(eventDetail).not.toBeNull();
    expect(eventDetail.dictKeys).not.toContain("L&S");
    expect(localStorage.getItem("SEARCH_SETTINGS_KEY")).not.toContain("L&S");
    expect(document.cookie).toContain("morcus_dicts=");
  });
});
