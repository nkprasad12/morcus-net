/**
 * @jest-environment jsdom
 */

import { renderTextsTabBar } from "@/web/ui/shell/texts_tabs.server";
import { TEXTS_TABS, type TextsTabId } from "@/web/ui/shell/texts_tabs.common";

function mount(markup: string): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = markup;
  const nav = container.querySelector<HTMLElement>("nav.texts-tabs");
  expect(nav).not.toBeNull();
  return nav!;
}

const TAB_IDS: TextsTabId[] = ["library", "opentexts", "external"];

describe("renderTextsTabBar", () => {
  test("renders the three tabs in order with their routes", () => {
    const nav = mount(renderTextsTabBar("library"));

    expect(nav.getAttribute("aria-label")).toBe("Texts");
    const links = [...nav.querySelectorAll("a.texts-tab")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/library",
      "/opentexts",
      "/externalReader",
    ]);
  });

  test("renders both the desktop and the mobile label of each tab", () => {
    const nav = mount(renderTextsTabBar("library"));
    const links = [...nav.querySelectorAll("a.texts-tab")];

    expect(
      links.map((a) => a.querySelector(".texts-tab-label")?.textContent)
    ).toEqual(["Library", "Open Texts", "Custom"]);
    expect(
      links.map((a) => a.querySelector(".texts-tab-short")?.textContent)
    ).toEqual(["Library", "Open", "Custom"]);
  });

  test.each(TAB_IDS)(
    "marks only %s as the current page",
    (activeTab: TextsTabId) => {
      const nav = mount(renderTextsTabBar(activeTab));

      for (const spec of TEXTS_TABS) {
        const link = nav.querySelector(`a[href="${spec.href}"]`);
        expect(link).not.toBeNull();
        const isActive = spec.id === activeTab;
        expect(link!.classList.contains("active")).toBe(isActive);
        expect(link!.getAttribute("aria-current")).toBe(
          isActive ? "page" : null
        );
      }
      expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    }
  );

  test("renders no decoration beyond the labels and badges", () => {
    const nav = mount(renderTextsTabBar("external"));

    for (const tab of nav.querySelectorAll("a")) {
      for (const child of tab.children) {
        expect(child.className).toMatch(/^texts-tab-(label|short|badge)$/);
      }
    }
  });

  test("names each tier in a tooltip from its default badge", () => {
    const nav = mount(renderTextsTabBar("library"));

    expect(nav.querySelector('a[href="/library"]')?.getAttribute("title")).toBe(
      "Curated"
    );
    expect(
      nav.querySelector('a[href="/opentexts"]')?.getAttribute("title")
    ).toBe("Uncurated");
    expect(
      nav.querySelector('a[href="/externalReader"]')?.hasAttribute("title")
    ).toBe(false);
  });

  test("shows no count badges by default", () => {
    expect(renderTextsTabBar("library")).not.toContain("texts-tab-badge");
  });

  test("shows a count badge on the tabs given one, escaped", () => {
    const markup = renderTextsTabBar("opentexts", {
      badges: { library: "366", opentexts: "<b>1,200+</b>" },
    });
    const nav = mount(markup);

    const badges = [...nav.querySelectorAll(".texts-tab-badge")];
    expect(badges.map((b) => b.closest("a")?.getAttribute("href"))).toEqual([
      "/library",
      "/opentexts",
    ]);
    expect(badges.map((b) => b.textContent)).toEqual(["366", "<b>1,200+</b>"]);
    expect(markup).toContain("&lt;b&gt;1,200+&lt;/b&gt;");
    expect(nav.querySelector("b")).toBeNull();
  });

  test("works without JavaScript: plain links, no custom elements", () => {
    const markup = renderTextsTabBar("library");

    expect(markup).not.toContain("morcus-");
    expect(markup).not.toContain("data-js-only");
    expect(markup).not.toContain("<button");
  });
});
