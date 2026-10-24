/**
 * @jest-environment jsdom
 */
import { LifetimeScope } from "@/web/ui/core/dom/lifetime_scope.client";
import { setupAnchoredDialog } from "@/web/ui/core/widgets/anchored_dialog.client";

/**
 * Gives `dialog` a browser-like `showModal`/`close`: jsdom has neither, and
 * `setupModalDialog`'s fallback fires `close` synchronously, but in browsers
 * `close()` only queues the `close` event as a task.
 */
function withAsyncClose(dialog: HTMLDialogElement): () => Promise<void> {
  dialog.showModal = () => dialog.setAttribute("open", "");
  dialog.close = () => {
    dialog.removeAttribute("open");
    setTimeout(() => dialog.dispatchEvent(new Event("close")), 0);
  };
  return () => new Promise((resolve) => setTimeout(resolve, 0));
}

function mount(align: "center" | "end" = "center") {
  document.body.innerHTML = `
    <button type="button" id="trigger" aria-expanded="false">Open</button>
    <dialog id="dialog"><button type="button">Inside</button></dialog>`;
  const trigger = document.getElementById("trigger")!;
  const dialog = document.querySelector<HTMLDialogElement>("#dialog")!;
  const scope = new LifetimeScope(document);
  const onClose = jest.fn();
  const handle = setupAnchoredDialog(scope, {
    dialog,
    trigger,
    align,
    defaultWidth: 300,
    onClose,
  });
  return { trigger, dialog, scope, onClose, handle };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("setupAnchoredDialog", () => {
  test("disposing an open dialog runs its close handling once, though the browser's close event is async", async () => {
    const { trigger, dialog, scope, onClose, handle } = mount();
    const flush = withAsyncClose(dialog);
    // A measured trigger, so the centred dialog gets inline coordinates.
    trigger.getBoundingClientRect = () =>
      ({ top: 10, bottom: 50, left: 100, right: 140, width: 40 } as DOMRect);

    handle.open();
    expect(dialog.style.top).not.toBe("");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    scope.dispose();

    expect(dialog.open).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(dialog.style.top).toBe("");
    expect(dialog.style.left).toBe("");
    expect(onClose).toHaveBeenCalledTimes(1);

    await flush();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("a normal close runs the close handling once, when the event arrives", async () => {
    const { dialog, onClose, handle } = mount();
    const flush = withAsyncClose(dialog);

    handle.open();
    handle.close();
    expect(onClose).not.toHaveBeenCalled();

    await flush();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("disposing a closed dialog doesn't run the close handling", () => {
    const { scope, onClose } = mount();
    scope.dispose();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("setupAnchoredDialog page scrolling", () => {
  // `overflow: hidden` on the root makes Firefox for Android show its
  // collapsed URL bar (#606); both triggers are in the sticky bar, so the page
  // can keep scrolling.
  test("doesn't stop the page scrolling while open", () => {
    const { handle } = mount();
    handle.open();
    const root = document.documentElement;
    expect(root.hasAttribute("data-scroll-lock")).toBe(false);
    expect(root.style.overflow).toBe("");
    expect(document.body.style.overflow).toBe("");
  });
});
