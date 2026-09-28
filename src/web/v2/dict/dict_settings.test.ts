/**
 * @jest-environment jsdom
 */
import "@/web/v2/dict/dict_settings.client";
import { renderDictSearchBar } from "@/web/v2/dict/search_bar.server";

function mountDictSettings(): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderDictSearchBar({ action: "/v2/dicts" });
  const el = wrapper.querySelector<HTMLElement>("morcus-dict-settings")!;
  document.body.appendChild(el);
  return el;
}

describe("MorcusDictSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.removeProperty("--highlight-scale");
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("renders default state with 50% highlight strength", () => {
    const el = mountDictSettings();

    const btn = el.querySelector<HTMLElement>(".settings-btn");
    const details = el.querySelector<HTMLDetailsElement>(
      ".dict-settings-details"
    );
    const slider = el.querySelector<HTMLInputElement>(".settings-slider");
    const valueDisplay = el.querySelector<HTMLElement>(".settings-value");

    expect(btn).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(slider?.value).toBe("50");
    expect(valueDisplay?.textContent).toBe("50%");
    expect(
      document.documentElement.style.getPropertyValue("--highlight-scale")
    ).toBe("1");
  });

  test("loads initial strength from localStorage if present", () => {
    localStorage.setItem(
      "GlobalSettings",
      JSON.stringify({ highlightStrength: 20, darkMode: false })
    );

    const el = mountDictSettings();

    const slider = el.querySelector<HTMLInputElement>(".settings-slider");
    const valueDisplay = el.querySelector<HTMLElement>(".settings-value");

    expect(slider?.value).toBe("20");
    expect(valueDisplay?.textContent).toBe("20%");
    expect(
      document.documentElement.style.getPropertyValue("--highlight-scale")
    ).toBe("0.4");
  });

  test("toggles popover open and closed on button click", () => {
    const el = mountDictSettings();

    const btn = el.querySelector<HTMLElement>(".settings-btn")!;
    const details = el.querySelector<HTMLDetailsElement>(
      ".dict-settings-details"
    )!;

    expect(details.open).toBe(false);

    btn.click();
    expect(details.open).toBe(true);

    btn.click();
    expect(details.open).toBe(false);
  });

  test("updates highlight scale on slider input and persists on change", () => {
    const el = mountDictSettings();

    const slider = el.querySelector<HTMLInputElement>(".settings-slider")!;
    const valueDisplay = el.querySelector<HTMLElement>(".settings-value")!;

    slider.value = "80";
    slider.dispatchEvent(new Event("input"));

    expect(
      document.documentElement.style.getPropertyValue("--highlight-scale")
    ).toBe("1.6");
    expect(valueDisplay.textContent).toBe("80%");

    // Verify localStorage has not updated before change event
    expect(localStorage.getItem("GlobalSettings")).toBeNull();
    // Connect recorded the initial scale for pre-paint; the input tick didn't.
    const prepaint = () =>
      JSON.parse(localStorage.getItem("morcus_prepaint") ?? "{}");
    expect(prepaint()["--highlight-scale"]).toBe("1");

    // Trigger change
    slider.dispatchEvent(new Event("change"));

    const stored = JSON.parse(localStorage.getItem("GlobalSettings")!);
    expect(stored.highlightStrength).toBe(80);
    expect(prepaint()["--highlight-scale"]).toBe("1.6");
  });

  test("closes popover on Escape key", () => {
    const el = mountDictSettings();

    const btn = el.querySelector<HTMLElement>(".settings-btn")!;
    const details = el.querySelector<HTMLDetailsElement>(
      ".dict-settings-details"
    )!;

    btn.click();
    expect(details.open).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(details.open).toBe(false);
  });

  test("closes popover on outside pointerdown", () => {
    const el = mountDictSettings();

    const outside = document.createElement("div");
    document.body.appendChild(outside);

    const btn = el.querySelector<HTMLElement>(".settings-btn")!;
    const details = el.querySelector<HTMLDetailsElement>(
      ".dict-settings-details"
    )!;

    btn.click();
    expect(details.open).toBe(true);

    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(details.open).toBe(false);
  });

  test("renders dictionary checkboxes with defaults and handles toggle", () => {
    const el = mountDictSettings();

    const checkboxes = el.querySelectorAll<HTMLInputElement>(".dict-checkbox");
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
    expect(eventDetail.bitmask).toBeDefined();
    expect(localStorage.getItem("SEARCH_SETTINGS_KEY")).not.toContain("L&S");
    expect(document.cookie).toContain("morcus_dicts=");
  });

  test("handles inflection toggle and dispatches dict-inflected-change", () => {
    const el = mountDictSettings();
    const inflectedCheckbox =
      el.querySelector<HTMLInputElement>("#toggle-inflected")!;
    expect(inflectedCheckbox.checked).toBe(true);

    let inflectedDetail: any = null;
    el.addEventListener("dict-inflected-change", (e: any) => {
      inflectedDetail = e.detail;
    });

    inflectedCheckbox.checked = false;
    inflectedCheckbox.dispatchEvent(new Event("change", { bubbles: true }));

    expect(inflectedDetail).toEqual({ isInflected: false });
    expect(localStorage.getItem("GlobalSettings")).toContain(
      '"inflectedSearch":false'
    );
    expect(document.cookie).toContain("morcus_inflected=0");
  });

  test("synchronizes aria-expanded and closes on element disconnect", () => {
    const el = mountDictSettings();

    const btn = el.querySelector<HTMLElement>(".settings-btn")!;
    const details = el.querySelector<HTMLDetailsElement>(
      ".dict-settings-details"
    )!;

    expect(details.open).toBe(false);

    btn.click();
    expect(details.open).toBe(true);
    expect(btn.getAttribute("aria-expanded")).toBe("true");

    // Disconnecting the host closes the details popover cleanly
    el.remove();
    expect(details.open).toBe(false);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  describe("pre-hydration edits (PH1)", () => {
    function renderSsr(): HTMLElement {
      // Built detached so the element doesn't connect until appended,
      // mirroring server HTML that is interactive before v2.js arrives.
      const container = document.createElement("div");
      container.innerHTML = `
        <morcus-dict-settings>
          <details class="dict-settings-details" open>
            <summary class="settings-btn"></summary>
            <div class="settings-popover">
              <input type="checkbox" id="toggle-inflected" class="inflected-checkbox" checked />
              <input type="checkbox" class="dict-checkbox" data-key="L&S" checked />
              <input type="checkbox" class="dict-checkbox" data-key="EGL" />
            </div>
          </details>
        </morcus-dict-settings>
      `;
      return container;
    }

    test("keeps checkbox changes made before upgrade and applies them", () => {
      const container = renderSsr();
      const el = container.querySelector<HTMLElement>("morcus-dict-settings")!;
      const ls = el.querySelector<HTMLInputElement>('[data-key="L&S"]')!;
      const egl = el.querySelector<HTMLInputElement>('[data-key="EGL"]')!;
      const inflected =
        el.querySelector<HTMLInputElement>("#toggle-inflected")!;

      // The user clicks before the component upgrades.
      ls.checked = false;
      egl.checked = true;
      inflected.checked = false;

      let selection: any = null;
      let inflection: any = null;
      el.addEventListener("dict-selection-change", (e: any) => {
        selection = e.detail;
      });
      el.addEventListener("dict-inflected-change", (e: any) => {
        inflection = e.detail;
      });
      document.body.appendChild(container);

      expect(ls.checked).toBe(false);
      expect(egl.checked).toBe(true);
      expect(inflected.checked).toBe(false);
      expect(selection.dictKeys).toContain("EGL");
      expect(selection.dictKeys).not.toContain("L&S");
      expect(inflection).toEqual({ isInflected: false });
    });

    test("emits nothing when the user changed nothing", () => {
      const container = renderSsr();
      const el = container.querySelector<HTMLElement>("morcus-dict-settings")!;
      const events: string[] = [];
      el.addEventListener("dict-selection-change", () => events.push("dict"));
      el.addEventListener("dict-inflected-change", () => events.push("infl"));

      document.body.appendChild(container);

      expect(events).toEqual([]);
    });
  });
});
