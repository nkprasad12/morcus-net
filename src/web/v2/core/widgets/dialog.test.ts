/**
 * @jest-environment jsdom
 */
import { setupModalDialog } from "@/web/v2/core/widgets/dialog.client";
import "@/web/v2/dialog/report_dialog.client";
import { renderReportIssueDialog } from "@/web/v2/dialog/dialog.server";

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

  test("handle.open() and handle.close() programmatically control the dialog", () => {
    const onOpen = jest.fn();
    const onClose = jest.fn();
    const handle = setupModalDialog(dialog, {
      trigger: triggerBtn,
      onOpen,
      onClose,
    });

    handle.open();
    expect(dialog.showModal).toHaveBeenCalled();
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("true");
    expect(onOpen).toHaveBeenCalled();

    handle.close();
    expect(dialog.close).toHaveBeenCalled();
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("false");
    expect(onClose).toHaveBeenCalled();

    handle.dispose();
  });

  test("Escape (cancel followed by close) invokes onClose once, after the dialog closes", () => {
    const onClose = jest.fn();
    setupModalDialog(dialog, {
      trigger: triggerBtn,
      onClose,
    });

    triggerBtn.click();
    expect(dialog.open).toBe(true);

    dialog.dispatchEvent(new Event("cancel"));
    expect(onClose).not.toHaveBeenCalled();
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("true");

    dialog.removeAttribute("open");
    dialog.dispatchEvent(new Event("close"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("false");
  });

  test("does not close when mousedown originates inside dialog content and click lands on dialog backdrop (drag-out guard)", () => {
    setupModalDialog(dialog, { trigger: triggerBtn });
    triggerBtn.click();
    expect(dialog.open).toBe(true);

    const header = dialog.querySelector("h2")!;
    header.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    dialog.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(dialog.close).not.toHaveBeenCalled();
    expect(dialog.open).toBe(true);

    // Subsequent clean backdrop click (mousedown + click on dialog itself) closes it
    dialog.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    dialog.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(dialog.close).toHaveBeenCalledTimes(1);
  });

  test("uses bounding box coordinates when layout rect is non-zero so border clicks do not close", () => {
    setupModalDialog(dialog, { trigger: triggerBtn });
    triggerBtn.click();

    jest.spyOn(dialog, "getBoundingClientRect").mockReturnValue({
      top: 100,
      left: 100,
      width: 300,
      height: 200,
      bottom: 300,
      right: 400,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    });

    // Click right on the 1px border (inside rect: 100, 150) where e.target === dialog
    dialog.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, clientX: 100, clientY: 150 })
    );
    dialog.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 100, clientY: 150 })
    );
    expect(dialog.close).not.toHaveBeenCalled();

    // Keyboard/programmatic click on a child element (clientX: 0, clientY: 0, no mousedown)
    // must not be treated as a backdrop click even though (0, 0) is outside rect
    const header = dialog.querySelector("h2")!;
    const childClick = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: 0,
      clientY: 0,
    });
    header.dispatchEvent(childClick);
    expect(dialog.close).not.toHaveBeenCalled();
    expect(childClick.defaultPrevented).toBe(false);

    // Click outside rect on backdrop (50, 50)
    dialog.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, clientX: 50, clientY: 50 })
    );
    dialog.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 50, clientY: 50 })
    );
    expect(dialog.close).toHaveBeenCalledTimes(1);
  });

  test("whitespace-only report submission shows validation error and focuses textarea", () => {
    document.body.innerHTML = `<morcus-report-dialog><button type="button" class="report-btn">Feedback</button>${renderReportIssueDialog()}</morcus-report-dialog>`;
    const reportEl = document.querySelector("morcus-report-dialog")!;
    const textarea = reportEl.querySelector<HTMLTextAreaElement>(
      "textarea[name='reportText']"
    )!;
    const statusEl = reportEl.querySelector<HTMLElement>(".report-status")!;
    const form = reportEl.querySelector<HTMLFormElement>("form.report-form")!;
    const focusSpy = jest.spyOn(textarea, "focus");

    textarea.value = "   \n\t  ";
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );

    expect(statusEl.className).toBe("report-status error");
    expect(statusEl.textContent).toBe(
      "Please enter a message before submitting."
    );
    expect(focusSpy).toHaveBeenCalled();
  });
});
