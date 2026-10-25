/**
 * @jest-environment jsdom
 */

// Mounts the server-rendered external page inside the real
// `<morcus-reader-view>` to check that the library reader's client runs on a
// page with no work, TOC, or pager, and that lookups work on imported text.

import { MorcusReaderView } from "@/web/ui/reader/reader_view.client";
import {
  renderExternalLocalContentHtml,
  renderExternalReaderContentHtml,
} from "@/web/ui/external/external.server";
import { SAVED_SPOTS_KEY } from "@/web/ui/reader/saved_spots.client";
import { installPointerEventShims } from "@/web/ui/testing/pointer_events";

installPointerEventShims();

const TEXT =
  "Gallia est omnis divisa in partes tres.\n\nQuarum unam incolunt Belgae.";

function mount(query = ""): MorcusReaderView {
  const holder = document.createElement("div");
  holder.innerHTML = renderExternalReaderContentHtml({
    sourceUrl: "https://example.com/bg.html",
    text: TEXT,
    lines: "keep",
    query,
  });
  const view = holder.querySelector("morcus-reader-view");
  if (!(view instanceof MorcusReaderView)) {
    throw new Error("reader view did not upgrade");
  }
  document.body.appendChild(view);
  return view;
}

describe("external text in <morcus-reader-view>", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
  });

  test("connects without a work, TOC, or pager", () => {
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    const view = mount();

    expect(view.isConnected).toBe(true);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  test("tokenizes the passage so words can be looked up", () => {
    const view = mount();
    const words = Array.from(
      view.querySelectorAll("#reader-passage .lat-word[data-word]")
    ).map((el) => el.getAttribute("data-word"));

    expect(words).toContain("Gallia");
    expect(words).toContain("Belgae");
  });

  test("marks words for a No-JS lookup carried in the URL", () => {
    window.history.replaceState(null, "", "/externalReader?q=Belgae");
    const view = mount("Belgae");
    expect(
      view.querySelector(".lat-word.word-active")?.getAttribute("data-word")
    ).toBe("Belgae");
    window.history.replaceState(null, "", "/");
  });

  test("does not record a saved reading spot", () => {
    mount();
    expect(localStorage.getItem(SAVED_SPOTS_KEY)).toBeNull();
  });

  test("renders a heading permalink on URL imports and omits it on saved local texts", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const view = mount("Belgae");
    const link = view.querySelector<HTMLAnchorElement>(
      "a.reader-heading-link"
    );
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe(
      "/externalReader?url=https%3A%2F%2Fexample.com%2Fbg.html"
    );

    link?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(writeText).toHaveBeenCalledWith(
      "http://localhost/externalReader?url=https%3A%2F%2Fexample.com%2Fbg.html"
    );

    const localHtml = renderExternalLocalContentHtml({
      localKey: "abc123",
      lines: "keep",
      query: "",
    });
    expect(localHtml).not.toContain("reader-heading-link");
  });
});
