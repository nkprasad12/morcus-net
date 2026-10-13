/**
 * @jest-environment jsdom
 */
import {
  syncQueryParam,
  type NavigateEvent,
} from "@/web/v2/core/router.client";

describe("syncQueryParam", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/v2/dicts?q=amo");
    document.title = "Initial";
  });

  test("get() reads the current query parameter or empty string", () => {
    const sync = syncQueryParam("q", { onChange: () => {} });
    expect(sync.get()).toBe("amo");

    window.history.replaceState(null, "", "/v2/dicts");
    expect(sync.get()).toBe("");
    sync.dispose();
  });

  test("push() and replace() update the param, history state, and document.title", () => {
    const pushSpy = jest.spyOn(window.history, "pushState");
    const replaceSpy = jest.spyOn(window.history, "replaceState");
    const sync = syncQueryParam("q", {
      onChange: () => {},
      title: (q) => (q ? `${q} - Dict` : "Dict"),
    });

    sync.push("bellum");
    expect(window.location.search).toBe("?q=bellum");
    expect(pushSpy).toHaveBeenCalledWith(
      { q: "bellum" },
      "",
      "/v2/dicts?q=bellum"
    );
    expect(document.title).toBe("bellum - Dict");

    sync.replace("");
    expect(window.location.search).toBe("");
    expect(replaceSpy).toHaveBeenCalledWith({ q: "" }, "", "/v2/dicts");
    expect(document.title).toBe("Dict");

    pushSpy.mockRestore();
    replaceSpy.mockRestore();
    sync.dispose();
  });

  test("pushUrl() and replaceUrl() write full URLs (path, search, hash), state, and title", () => {
    const pushSpy = jest.spyOn(window.history, "pushState");
    const replaceSpy = jest.spyOn(window.history, "replaceState");
    const sync = syncQueryParam("q", {
      onChange: () => {},
      title: (q) => (q ? `${q} - Reader` : "Reader"),
    });

    sync.pushUrl("/v2/reader/caesar/bg/1.2?q=Gallia#sec-2", {
      state: { q: "Gallia", scrollY: 0 },
    });
    expect(window.location.pathname).toBe("/v2/reader/caesar/bg/1.2");
    expect(window.location.search).toBe("?q=Gallia");
    expect(window.location.hash).toBe("#sec-2");
    expect(pushSpy).toHaveBeenCalledWith(
      { q: "Gallia", scrollY: 0 },
      "",
      "/v2/reader/caesar/bg/1.2?q=Gallia#sec-2"
    );
    expect(document.title).toBe("Gallia - Reader");

    sync.replaceUrl(
      new URL("http://localhost/v2/reader/caesar/bg/1.2?d=an&o=1")
    );
    expect(replaceSpy).toHaveBeenCalledWith(
      null,
      "",
      "/v2/reader/caesar/bg/1.2?d=an&o=1"
    );
    expect(document.title).toBe("Reader");

    pushSpy.mockRestore();
    replaceSpy.mockRestore();
    sync.dispose();
  });

  test("title() receives the URL being shown, on writes and on popstate", () => {
    const seen: string[] = [];
    const sync = syncQueryParam("q", {
      onChange: () => {},
      title: (q, url) => {
        seen.push(`${q}|${url.pathname}${url.search}`);
        return q;
      },
    });

    sync.pushUrl("/v2/dicts/id/n1");
    window.history.replaceState(null, "", "/v2/dicts?q=amo");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(seen).toEqual(["|/v2/dicts/id/n1", "amo|/v2/dicts?q=amo"]);
    sync.dispose();
  });

  test("popstate back to the initial URL after pushUrl() fires onChange", () => {
    const onChange = jest.fn();
    const sync = syncQueryParam("q", {
      onChange,
      title: (q) => `${q} - Dict`,
    });

    // Navigate away via pushUrl, then simulate Back to the connect-time URL.
    sync.pushUrl("/v2/dicts?q=bellum&d=an&o=1", { state: { q: "bellum" } });
    window.history.replaceState(null, "", "/v2/dicts?q=amo");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("amo");
    expect(document.title).toBe("amo - Dict");

    sync.dispose();
  });

  test("popstate delegates to onNavigate with prevPath and newPath when provided", () => {
    const onChange = jest.fn();
    const events: NavigateEvent[] = [];
    const sync = syncQueryParam("q", {
      onChange,
      onNavigate: (e) => events.push(e),
    });

    sync.pushUrl("/v2/reader/caesar/bg/1.2?q=omni#top");
    window.history.replaceState(null, "", "/v2/reader/caesar/bg/1.1");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(onChange).not.toHaveBeenCalled();
    expect(events).toEqual([
      {
        prevPath: "/v2/reader/caesar/bg/1.2?q=omni",
        newPath: "/v2/reader/caesar/bg/1.1",
        value: "",
      },
    ]);

    sync.dispose();
  });

  test("hash-only popstate is ignored and dispose() removes the listener", () => {
    const onChange = jest.fn();
    const sync = syncQueryParam("q", { onChange });

    window.history.replaceState(null, "", "/v2/dicts?q=amo#entry-1");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(onChange).not.toHaveBeenCalled();

    sync.dispose();
    window.history.replaceState(null, "", "/v2/dicts?q=bellum");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
