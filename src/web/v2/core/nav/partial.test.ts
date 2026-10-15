/**
 * @jest-environment jsdom
 */

import {
  fetchAndSwapPartial,
  swapSlots,
} from "@/web/v2/core/nav/partial.client";

function mountHost(innerHtml: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = innerHtml;
  document.body.appendChild(host);
  return host;
}

function mockResponse(body: string, ok = true): void {
  window.fetch = jest.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    text: async () => body,
  });
}

const HOST_HTML = `
  <main><p data-slot="body">old body <a href="/x" id="inner">x</a></p></main>
  <nav>
    <button id="stateful" aria-expanded="true">menu</button>
    <a href="/2" id="next" data-slot="next">Next</a>
  </nav>
`;

const GOOD_RESPONSE = `
  <template data-slot="body"><p data-slot="body">new body <a href="/y" id="inner">y</a></p></template>
  <template data-slot="next"><a href="/3" id="next" data-slot="next">Next</a></template>
`;

describe("swapSlots", () => {
  const originalFetch = window.fetch;
  let fallback: jest.Mock;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    document.body.innerHTML = "";
    fallback = jest.fn();
    consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    window.fetch = originalFetch;
    consoleSpy.mockRestore();
    document.body.innerHTML = "";
  });

  test("replaces every slot from one request and leaves the rest alone", async () => {
    const host = mountHost(HOST_HTML);
    const stateful = host.querySelector("#stateful");
    mockResponse(GOOD_RESPONSE);

    const ok = await swapSlots(host, "/page/2", {
      signal: new AbortController().signal,
      slots: ["body", "next"],
      fallback,
    });

    expect(ok).toBe(true);
    expect(window.fetch).toHaveBeenCalledTimes(1);
    expect(window.fetch).toHaveBeenCalledWith(
      "/page/2",
      expect.objectContaining({ headers: { "X-Requested-With": "fetch" } })
    );
    expect(host.querySelector("[data-slot='body']")?.textContent).toContain(
      "new body"
    );
    expect(host.querySelector("#next")?.getAttribute("href")).toBe("/3");
    expect(host.querySelector("#stateful")).toBe(stateful);
    expect(fallback).not.toHaveBeenCalled();
  });

  test("marks live slots aria-busy only while loading", async () => {
    const host = mountHost(HOST_HTML);
    let respond: (value: unknown) => void = () => {};
    window.fetch = jest.fn().mockReturnValue(
      new Promise((resolve) => {
        respond = resolve;
      })
    );

    const pending = swapSlots(host, "/page/2", {
      signal: new AbortController().signal,
      slots: ["body", "next"],
      fallback,
    });
    expect(host.querySelectorAll("[aria-busy='true']")).toHaveLength(2);
    expect(host.querySelector("#stateful")?.hasAttribute("aria-busy")).toBe(
      false
    );

    respond({ ok: true, text: async () => GOOD_RESPONSE });
    await pending;
    expect(host.querySelector("[aria-busy]")).toBeNull();
  });

  test.each([
    [
      "a requested slot is missing from the response",
      `<template data-slot="body"><p data-slot="body">new</p></template>`,
    ],
    [
      "the response has an unrequested slot",
      `${GOOD_RESPONSE}<template data-slot="extra"><p data-slot="extra"></p></template>`,
    ],
    [
      "a slot appears twice",
      `${GOOD_RESPONSE}<template data-slot="next"><a data-slot="next"></a></template>`,
    ],
    [
      "a template root lacks its data-slot",
      `<template data-slot="body"><p>new</p></template>
       <template data-slot="next"><a data-slot="next"></a></template>`,
    ],
    [
      "a template has more than one root",
      `<template data-slot="body"><p data-slot="body"></p><p></p></template>
       <template data-slot="next"><a data-slot="next"></a></template>`,
    ],
    ["the response is not a slot response", `<div>legacy partial</div>`],
  ])(
    "falls back to navigation and changes nothing when %s",
    async (_, body) => {
      const host = mountHost(HOST_HTML);
      const before = host.innerHTML;
      mockResponse(body);

      const ok = await swapSlots(host, "/page/2", {
        signal: new AbortController().signal,
        slots: ["body", "next"],
        fallback,
      });

      expect(ok).toBe(false);
      expect(fallback).toHaveBeenCalledWith("/page/2");
      expect(host.innerHTML).toBe(before);
      expect(consoleSpy).toHaveBeenCalled();
    }
  );

  test("falls back when a slot matches more than one live element", async () => {
    const host = mountHost(`${HOST_HTML}<i data-slot="next"></i>`);
    mockResponse(GOOD_RESPONSE);

    const ok = await swapSlots(host, "/page/2", {
      signal: new AbortController().signal,
      slots: ["body", "next"],
      fallback,
    });

    expect(ok).toBe(false);
    expect(fallback).toHaveBeenCalledWith("/page/2");
  });

  test("falls back on an HTTP error and clears aria-busy", async () => {
    const host = mountHost(HOST_HTML);
    mockResponse("", false);

    const ok = await swapSlots(host, "/page/2", {
      signal: new AbortController().signal,
      slots: ["body", "next"],
      fallback,
    });

    expect(ok).toBe(false);
    expect(fallback).toHaveBeenCalledWith("/page/2");
    expect(host.querySelector("[aria-busy]")).toBeNull();
  });

  describe("versioned", () => {
    beforeEach(() => {
      document.documentElement.dataset.version = "abc123";
    });
    afterEach(() => {
      delete document.documentElement.dataset.version;
    });

    test("fetches the build-versioned URL", async () => {
      const host = mountHost(HOST_HTML);
      mockResponse(GOOD_RESPONSE);

      await swapSlots(host, "/page/2?q=x", {
        signal: new AbortController().signal,
        slots: ["body", "next"],
        fallback,
        versioned: true,
      });

      expect(window.fetch).toHaveBeenCalledWith(
        "/page/2?q=x&v=abc123",
        expect.anything()
      );
    });

    test("falls back to the unversioned URL", async () => {
      const host = mountHost(HOST_HTML);
      mockResponse("", false);

      await swapSlots(host, "/page/2", {
        signal: new AbortController().signal,
        slots: ["body", "next"],
        fallback,
        versioned: true,
      });

      expect(window.fetch).toHaveBeenCalledWith(
        "/page/2?v=abc123",
        expect.anything()
      );
      expect(fallback).toHaveBeenCalledWith("/page/2");
    });

    test("is off by default and ignored for POST", async () => {
      const host = mountHost(HOST_HTML);
      mockResponse(GOOD_RESPONSE);

      await swapSlots(host, "/page/2", {
        signal: new AbortController().signal,
        slots: ["body", "next"],
        fallback,
      });
      expect(window.fetch).toHaveBeenLastCalledWith(
        "/page/2",
        expect.anything()
      );

      mockResponse(GOOD_RESPONSE.replace("/3", "/4"));
      await swapSlots(host, "/page/2", {
        signal: new AbortController().signal,
        slots: ["body", "next"],
        fallback,
        method: "POST",
        versioned: true,
      });
      expect(window.fetch).toHaveBeenLastCalledWith(
        "/page/2",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  test("an aborted request neither swaps nor falls back", async () => {
    const host = mountHost(HOST_HTML);
    const controller = new AbortController();
    window.fetch = jest.fn().mockImplementation(async () => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    });

    const ok = await swapSlots(host, "/page/2", {
      signal: controller.signal,
      slots: ["body", "next"],
      fallback,
    });

    expect(ok).toBe(false);
    expect(fallback).not.toHaveBeenCalled();
    // The request that replaced this one owns the busy state.
    expect(host.querySelectorAll("[aria-busy='true']")).toHaveLength(2);
  });

  describe("focus", () => {
    test("follows the focused element to its replacement by id", async () => {
      const host = mountHost(HOST_HTML);
      host.querySelector<HTMLElement>("#next")!.focus();
      mockResponse(GOOD_RESPONSE);

      await swapSlots(host, "/page/2", {
        signal: new AbortController().signal,
        slots: ["body", "next"],
        fallback,
      });

      expect(document.activeElement?.getAttribute("href")).toBe("/3");
    });

    test("prefers data-focus-key over id", async () => {
      const host = mountHost(
        `<div data-slot="list"><button data-focus-key="k" id="a">a</button></div>`
      );
      host.querySelector<HTMLElement>("button")!.focus();
      mockResponse(
        `<template data-slot="list"><div data-slot="list"><button data-focus-key="k" id="b">b</button></div></template>`
      );

      await swapSlots(host, "/page/2", {
        signal: new AbortController().signal,
        slots: ["list"],
        fallback,
      });

      expect(document.activeElement?.id).toBe("b");
    });

    test("falls back to the new slot, never <body>", async () => {
      const host = mountHost(`<div data-slot="list"><button>a</button></div>`);
      host.querySelector<HTMLElement>("button")!.focus();
      mockResponse(
        `<template data-slot="list"><div data-slot="list"><span>none</span></div></template>`
      );

      await swapSlots(host, "/page/2", {
        signal: new AbortController().signal,
        slots: ["list"],
        fallback,
      });

      const slot = host.querySelector<HTMLElement>("[data-slot='list']")!;
      expect(document.activeElement).toBe(slot);
      expect(slot.getAttribute("tabindex")).toBe("-1");
    });

    test("leaves focus alone when it was outside every slot", async () => {
      const host = mountHost(HOST_HTML);
      const stateful = host.querySelector<HTMLElement>("#stateful")!;
      stateful.focus();
      mockResponse(GOOD_RESPONSE);

      await swapSlots(host, "/page/2", {
        signal: new AbortController().signal,
        slots: ["body", "next"],
        fallback,
      });

      expect(document.activeElement).toBe(stateful);
      expect(
        host.querySelector("[data-slot='body']")?.hasAttribute("tabindex")
      ).toBe(false);
    });
  });
});

describe("fetchAndSwapPartial", () => {
  const originalFetch = window.fetch;

  afterEach(() => {
    window.fetch = originalFetch;
    document.body.innerHTML = "";
  });

  test("doesn't swap once aborted, even if the body still arrives", async () => {
    const container = mountHost("<p>old</p>");
    const controller = new AbortController();
    // A fetch stack that ignores the signal: the owner disconnects (and
    // aborts) while the body is being read, then the body arrives anyway.
    window.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => {
        container.remove();
        controller.abort();
        return "<p>new</p>";
      },
    });

    const ok = await fetchAndSwapPartial(container, "/x", {
      signal: controller.signal,
    });

    expect(ok).toBe(false);
    expect(container.innerHTML).toBe("<p>old</p>");
  });
});
