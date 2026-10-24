/**
 * @jest-environment jsdom
 */
import {
  lookupInDictFrame,
  type EmbeddedDictLookupRequest,
} from "@/web/ui/dict/search/dict_frame_host.client";
import { currentIframeSrc } from "@/web/ui/core/dom/dom.client";

describe("lookupInDictFrame", () => {
  const REQUEST: EmbeddedDictLookupRequest = {
    q: "virumque",
    lang: "La",
    inflected: true,
  };
  const FALLBACK_SRC = "/dicts?q=virumque&lang=La&o=1&embedded=1&scale=93";

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  function createIframe(initialSrc = "/dicts?q=arma&lang=La&o=1&embedded=1"): {
    iframe: HTMLIFrameElement;
    frameDoc: Document;
    replaceSpy: jest.Mock;
  } {
    const iframe = document.createElement("iframe");
    if (initialSrc) {
      iframe.setAttribute("src", initialSrc);
    }
    document.body.appendChild(iframe);

    const frameDoc = document.implementation.createHTMLDocument("");
    Object.defineProperty(iframe, "contentDocument", {
      value: frameDoc,
      configurable: true,
    });

    const replaceSpy = jest.fn();
    if (initialSrc && initialSrc !== "about:blank") {
      const url = new URL(initialSrc, "http://localhost");
      Object.defineProperty(iframe, "contentWindow", {
        value: {
          location: {
            pathname: url.pathname,
            search: url.search,
            hash: url.hash,
            replace: replaceSpy,
          },
        },
        configurable: true,
      });
    }

    return { iframe, frameDoc, replaceSpy };
  }

  function attachDictSearchStub(
    frameDoc: Document,
    options: {
      upgraded?: boolean;
      impl?: (req: EmbeddedDictLookupRequest) => unknown;
    } = {}
  ): HTMLElement {
    const el = frameDoc.createElement("morcus-dict-search");
    if (options.upgraded ?? true) {
      el.setAttribute("data-upgraded", "");
    }
    if (options.impl) {
      (el as unknown as { lookupEmbeddedWord: unknown }).lookupEmbeddedWord =
        options.impl;
    }
    frameDoc.body.appendChild(el);
    return el;
  }

  test("returns 'unchanged' or 'swapped' when the upgraded element's stub returns them, without navigating", () => {
    for (const stubResult of ["unchanged", "swapped"] as const) {
      const { iframe, frameDoc, replaceSpy } = createIframe();
      const stub = jest.fn().mockReturnValue(stubResult);
      attachDictSearchStub(frameDoc, { impl: stub });

      const outcome = lookupInDictFrame(iframe, REQUEST, FALLBACK_SRC);

      expect(outcome).toBe(stubResult);
      expect(stub).toHaveBeenCalledWith(REQUEST);
      expect(replaceSpy).not.toHaveBeenCalled();
    }
  });

  test("falls back to navigateFrameReplace when stub returns 'declined', an unknown value, throws, or is missing, or when element is not upgraded or frame is about:blank", () => {
    const cases: Array<{
      name: string;
      setup: (frameDoc: Document) => void;
    }> = [
      {
        name: "stub returns 'declined'",
        setup: (doc) => attachDictSearchStub(doc, { impl: () => "declined" }),
      },
      {
        name: "stub returns unknown value",
        setup: (doc) => attachDictSearchStub(doc, { impl: () => "unexpected" }),
      },
      {
        name: "stub throws",
        setup: (doc) =>
          attachDictSearchStub(doc, {
            impl: () => {
              throw new Error("skew");
            },
          }),
      },
      {
        name: "missing lookupEmbeddedWord method",
        setup: (doc) => attachDictSearchStub(doc),
      },
      {
        name: "non-upgraded <morcus-dict-search>",
        setup: (doc) =>
          attachDictSearchStub(doc, {
            upgraded: false,
            impl: () => "swapped",
          }),
      },
    ];

    for (const { setup } of cases) {
      const { iframe, frameDoc, replaceSpy } = createIframe();
      setup(frameDoc);

      const outcome = lookupInDictFrame(iframe, REQUEST, FALLBACK_SRC);

      expect(outcome).toBe("navigated");
      expect(replaceSpy).toHaveBeenCalledWith(FALLBACK_SRC);
    }

    // about:blank frame (before first dictionary load) assigns iframe.src via navigateFrameReplace
    const blankIframe = document.createElement("iframe");
    blankIframe.setAttribute("src", "about:blank");
    document.body.appendChild(blankIframe);
    expect(currentIframeSrc(blankIframe)).toBe("about:blank");

    const outcome = lookupInDictFrame(blankIframe, REQUEST, FALLBACK_SRC);
    expect(outcome).toBe("navigated");
    expect(blankIframe.getAttribute("src")).toBe(FALLBACK_SRC);
  });

  test("returns 'none' without navigating when declined and the frame is already at fallbackSrc", () => {
    const { iframe, frameDoc, replaceSpy } = createIframe(FALLBACK_SRC);
    attachDictSearchStub(frameDoc, { impl: () => "declined" });

    const outcome = lookupInDictFrame(iframe, REQUEST, FALLBACK_SRC);

    expect(outcome).toBe("none");
    expect(replaceSpy).not.toHaveBeenCalled();
  });
});
