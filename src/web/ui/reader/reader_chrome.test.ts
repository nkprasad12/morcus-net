import * as he from "he";

import {
  renderCopyPillIconsHtml,
  renderIconSvg,
} from "@/web/ui/core/widgets/icons.common";
import {
  renderReaderHeadingHtml,
  renderReaderSettingsButtonHtml,
  renderReaderSettingsPopoverHtml,
} from "@/web/ui/reader/reader_chrome.common";

// `reader_chrome.common.ts` can't use `he` or `renderIconSvg` (it ships to the
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
