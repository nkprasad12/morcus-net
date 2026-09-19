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
