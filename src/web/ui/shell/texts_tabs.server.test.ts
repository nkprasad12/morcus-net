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

const TAB_IDS: TextsTabId[] = ["library", "experimental", "external"];

describe("renderTextsTabBar", () => {
  test("renders the three tabs in order with their routes", () => {
    const nav = mount(renderTextsTabBar("library"));

    expect(nav.getAttribute("aria-label")).toBe("Texts");
    const links = [...nav.querySelectorAll("a.texts-tab")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/library",
      "/experimentalTexts",
      "/externalReader",
    ]);
  });

  test("renders the label of each tab", () => {
    const nav = mount(renderTextsTabBar("library"));
    const links = [...nav.querySelectorAll("a.texts-tab")];

    expect(
      links.map((a) => a.querySelector(".texts-tab-label")?.textContent)
    ).toEqual(["Library", "Experimental", "Custom"]);
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

  test("renders no decoration beyond the label", () => {
    const nav = mount(renderTextsTabBar("external"));

    for (const tab of nav.querySelectorAll("a")) {
      expect([...tab.children].map((c) => c.className)).toEqual([
        "texts-tab-label",
      ]);
    }
  });

  test("names each tier in a tooltip from its default badge", () => {
    const nav = mount(renderTextsTabBar("library"));

    expect(nav.querySelector('a[href="/library"]')?.getAttribute("title")).toBe(
      "Curated"
    );
    expect(
      nav.querySelector('a[href="/experimentalTexts"]')?.getAttribute("title")
    ).toBe("Uncurated");
    expect(
      nav.querySelector('a[href="/externalReader"]')?.hasAttribute("title")
    ).toBe(false);
  });

  test("works without JavaScript: plain links, no custom elements", () => {
    const markup = renderTextsTabBar("library");

    expect(markup).not.toContain("morcus-");
    expect(markup).not.toContain("data-js-only");
    expect(markup).not.toContain("<button");
  });
});
