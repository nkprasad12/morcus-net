/**
 * @jest-environment jsdom
 */
import "@/web/v2/client/morcus_dict_settings";

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

    const btn = el.querySelector<HTMLButtonElement>(".v2-settings-btn");
    const popover = el.querySelector<HTMLElement>(".v2-settings-popover");
    const slider = el.querySelector<HTMLInputElement>(".v2-settings-slider");
    const valueDisplay = el.querySelector<HTMLElement>(".v2-settings-value");
    const activePreset = el.querySelector<HTMLButtonElement>(
      ".v2-preset-btn.active"
    );

    expect(btn).not.toBeNull();
    expect(popover?.hidden).toBe(true);
    expect(slider?.value).toBe("50");
    expect(valueDisplay?.textContent).toBe("50%");
    expect(activePreset?.getAttribute("data-val")).toBe("50");
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
    const activePreset = el.querySelector<HTMLButtonElement>(
      ".v2-preset-btn.active"
    );

    expect(slider?.value).toBe("20");
    expect(valueDisplay?.textContent).toBe("20%");
    expect(activePreset?.getAttribute("data-val")).toBe("20");
    expect(
      document.documentElement.style.getPropertyValue("--v2-highlight-scale")
    ).toBe("0.4");
  });

  test("toggles popover open and closed on button click", () => {
    const el = document.createElement("morcus-dict-settings");
    document.body.appendChild(el);

    const btn = el.querySelector<HTMLButtonElement>(".v2-settings-btn")!;
    const popover = el.querySelector<HTMLElement>(".v2-settings-popover")!;

    expect(popover.hidden).toBe(true);
    expect(btn.getAttribute("aria-expanded")).toBe("false");

    btn.click();
    expect(popover.hidden).toBe(false);
    expect(btn.getAttribute("aria-expanded")).toBe("true");

    btn.click();
    expect(popover.hidden).toBe(true);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
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

  test("preset buttons update slider, scale, and localStorage immediately", () => {
    const el = document.createElement("morcus-dict-settings");
    document.body.appendChild(el);

    const offPreset = el.querySelector<HTMLButtonElement>(
      '.v2-preset-btn[data-val="0"]'
    )!;
    offPreset.click();

    expect(
      document.documentElement.style.getPropertyValue("--v2-highlight-scale")
    ).toBe("0");
    expect(
      el.querySelector<HTMLInputElement>(".v2-settings-slider")?.value
    ).toBe("0");
    expect(
      el.querySelector<HTMLElement>(".v2-settings-value")?.textContent
    ).toBe("0%");
    expect(offPreset.classList.contains("active")).toBe(true);

    const stored = JSON.parse(localStorage.getItem("GlobalSettings")!);
    expect(stored.highlightStrength).toBe(0);
  });

  test("closes popover on Escape key", () => {
    const el = document.createElement("morcus-dict-settings");
    document.body.appendChild(el);

    const btn = el.querySelector<HTMLButtonElement>(".v2-settings-btn")!;
    const popover = el.querySelector<HTMLElement>(".v2-settings-popover")!;

    btn.click();
    expect(popover.hidden).toBe(false);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(popover.hidden).toBe(true);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  test("closes popover on outside pointerdown", () => {
    const el = document.createElement("morcus-dict-settings");
    document.body.appendChild(el);

    const outside = document.createElement("div");
    document.body.appendChild(outside);

    const btn = el.querySelector<HTMLButtonElement>(".v2-settings-btn")!;
    const popover = el.querySelector<HTMLElement>(".v2-settings-popover")!;

    btn.click();
    expect(popover.hidden).toBe(false);

    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(popover.hidden).toBe(true);
  });
});
