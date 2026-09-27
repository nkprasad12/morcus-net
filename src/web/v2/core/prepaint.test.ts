/**
 * @jest-environment jsdom
 */
import {
  PREPAINT_KEY,
  type PrepaintName,
  setPrepaint,
} from "@/web/v2/core/prepaint.client";

const root = document.documentElement;

function snapshot(): unknown {
  return JSON.parse(localStorage.getItem(PREPAINT_KEY) ?? "null");
}

beforeEach(() => {
  localStorage.clear();
  root.removeAttribute("style");
  root.removeAttribute("data-reader-width");
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("setPrepaint", () => {
  test("applies a custom property to <html> and records it", () => {
    setPrepaint("--reader-scale", "1.25");
    expect(root.style.getPropertyValue("--reader-scale")).toBe("1.25");
    expect(snapshot()).toEqual({ "--reader-scale": "1.25" });
  });

  test("applies a data attribute to <html> and records it", () => {
    setPrepaint("data-reader-width", "wide");
    expect(root.getAttribute("data-reader-width")).toBe("wide");
    expect(snapshot()).toEqual({ "data-reader-width": "wide" });
  });

  test("merges with other owners' entries without clobbering them", () => {
    setPrepaint("--reader-scale", "1.25");
    setPrepaint("data-reader-width", "wide");
    setPrepaint("--reader-scale", "0.90");
    expect(snapshot()).toEqual({
      "--reader-scale": "0.90",
      "data-reader-width": "wide",
    });
  });

  test("null removes from <html> and from the snapshot", () => {
    setPrepaint("--reader-scale", "1.25");
    setPrepaint("data-reader-width", "wide");
    setPrepaint("--reader-scale", null);
    setPrepaint("data-reader-width", null);
    expect(root.style.getPropertyValue("--reader-scale")).toBe("");
    expect(root.hasAttribute("data-reader-width")).toBe(false);
    expect(snapshot()).toEqual({});
  });

  test("rejects any other name at runtime", () => {
    const bad = "onclick" as PrepaintName;
    expect(() => setPrepaint(bad, "alert(1)")).toThrow();
    expect(root.hasAttribute("onclick")).toBe(false);
    expect(localStorage.getItem(PREPAINT_KEY)).toBeNull();
  });

  test("drops foreign entries from a tampered snapshot on write", () => {
    localStorage.setItem(
      PREPAINT_KEY,
      JSON.stringify({ onclick: "x", "--a": 1, "--b": "kept" })
    );
    setPrepaint("--reader-scale", "1.25");
    expect(snapshot()).toEqual({ "--b": "kept", "--reader-scale": "1.25" });
  });

  test("recovers from a corrupt snapshot", () => {
    localStorage.setItem(PREPAINT_KEY, "{not json");
    setPrepaint("--reader-scale", "1.25");
    expect(snapshot()).toEqual({ "--reader-scale": "1.25" });
  });

  test("still applies to <html> when storage is unavailable", () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => setPrepaint("data-reader-width", "full")).not.toThrow();
    expect(root.getAttribute("data-reader-width")).toBe("full");
  });
});
