/**
 * @jest-environment jsdom
 */

import { onPageReady } from "@/web/v2/core/dom/page_ready.client";

/** A document stand-in with a controllable readyState and nav timing. */
function fakeDoc(
  readyState: DocumentReadyState,
  domContentLoadedEventStart?: number
) {
  const target = new EventTarget();
  const entries =
    domContentLoadedEventStart === undefined
      ? []
      : [{ domContentLoadedEventStart }];
  return Object.assign(target, {
    readyState,
    defaultView: {
      performance: { getEntriesByType: () => entries },
    },
  }) as unknown as Document;
}

describe("onPageReady", () => {
  test("waits for DOMContentLoaded while module scripts run (readyState interactive)", () => {
    const doc = fakeDoc("interactive", 0);
    const setup = jest.fn();

    onPageReady(setup, doc);
    expect(setup).not.toHaveBeenCalled();

    doc.dispatchEvent(new Event("DOMContentLoaded"));
    expect(setup).toHaveBeenCalledTimes(1);

    doc.dispatchEvent(new Event("DOMContentLoaded"));
    expect(setup).toHaveBeenCalledTimes(1);
  });

  test("waits for DOMContentLoaded while the document is still loading", () => {
    const doc = fakeDoc("loading");
    const setup = jest.fn();

    onPageReady(setup, doc);
    expect(setup).not.toHaveBeenCalled();

    doc.dispatchEvent(new Event("DOMContentLoaded"));
    expect(setup).toHaveBeenCalledTimes(1);
  });

  test("runs at once if DOMContentLoaded already fired (a lazily imported chunk)", () => {
    const doc = fakeDoc("interactive", 123);
    const setup = jest.fn();

    onPageReady(setup, doc);
    expect(setup).toHaveBeenCalledTimes(1);
  });

  test("runs at once when the document is complete", () => {
    const doc = fakeDoc("complete");
    const setup = jest.fn();

    onPageReady(setup, doc);
    expect(setup).toHaveBeenCalledTimes(1);
  });

  test("keeps registration order", () => {
    const doc = fakeDoc("interactive", 0);
    const calls: string[] = [];

    onPageReady(() => calls.push("common"), doc);
    onPageReady(() => calls.push("dict"), doc);
    doc.dispatchEvent(new Event("DOMContentLoaded"));

    expect(calls).toEqual(["common", "dict"]);
  });
});
