/**
 * @jest-environment jsdom
 */

import {
  detachedDomWrites,
  recordDetachedDomWrite,
  clearDetachedDomWrites,
} from "@/web/v2/core/dom_invariants.client";
import {
  allowDetachedDomWritesForTest,
  verifyNoDetachedDomWrites,
} from "@/web/v2/testing/setup_tests";
import { assertConnected } from "@/web/v2/core/dom.client";

describe("setup_tests detached DOM write enforcement fixture", () => {
  it("throws in verifyNoDetachedDomWrites() when a detached write occurs without opt-out", () => {
    const detached = document.createElement("div");
    detached.id = "unallowed-detached-el";

    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    assertConnected(detached);
    errSpy.mockRestore();

    expect(() => verifyNoDetachedDomWrites()).toThrow(
      /Detected 1 illegal DOM write\(s\) targeting detached element\(s\).*<div#unallowed-detached-el>/s
    );
  });

  it("does not throw when allowDetachedDomWritesForTest() is called", () => {
    allowDetachedDomWritesForTest();
    const detached = document.createElement("div");
    detached.id = "allowed-detached-el";

    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    assertConnected(detached);
    errSpy.mockRestore();

    expect(detachedDomWrites.length).toBe(1);
    expect(() => verifyNoDetachedDomWrites()).not.toThrow();
  });

  it("clears registry via clearDetachedDomWrites()", () => {
    recordDetachedDomWrite("test write");
    expect(detachedDomWrites.length).toBeGreaterThan(0);
    clearDetachedDomWrites();
    expect(detachedDomWrites.length).toBe(0);
  });
});

describe("setup_tests layout visibility shims", () => {
  it("reports non-zero rects and valid offsetParent for live visible elements", () => {
    const el = document.createElement("button");
    document.body.appendChild(el);

    expect(el.getClientRects().length).toBeGreaterThan(0);
    expect(el.offsetParent).toBe(document.body);

    el.remove();
  });

  it("reports empty rects and null offsetParent when element has hidden attribute", () => {
    const el = document.createElement("button");
    el.hidden = true;
    document.body.appendChild(el);

    expect(el.getClientRects().length).toBe(0);
    expect(el.offsetParent).toBeNull();

    el.remove();
  });

  it("reports empty rects and null offsetParent when ancestor is hidden", () => {
    const parent = document.createElement("div");
    parent.hidden = true;
    const child = document.createElement("button");
    parent.appendChild(child);
    document.body.appendChild(parent);

    expect(child.getClientRects().length).toBe(0);
    expect(child.offsetParent).toBeNull();

    parent.remove();
  });

  it("reports empty rects and null offsetParent when display is none", () => {
    const el = document.createElement("button");
    el.style.display = "none";
    document.body.appendChild(el);

    expect(el.getClientRects().length).toBe(0);
    expect(el.offsetParent).toBeNull();

    el.remove();
  });

  it("reports empty rects and null offsetParent for detached elements", () => {
    const el = document.createElement("button");
    expect(el.getClientRects().length).toBe(0);
    expect(el.offsetParent).toBeNull();
  });
});
