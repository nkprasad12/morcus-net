/**
 * @jest-environment jsdom
 */
import {
  PREPAINT_KEY,
  type PrepaintName,
  recordPrepaint,
  setPrepaint,
} from "@/web/ui/core/dom/prepaint.client";

const root = document.documentElement;

function snapshot(): unknown {
  return JSON.parse(localStorage.getItem(PREPAINT_KEY) ?? "null");
}

beforeEach(() => {
  localStorage.clear();
  root.removeAttribute("style");
  root.removeAttribute("data-dict-width");
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
    setPrepaint("data-dict-width", "wide");
    expect(root.getAttribute("data-dict-width")).toBe("wide");
    expect(snapshot()).toEqual({ "data-dict-width": "wide" });
  });

  test("merges with other owners' entries without clobbering them", () => {
    setPrepaint("--reader-scale", "1.25");
    setPrepaint("data-dict-width", "wide");
    setPrepaint("--reader-scale", "0.90");
    expect(snapshot()).toEqual({
      "--reader-scale": "0.90",
      "data-dict-width": "wide",
    });
  });

  test("null removes from <html> and from the snapshot", () => {
    setPrepaint("--reader-scale", "1.25");
    setPrepaint("data-dict-width", "wide");
    setPrepaint("--reader-scale", null);
    setPrepaint("data-dict-width", null);
    expect(root.style.getPropertyValue("--reader-scale")).toBe("");
    expect(root.hasAttribute("data-dict-width")).toBe(false);
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
    expect(() => setPrepaint("data-dict-width", "full")).not.toThrow();
    expect(root.getAttribute("data-dict-width")).toBe("full");
  });
});

describe("recordPrepaint", () => {
  test("records without touching <html>", () => {
    root.style.setProperty("--dict-width", "400px");
    recordPrepaint("--dict-width", "512px");
    recordPrepaint("data-dict-width", "wide");
    expect(root.style.getPropertyValue("--dict-width")).toBe("400px");
    expect(root.hasAttribute("data-dict-width")).toBe(false);
    expect(snapshot()).toEqual({
      "--dict-width": "512px",
      "data-dict-width": "wide",
    });
  });

  test("null removes only the recorded entry", () => {
    setPrepaint("--dict-width", "512px");
    recordPrepaint("--dict-width", null);
    expect(snapshot()).toEqual({});
    expect(root.style.getPropertyValue("--dict-width")).toBe("512px");
  });

  test("rejects names the critical script must not copy", () => {
    expect(() => recordPrepaint("onclick" as PrepaintName, "x")).toThrow();
    expect(snapshot()).toBeNull();
  });
});
