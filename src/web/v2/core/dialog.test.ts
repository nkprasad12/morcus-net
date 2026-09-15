/**
 * @jest-environment jsdom
 */
import { setupModalDialog } from "@/web/v2/core/dialog.client";

describe("setupModalDialog client coordination", () => {
  let dialog: HTMLDialogElement;
  let triggerBtn: HTMLButtonElement;
  let closeBtn: HTMLButtonElement;

  beforeEach(() => {
    document.body.innerHTML = `
      <button id="open-btn">Open Dialog</button>
      <dialog id="test-modal">
        <h2>Modal Header</h2>
        <button id="close-btn" data-dialog-close>Close</button>
      </dialog>
    `;
    dialog = document.querySelector<HTMLDialogElement>("#test-modal")!;
    triggerBtn = document.querySelector<HTMLButtonElement>("#open-btn")!;
    closeBtn = document.querySelector<HTMLButtonElement>("#close-btn")!;

    // Mock HTMLDialogElement methods in jsdom
    if (!dialog.showModal) {
      dialog.showModal = jest.fn(() => {
        dialog.setAttribute("open", "");
      });
    }
    if (!dialog.close) {
      dialog.close = jest.fn(() => {
        dialog.removeAttribute("open");
        dialog.dispatchEvent(new Event("close"));
      });
    }
  });

  afterEach(() => {
    document.body.innerHTML = "";
    jest.clearAllMocks();
  });

  test("opens dialog and updates aria-expanded when trigger is clicked", () => {
    const onOpen = jest.fn();
    setupModalDialog(dialog, {
      trigger: triggerBtn,
      onOpen,
    });

    expect(dialog.open).toBe(false);
    triggerBtn.click();

    expect(dialog.showModal).toHaveBeenCalled();
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("true");
    expect(onOpen).toHaveBeenCalled();
  });

  test("closes dialog when [data-dialog-close] button is clicked", () => {
    const onClose = jest.fn();
    setupModalDialog(dialog, {
      trigger: triggerBtn,
      onClose,
    });

    triggerBtn.click();
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("true");

    closeBtn.click();
    expect(dialog.close).toHaveBeenCalled();
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("false");
    expect(onClose).toHaveBeenCalled();
  });

  test("cleans up listeners when unbind function is executed", () => {
    const unbind = setupModalDialog(dialog, {
      trigger: triggerBtn,
    });

    unbind();
    triggerBtn.click();
    expect(dialog.showModal).not.toHaveBeenCalled();
  });
});
