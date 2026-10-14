/**
 * Unit tests for ComboboxController (WAI-ARIA 1.2 Combobox pattern).
 *
 * @jest-environment jsdom
 */

import {
  ComboboxController,
  COMBOBOX_ATTRIBUTES,
} from "@/web/v2/core/widgets/combobox.client";
import {
  BaseElement,
  registerElement,
} from "@/web/v2/core/dom/base_element.client";

interface TestItem {
  id: string;
  label: string;
  selectable?: boolean;
}

class TestComboboxHost extends BaseElement {
  public readonly controller: ComboboxController<TestItem>;
  public selectedItem: TestItem | null = null;
  public selectedIndex = -1;
  public refreshCount = 0;
  public visibilityChanges: boolean[] = [];

  constructor() {
    super();
    this.controller = new ComboboxController<TestItem>({
      root: this,
      getInput: () =>
        this.querySelector<HTMLInputElement>("input") ??
        this.closest("form")?.querySelector<HTMLInputElement>("input") ??
        null,
      getListbox: () => this.querySelector<HTMLElement>("ul"),
      isSelectable: (item) => item.selectable !== false,
      onSelect: (item, index) => {
        this.selectedItem = item;
        this.selectedIndex = index;
      },
      onRefresh: () => {
        this.refreshCount++;
      },
      onVisibilityChange: (open) => {
        this.visibilityChanges.push(open);
      },
    });
    this.addController(this.controller);
  }
}

registerElement("test-combobox-host", TestComboboxHost);

describe("ComboboxController", () => {
  let host: TestComboboxHost;
  let input: HTMLInputElement;
  let listbox: HTMLUListElement;

  function mount(initialHtml?: string): TestComboboxHost {
    document.body.innerHTML = "";
    host = document.createElement("test-combobox-host") as TestComboboxHost;
    host.innerHTML =
      initialHtml ??
      `
      <form>
        <input type="text" id="test-input" />
        <ul id="test-listbox" hidden></ul>
      </form>
    `;
    document.body.appendChild(host);
    input = host.querySelector("input")!;
    listbox = host.querySelector("ul")!;
    return host;
  }

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("initializes ARIA attributes on connect", () => {
    mount();
    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-controls")).toBe("test-listbox");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
    expect(listbox.getAttribute("role")).toBe("listbox");
    expect(listbox.hidden).toBe(true);
  });

  test("generates id for listbox if missing", () => {
    mount(`
      <form>
        <input type="text" />
        <ul hidden></ul>
      </form>
    `);
    expect(listbox.id).toMatch(/^combobox-listbox-/);
    expect(input.getAttribute("aria-controls")).toBe(listbox.id);
  });

  test("cleans up ARIA attributes on disconnect", () => {
    mount(`
      <form>
        <input type="text" />
        <ul hidden></ul>
      </form>
    `);
    expect(listbox.hasAttribute("id")).toBe(true);
    expect(listbox.getAttribute("role")).toBe("listbox");

    host.remove();

    for (const attr of COMBOBOX_ATTRIBUTES) {
      expect(input.hasAttribute(attr)).toBe(false);
    }
    expect(listbox.hasAttribute("id")).toBe(false);
    expect(listbox.hasAttribute("role")).toBe(false);
    expect(listbox.hidden).toBe(true);
    expect(host.controller.items).toEqual([]);
    expect(host.controller.activeIndex).toBe(-1);
  });

  test("setItems updates visibility, aria-expanded, and syncs item roles and IDs", () => {
    mount();
    const items: TestItem[] = [
      { id: "1", label: "Alpha" },
      { id: "2", label: "Beta" },
    ];

    // Simulate rendering children into listbox
    listbox.innerHTML = items.map((item) => `<li>${item.label}</li>`).join("");

    host.controller.setItems(items);

    expect(host.controller.isOpen).toBe(true);
    expect(listbox.hidden).toBe(false);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(host.visibilityChanges).toEqual([true]);

    const lis = listbox.querySelectorAll("li");
    expect(lis.length).toBe(2);
    expect(lis[0].getAttribute("role")).toBe("option");
    expect(lis[0].id).toBe("test-listbox-0");
    expect(lis[0].getAttribute("aria-selected")).toBe("false");

    expect(lis[1].getAttribute("role")).toBe("option");
    expect(lis[1].id).toBe("test-listbox-1");
    expect(lis[1].getAttribute("aria-selected")).toBe("false");

    // Close
    host.controller.close();
    expect(host.controller.isOpen).toBe(false);
    expect(listbox.hidden).toBe(true);
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(host.visibilityChanges).toEqual([true, false]);
  });

  test("marks unselectable items with aria-disabled", () => {
    mount();
    const items: TestItem[] = [
      { id: "1", label: "Header", selectable: false },
      { id: "2", label: "Item", selectable: true },
    ];
    listbox.innerHTML = items.map((item) => `<li>${item.label}</li>`).join("");

    host.controller.setItems(items);

    const lis = listbox.querySelectorAll("li");
    expect(lis[0].getAttribute("aria-disabled")).toBe("true");
    expect(lis[1].hasAttribute("aria-disabled")).toBe(false);
  });

  test("ArrowDown and ArrowUp navigate items with wrap-around", () => {
    mount();
    const items: TestItem[] = [
      { id: "1", label: "First" },
      { id: "2", label: "Second" },
      { id: "3", label: "Third" },
    ];
    listbox.innerHTML = items.map((item) => `<li>${item.label}</li>`).join("");
    host.controller.setItems(items);

    // Initial state
    expect(host.controller.activeIndex).toBe(-1);
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);

    // ArrowDown from none -> 0
    const down1 = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      cancelable: true,
    });
    input.dispatchEvent(down1);
    expect(down1.defaultPrevented).toBe(true);
    expect(host.controller.activeIndex).toBe(0);
    expect(input.getAttribute("aria-activedescendant")).toBe("test-listbox-0");
    expect(listbox.children[0].getAttribute("aria-selected")).toBe("true");

    // ArrowDown -> 1
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", cancelable: true })
    );
    expect(host.controller.activeIndex).toBe(1);
    expect(input.getAttribute("aria-activedescendant")).toBe("test-listbox-1");
    expect(listbox.children[0].getAttribute("aria-selected")).toBe("false");
    expect(listbox.children[1].getAttribute("aria-selected")).toBe("true");

    // ArrowDown -> 2
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", cancelable: true })
    );
    expect(host.controller.activeIndex).toBe(2);

    // ArrowDown wraps -> 0
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", cancelable: true })
    );
    expect(host.controller.activeIndex).toBe(0);

    // ArrowUp wraps -> 2
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", cancelable: true })
    );
    expect(host.controller.activeIndex).toBe(2);
    expect(input.getAttribute("aria-activedescendant")).toBe("test-listbox-2");
  });

  test("ArrowUp when none selected navigates to last item", () => {
    mount();
    const items: TestItem[] = [
      { id: "1", label: "First" },
      { id: "2", label: "Second" },
    ];
    listbox.innerHTML = items.map((item) => `<li>${item.label}</li>`).join("");
    host.controller.setItems(items);

    const up = new KeyboardEvent("keydown", {
      key: "ArrowUp",
      cancelable: true,
    });
    input.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(true);
    expect(host.controller.activeIndex).toBe(1);
    expect(input.getAttribute("aria-activedescendant")).toBe("test-listbox-1");
  });

  test("Enter with active item selects it and prevents default", () => {
    mount();
    const items: TestItem[] = [
      { id: "1", label: "First" },
      { id: "2", label: "Second" },
    ];
    listbox.innerHTML = items.map((item) => `<li>${item.label}</li>`).join("");
    host.controller.setItems(items);

    host.controller.setActiveIndex(1);

    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      cancelable: true,
    });
    input.dispatchEvent(enter);

    expect(enter.defaultPrevented).toBe(true);
    expect(host.selectedItem).toEqual(items[1]);
    expect(host.selectedIndex).toBe(1);
  });

  test("Enter with no active item closes list and lets native submit happen", () => {
    mount();
    const items: TestItem[] = [{ id: "1", label: "First" }];
    listbox.innerHTML = items.map((item) => `<li>${item.label}</li>`).join("");
    host.controller.setItems(items);

    expect(host.controller.activeIndex).toBe(-1);

    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      cancelable: true,
    });
    input.dispatchEvent(enter);

    expect(enter.defaultPrevented).toBe(false);
    expect(host.controller.isOpen).toBe(false);
    expect(host.selectedItem).toBeNull();
  });

  test("Enter on an unselectable item clears highlight and does not select", () => {
    mount();
    const items: TestItem[] = [{ id: "1", label: "Status", selectable: false }];
    listbox.innerHTML = items.map((item) => `<li>${item.label}</li>`).join("");
    host.controller.setItems(items);
    host.controller.setActiveIndex(0);

    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      cancelable: true,
    });
    input.dispatchEvent(enter);

    expect(enter.defaultPrevented).toBe(true);
    expect(host.selectedItem).toBeNull();
    expect(host.controller.activeIndex).toBe(-1);
  });

  test("Tab with active selectable item selects and prevents default; Tab without active item allows default", () => {
    mount();
    const items: TestItem[] = [{ id: "1", label: "Item 1" }];
    listbox.innerHTML = items.map((item) => `<li>${item.label}</li>`).join("");
    host.controller.setItems(items);

    // Tab without active item
    const tab1 = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
    input.dispatchEvent(tab1);
    expect(tab1.defaultPrevented).toBe(false);
    expect(host.controller.isOpen).toBe(false);

    // Open again and select
    host.controller.setItems(items);
    host.controller.setActiveIndex(0);

    const tab2 = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
    input.dispatchEvent(tab2);
    expect(tab2.defaultPrevented).toBe(true);
    expect(host.selectedItem).toEqual(items[0]);
  });

  test("Shift+Tab closes without selecting", () => {
    mount();
    const items: TestItem[] = [{ id: "1", label: "Item 1" }];
    listbox.innerHTML = items.map((item) => `<li>${item.label}</li>`).join("");
    host.controller.setItems(items);
    host.controller.setActiveIndex(0);

    const shiftTab = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      cancelable: true,
    });
    input.dispatchEvent(shiftTab);
    expect(shiftTab.defaultPrevented).toBe(false);
    expect(host.selectedItem).toBeNull();
    expect(host.controller.isOpen).toBe(false);
  });

  test("Escape closes open listbox and prevents default; no-op if already closed", () => {
    mount();
    const items: TestItem[] = [{ id: "1", label: "Item 1" }];
    listbox.innerHTML = items.map((item) => `<li>${item.label}</li>`).join("");
    host.controller.setItems(items);

    const esc1 = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
    });
    input.dispatchEvent(esc1);
    expect(esc1.defaultPrevented).toBe(true);
    expect(host.controller.isOpen).toBe(false);

    const esc2 = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
    });
    input.dispatchEvent(esc2);
    expect(esc2.defaultPrevented).toBe(false);
  });

  test("clicking item in listbox keeps focus in input and selects", () => {
    mount();
    const items: TestItem[] = [
      { id: "1", label: "First" },
      { id: "2", label: "Second" },
    ];
    listbox.innerHTML = items
      .map((item) => `<li><span>${item.label}</span></li>`)
      .join("");
    host.controller.setItems(items);

    const span = listbox.querySelector("li:nth-child(2) span")!;
    const mousedown = new MouseEvent("mousedown", {
      button: 0,
      bubbles: true,
      cancelable: true,
    });

    span.dispatchEvent(mousedown);

    expect(mousedown.defaultPrevented).toBe(true);
    expect(host.selectedItem).toEqual(items[1]);
    expect(host.selectedIndex).toBe(1);
  });

  test("blur and form submit close the combobox", () => {
    mount();
    const items: TestItem[] = [{ id: "1", label: "First" }];
    listbox.innerHTML = items.map((item) => `<li>${item.label}</li>`).join("");
    host.controller.setItems(items);
    expect(host.controller.isOpen).toBe(true);

    input.dispatchEvent(new Event("blur"));
    expect(host.controller.isOpen).toBe(false);

    // Reopen and submit form
    host.controller.setItems(items);
    expect(host.controller.isOpen).toBe(true);

    input.form!.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(host.controller.isOpen).toBe(false);
  });

  test("adopt-before-write: triggers refresh on connect if input is already focused", () => {
    document.body.innerHTML = `
      <form>
        <input type="text" id="pre-focused-input" />
        <test-combobox-host>
          <ul id="pre-focused-listbox" hidden></ul>
        </test-combobox-host>
      </form>
    `;
    const hostEl = document.querySelector(
      "test-combobox-host"
    ) as TestComboboxHost;
    const parent = hostEl.parentNode!;
    const next = hostEl.nextSibling;
    hostEl.remove();

    const preInput = document.getElementById(
      "pre-focused-input"
    ) as HTMLInputElement;
    preInput.focus();
    expect(document.activeElement).toBe(preInput);

    // Reattach host so onConnect runs while preInput has focus
    parent.insertBefore(hostEl, next);

    expect(hostEl.refreshCount).toBeGreaterThan(0);
  });

  test("failed-owner: when host marks failed, native submit is never cancelled", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      mount();
      // Simulate host failure
      host.setAttribute("data-js-failed", "");

      const submitEvent = new Event("submit", {
        bubbles: true,
        cancelable: true,
      });
      input.form!.dispatchEvent(submitEvent);

      expect(submitEvent.defaultPrevented).toBe(false);

      const enterEvent = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(enterEvent);

      expect(enterEvent.defaultPrevented).toBe(false);

      expect(warnSpy).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("[UI V2] Listener skipped"),
        expect.anything()
      );
      expect(warnSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("[UI V2] Listener skipped"),
        expect.anything()
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
