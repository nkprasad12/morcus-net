/**
 * @jest-environment jsdom
 */

import {
  hydrateIframe,
  hydrateDeferredIframes,
  setupDeferredIframes,
} from "@/web/v2/core/deferred_iframe.client";

const SAMPLE_SRC = "https://example.com/embed";

describe("deferred_iframe.client", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
  });

  it("leaves iframe with data-deferred-src unloaded while details is closed", () => {
    document.body.innerHTML = `
      <details>
        <summary>View</summary>
        <iframe data-deferred-src="${SAMPLE_SRC}"></iframe>
      </details>
    `;
    cleanup = setupDeferredIframes(document);

    const frame = document.querySelector<HTMLIFrameElement>("iframe")!;
    expect(frame.getAttribute("src")).toBeNull();
    expect(frame.dataset.deferredSrc).toBe(SAMPLE_SRC);
  });

  it("promotes data-deferred-src to src when details opens", () => {
    document.body.innerHTML = `
      <details>
        <summary>View</summary>
        <iframe data-deferred-src="${SAMPLE_SRC}"></iframe>
      </details>
    `;
    cleanup = setupDeferredIframes(document);

    const details = document.querySelector<HTMLDetailsElement>("details")!;
    const frame = document.querySelector<HTMLIFrameElement>("iframe")!;

    details.open = true;
    details.dispatchEvent(new Event("toggle"));

    expect(frame.getAttribute("src")).toBe(SAMPLE_SRC);
    expect(frame.dataset.deferredSrc).toBeUndefined();
  });

  it("also handles fallback data-src attribute", () => {
    document.body.innerHTML = `
      <details>
        <summary>View</summary>
        <iframe data-src="${SAMPLE_SRC}"></iframe>
      </details>
    `;
    cleanup = setupDeferredIframes(document);

    const details = document.querySelector<HTMLDetailsElement>("details")!;
    const frame = document.querySelector<HTMLIFrameElement>("iframe")!;

    details.open = true;
    details.dispatchEvent(new Event("toggle"));

    expect(frame.getAttribute("src")).toBe(SAMPLE_SRC);
    expect(frame.dataset.src).toBeUndefined();
  });

  it("does not re-assign src on close and reopen", () => {
    document.body.innerHTML = `
      <details>
        <summary>View</summary>
        <iframe data-deferred-src="${SAMPLE_SRC}"></iframe>
      </details>
    `;
    cleanup = setupDeferredIframes(document);

    const details = document.querySelector<HTMLDetailsElement>("details")!;
    const frame = document.querySelector<HTMLIFrameElement>("iframe")!;

    const srcSetterSpy = jest.spyOn(HTMLIFrameElement.prototype, "src", "set");

    try {
      details.open = true;
      details.dispatchEvent(new Event("toggle"));
      expect(srcSetterSpy).toHaveBeenCalledTimes(1);
      expect(frame.src).toBe(SAMPLE_SRC);

      details.open = false;
      details.dispatchEvent(new Event("toggle"));
      expect(srcSetterSpy).toHaveBeenCalledTimes(1);

      details.open = true;
      details.dispatchEvent(new Event("toggle"));
      expect(srcSetterSpy).toHaveBeenCalledTimes(1);
    } finally {
      srcSetterSpy.mockRestore();
    }
  });

  it("hydrates immediately if details starts open", () => {
    document.body.innerHTML = `
      <details open>
        <summary>View</summary>
        <iframe data-deferred-src="${SAMPLE_SRC}"></iframe>
      </details>
    `;
    cleanup = setupDeferredIframes(document);

    const frame = document.querySelector<HTMLIFrameElement>("iframe")!;
    expect(frame.getAttribute("src")).toBe(SAMPLE_SRC);
    expect(frame.dataset.deferredSrc).toBeUndefined();
  });

  it("hydrates top-level deferred iframe not inside any details", () => {
    document.body.innerHTML = `
      <iframe data-deferred-src="${SAMPLE_SRC}"></iframe>
    `;
    cleanup = setupDeferredIframes(document);

    const frame = document.querySelector<HTMLIFrameElement>("iframe")!;
    expect(frame.getAttribute("src")).toBe(SAMPLE_SRC);
    expect(frame.dataset.deferredSrc).toBeUndefined();
  });

  it("handles dynamically added details disclosures via capture listener", () => {
    cleanup = setupDeferredIframes(document);

    const container = document.createElement("div");
    container.innerHTML = `
      <details id="dynamic-details">
        <summary>Dynamic</summary>
        <iframe data-deferred-src="${SAMPLE_SRC}"></iframe>
      </details>
    `;
    document.body.appendChild(container);

    const details =
      document.querySelector<HTMLDetailsElement>("#dynamic-details")!;
    const frame = details.querySelector<HTMLIFrameElement>("iframe")!;

    expect(frame.getAttribute("src")).toBeNull();

    details.open = true;
    details.dispatchEvent(new Event("toggle"));

    expect(frame.getAttribute("src")).toBe(SAMPLE_SRC);
  });

  it("cleanup removes the document toggle listener", () => {
    document.body.innerHTML = `
      <details>
        <summary>View</summary>
        <iframe data-deferred-src="${SAMPLE_SRC}"></iframe>
      </details>
    `;
    cleanup = setupDeferredIframes(document);
    cleanup();
    cleanup = null;

    const details = document.querySelector<HTMLDetailsElement>("details")!;
    const frame = document.querySelector<HTMLIFrameElement>("iframe")!;

    details.open = true;
    details.dispatchEvent(new Event("toggle"));

    expect(frame.getAttribute("src")).toBeNull();
  });

  it("hydrateIframe directly promotes data-deferred-src to src", () => {
    document.body.innerHTML = `<iframe data-deferred-src="${SAMPLE_SRC}"></iframe>`;
    const frame = document.querySelector<HTMLIFrameElement>("iframe")!;
    hydrateIframe(frame);
    expect(frame.src).toBe(SAMPLE_SRC);
    expect(frame.dataset.deferredSrc).toBeUndefined();
  });

  it("hydrateDeferredIframes directly hydrates only open or top-level iframes", () => {
    document.body.innerHTML = `
      <details open><iframe data-deferred-src="${SAMPLE_SRC}/open"></iframe></details>
      <details><iframe data-deferred-src="${SAMPLE_SRC}/closed"></iframe></details>
    `;
    hydrateDeferredIframes(document);
    const frames = document.querySelectorAll<HTMLIFrameElement>("iframe");
    expect(frames[0].src).toBe(`${SAMPLE_SRC}/open`);
    expect(frames[1].getAttribute("src")).toBeNull();
  });
});
