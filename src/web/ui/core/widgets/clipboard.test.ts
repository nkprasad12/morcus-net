/**
 * @jest-environment jsdom
 */
import { copyText } from "@/web/ui/core/widgets/clipboard.client";

const originalClipboard = navigator.clipboard;

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", {
    value,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  setClipboard(originalClipboard);
  // @ts-expect-error jsdom does not implement execCommand, so tests install it.
  delete document.execCommand;
});

describe("copyText", () => {
  test("uses the async clipboard API when it is available", async () => {
    const writeText = jest.fn(async () => undefined);
    setClipboard({ writeText });

    await expect(copyText("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  test("falls back to execCommand when the clipboard API is missing", async () => {
    // This is the non-secure-context case: plain http origins get no
    // navigator.clipboard at all, which covers local dev and LAN previews.
    setClipboard(undefined);
    const execCommand = jest.fn(() => true);
    document.execCommand = execCommand;

    await expect(copyText("hello")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
    // The scratch textarea must not be left behind.
    expect(document.querySelector("textarea")).toBeNull();
  });

  test("falls back to execCommand when the clipboard API rejects", async () => {
    const writeText = jest.fn(async () => {
      throw new Error("denied");
    });
    setClipboard({ writeText });
    const execCommand = jest.fn(() => true);
    document.execCommand = execCommand;

    await expect(copyText("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  test("reports failure when both paths fail", async () => {
    setClipboard(undefined);
    document.execCommand = jest.fn(() => false);

    await expect(copyText("hello")).resolves.toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
  });

  test("focuses the fallback textarea without scrolling the viewport", async () => {
    setClipboard(undefined);
    document.execCommand = jest.fn(() => true);
    const focusSpy = jest.spyOn(HTMLTextAreaElement.prototype, "focus");

    try {
      await expect(copyText("hello")).resolves.toBe(true);
      expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    } finally {
      focusSpy.mockRestore();
    }
  });

  test("returns focus to the previously focused element after the fallback", async () => {
    setClipboard(undefined);
    document.execCommand = jest.fn(() => true);
    document.body.innerHTML = '<a href="#x" id="permalink">§ 1</a>';
    const link = document.getElementById("permalink")!;
    link.focus();
    expect(document.activeElement).toBe(link);

    try {
      await expect(copyText("hello")).resolves.toBe(true);
      expect(document.activeElement).toBe(link);
    } finally {
      document.body.innerHTML = "";
    }
  });
});
