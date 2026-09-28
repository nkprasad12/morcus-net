/**
 * @jest-environment jsdom
 */

import {
  renderReaderContentHtml,
  renderReaderPartialHtml,
  type ReaderPageOptions,
} from "@/web/v2/reader/reader.server";
import { READER_PAGE_SLOTS } from "@/web/v2/reader/reader_slots.common";
import { expectSlotParity } from "@/web/v2/testing/slot_parity";

jest.mock("@/web/v2/reader/reader_loader.server", () =>
  jest.requireActual("@/web/v2/testing/mock_reader_loader")
);

describe("reader page-turn slots", () => {
  // First page (prev disabled), last page (next disabled), a lookup and a
  // highlight (both carried in the pager hrefs), and a translated work.
  test.each<[string, ReaderPageOptions]>([
    ["first page", { workId: "dbg", pageId: "1.1" }],
    ["last page", { workId: "dbg", pageId: "1.2" }],
    ["with a lookup", { workId: "dbg", pageId: "1.1", query: "Gallia" }],
    ["with a highlight", { workId: "dbg", pageId: "1.1", matchText: "1.1.2" }],
    ["translated work", { workId: "sallust/catalina1", pageId: "1" }],
  ])("the partial matches the full page: %s", async (_, options) => {
    const full = await renderReaderContentHtml(options);
    const partial = await renderReaderPartialHtml(options);
    expectSlotParity(full, partial, READER_PAGE_SLOTS);
  });

  test("persistent chrome stays outside every slot", async () => {
    const full = await renderReaderContentHtml({ workId: "dbg" });
    const doc = new DOMParser().parseFromString(full, "text/html");
    for (const id of [
      "reader-toc-btn",
      "reader-settings-btn",
      "reader-toc-drawer",
      "dict-frame",
      // The companion panel: only the notes inside it are a slot.
      "panel-tab-notes",
      "panel-view-dict",
      "panel-view-notes",
      "reader-work-about",
    ]) {
      expect(doc.getElementById(id)?.closest("[data-slot]")).toBeNull();
    }
  });
});
