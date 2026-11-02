/**
 * @jest-environment jsdom
 */

import * as he from "he";

import {
  ICON_PATHS,
  renderCopyPillIconsHtml,
  renderIconSvg,
} from "@/web/ui/core/widgets/icons.common";
import { html } from "@/web/ui/core/dom/html.common";
import {
  READER_FRAME_ICON_PATHS,
  renderReaderCompanionPanelHtml,
  renderReaderFrameIconSvg,
  renderReaderHeadingHtml,
  renderReaderNotesSlotHtml,
  renderReaderPagerArrowHtml,
  renderReaderSettingsButtonHtml,
  renderReaderSettingsPopoverHtml,
  renderReaderStickyBarHtml,
  type ReaderFrameIcon,
} from "@/web/ui/reader/reader_frame.common";

function parse(markup: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = markup;
  return root;
}

describe("reader frame icons", () => {
  const names = Object.keys(READER_FRAME_ICON_PATHS) as ReaderFrameIcon[];

  it.each(names)("copies ICON_PATHS.%s verbatim", (name) => {
    expect(READER_FRAME_ICON_PATHS[name]).toBe(ICON_PATHS[name]);
  });

  it.each(names)("draws %s exactly as renderIconSvg does", (name) => {
    expect(renderReaderFrameIconSvg(name)).toBe(renderIconSvg(name));
    expect(
      renderReaderFrameIconSvg(name, {
        className: "x",
        size: 16,
        strokeWidth: 2.5,
      })
    ).toBe(
      renderIconSvg(name, {
        className: "x",
        width: 16,
        height: 16,
        strokeWidth: 2.5,
      })
    );
  });
});

describe("renderReaderPagerArrowHtml", () => {
  it("renders an enabled arrow with its label on the outer side", () => {
    const prev = parse(
      renderReaderPagerArrowHtml({
        dir: "prev",
        href: "/a?b=1&c=2",
        disabled: false,
        ariaLabel: "Previous chapter",
        title: "Previous ([)",
        label: "1.1",
        id: "pager-prev",
        attrs: "",
      })
    ).querySelector("a")!;
    expect(prev.id).toBe("pager-prev");
    expect(prev.getAttribute("href")).toBe("/a?b=1&c=2");
    expect(prev.className.trim()).toBe("reader-btn reader-nav-arrow");
    expect(prev.hasAttribute("aria-disabled")).toBe(false);
    expect(
      Array.from(prev.children).map((el) => el.getAttribute("class"))
    ).toEqual(["pager-arrow", "pager-chevron", "pager-label"]);

    const next = parse(
      renderReaderPagerArrowHtml({
        dir: "next",
        href: "/a",
        disabled: false,
        ariaLabel: "Next",
        title: "Next",
        label: "1.3",
        attrs: "",
      })
    ).querySelector("a")!;
    expect(
      Array.from(next.children).map((el) => el.getAttribute("class"))
    ).toEqual(["pager-label", "pager-arrow", "pager-chevron"]);
  });

  it("renders a disabled, glyph-only arrow", () => {
    const arrow = parse(
      renderReaderPagerArrowHtml({
        dir: "next",
        href: "/a",
        disabled: true,
        ariaLabel: "Next page",
        title: "Next page",
        attrs: 'data-role="next"',
      })
    ).querySelector("a")!;
    expect(arrow.className).toBe("reader-btn reader-nav-arrow disabled");
    expect(arrow.getAttribute("aria-disabled")).toBe("true");
    expect(arrow.getAttribute("tabindex")).toBe("-1");
    expect(arrow.dataset.role).toBe("next");
    expect(arrow.querySelector(".pager-label")).toBeNull();
  });
});

describe("renderReaderStickyBarHtml", () => {
  it("lays out the arrows, centre and settings button", () => {
    const bar = parse(
      renderReaderStickyBarHtml({
        prevHtml: html`<a id="p"></a>`,
        centerHtml: html`<span id="c"></span>`,
        nextHtml: html`<a id="n"></a>`,
        centerId: "reader-jump-form",
      })
    );
    const row = bar.querySelector(
      "header.reader-sticky-bar > .sticky-primary-row"
    )!;
    expect(row.firstElementChild?.id).toBe("p");
    expect(
      row.querySelector("#reader-jump-form .sticky-center-group #c")
    ).not.toBeNull();
    const right = row.querySelector(".sticky-primary-right")!;
    expect(right.firstElementChild?.id).toBe("n");
    expect(right.querySelector("#reader-settings-btn")).not.toBeNull();
  });

  it("leaves out the centre's id unless given", () => {
    const bar = parse(
      renderReaderStickyBarHtml({
        prevHtml: html``,
        centerHtml: html``,
        nextHtml: html``,
      })
    );
    expect(bar.querySelector(".reader-sticky-form")?.hasAttribute("id")).toBe(
      false
    );
  });
});

describe("renderReaderCompanionPanelHtml", () => {
  it("hides the tab bar for a dictionary-only panel", () => {
    const root = parse(
      renderReaderCompanionPanelHtml({
        query: "",
        dictIframeSrc: "/dicts?embedded=1",
        closeHref: "/page",
      })
    );
    const panel = root.querySelector("#reader-dict")!;
    expect(panel.classList.contains("drawer-minimized")).toBe(true);
    expect(panel.classList.contains("has-companion-tabs")).toBe(false);
    expect(
      root.querySelector(".reader-panel-tabs")?.hasAttribute("hidden")
    ).toBe(true);
    expect(
      root.querySelector("#dict-frame")?.hasAttribute("data-dict-unarmed")
    ).toBe(true);
    expect(
      root.querySelector(".reader-sheet-close")?.getAttribute("href")
    ).toBe("#reader-dict-dismissed");
  });

  it("shows the tabs that have content and the No-JS close link for a lookup", () => {
    const root = parse(
      renderReaderCompanionPanelHtml({
        query: "amo",
        dictIframeSrc: "/dicts?q=amo&embedded=1",
        closeHref: "/page?q=amo",
        companion: {
          notesHtml: html`<p class="n">note</p>`,
          aboutHtml: html``,
          hasTranslation: false,
        },
      })
    );
    const panel = root.querySelector("#reader-dict")!;
    expect(panel.classList.contains("drawer-minimized")).toBe(false);
    expect(panel.classList.contains("has-companion-tabs")).toBe(true);
    const hidden = (id: string) =>
      root.querySelector(`#panel-tab-${id}`)?.hasAttribute("hidden");
    expect(hidden("dict")).toBe(false);
    expect(hidden("notes")).toBe(false);
    expect(hidden("translation")).toBe(true);
    expect(hidden("about")).toBe(true);
    expect(
      root.querySelector("#panel-view-notes .reader-notes-slot .n")
    ).not.toBeNull();
    expect(root.querySelector("#dict-frame")?.getAttribute("src")).toBe(
      "/dicts?q=amo&embedded=1"
    );
    expect(
      root.querySelector(".reader-sheet-close")?.getAttribute("href")
    ).toBe("/page?q=amo#reader-dict-dismissed");
  });

  it("uses the in-page close target when no close link is given", () => {
    const root = parse(
      renderReaderCompanionPanelHtml({ query: "amo", dictIframeSrc: "/d" })
    );
    expect(
      root
        .querySelector(".reader-sheet-close")
        ?.classList.contains("reader-sheet-close-target")
    ).toBe(true);
  });
});

describe("renderReaderNotesSlotHtml", () => {
  it("wraps the notes in the notes page-turn slot", () => {
    expect(renderReaderNotesSlotHtml(html`<b>x</b>`)).toBe(
      '<div class="reader-notes-slot" data-slot="notes"><b>x</b></div>'
    );
  });
});

// `reader_frame.common.ts` can't use `he` or `renderIconSvg` (it ships to the
// client), so these pin its output to what the server built with them.

describe("renderReaderHeadingHtml", () => {
  const title = `Liber "I" & <II> 'x' \`y\``;

  it("escapes like he.escape without a permalink", () => {
    expect(String(renderReaderHeadingHtml(title))).toBe(
      `<h1 class="reader-passage-heading" aria-live="polite">${he.escape(
        title
      )}</h1>`
    );
  });

  it("wraps the title in the copy-permalink link with the copy-pill icons", () => {
    const href = `/work/a/b/1?q="x"&y=<z>`;
    expect(String(renderReaderHeadingHtml(title, href))).toBe(
      `<h1 class="reader-passage-heading" aria-live="polite"><a href="${he.escape(
        href
      )}" class="reader-heading-link" title="Copy link to this page" aria-label="${he.escape(
        title
      )} (copy link to this page)">${he.escape(
        title
      )}${renderCopyPillIconsHtml()}</a></h1>`
    );
  });
});

describe("renderReaderSettingsPopoverHtml", () => {
  it("draws its icons exactly as renderIconSvg does", () => {
    const popover = String(renderReaderSettingsPopoverHtml());
    expect(popover).toContain(
      `aria-label="Close reader settings">${renderIconSvg("close", {
        className: "dialog-close-icon",
        width: 18,
        height: 18,
      })}</button>`
    );
    expect(popover).toContain(renderIconSvg("palette"));
  });

  it("omits the macra toggle for editions without macra", () => {
    expect(String(renderReaderSettingsPopoverHtml())).toContain(
      'id="toggle-macra"'
    );
    expect(
      String(renderReaderSettingsPopoverHtml({ hasMacra: false }))
    ).not.toContain('id="toggle-macra"');
  });
});

describe("renderReaderSettingsButtonHtml", () => {
  it("is the button <morcus-reader-settings> anchors its dialog to", () => {
    const button = String(renderReaderSettingsButtonHtml());
    expect(button).toContain('id="reader-settings-btn"');
    expect(button).toContain('aria-controls="reader-settings-popover"');
    expect(button).toContain("data-js-only");
  });
});
