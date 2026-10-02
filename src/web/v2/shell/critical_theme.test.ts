/**
 * @jest-environment jsdom
 */
import fs from "fs";
import path from "path";
import { PREPAINT_KEY } from "@/web/v2/core/prepaint.client";

jest.mock("@/web/v2/v2-critical.css", () => ({}));

const root = document.documentElement;

function resetState() {
  localStorage.clear();
  root.removeAttribute("style");
  for (const attr of Array.from(root.attributes)) {
    root.removeAttribute(attr.name);
  }
}

async function runCriticalScript() {
  await jest.isolateModulesAsync(async () => {
    await import("@/web/v2/shell/critical_theme.client");
  });
}

beforeEach(resetState);
afterEach(resetState);

describe("critical_theme pre-paint applier", () => {
  test("uses the PREPAINT_KEY literal (it can't import it)", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "critical_theme.client.ts"),
      "utf8"
    );
    expect(source).toContain(`read("${PREPAINT_KEY}")`);
  });

  test("applies the snapshot's custom properties and data attributes", async () => {
    localStorage.setItem(
      PREPAINT_KEY,
      JSON.stringify({
        "--reader-scale": "1.25",
        "--reader-font": "var(--font-sans)",
        "--dict-width": "512px",
        "--reader-page-max": "1234px",
        "data-dict-width": "wide",
        "data-reader-hide-gutter": "",
      })
    );

    await runCriticalScript();

    expect(root.style.getPropertyValue("--reader-scale")).toBe("1.25");
    expect(root.style.getPropertyValue("--reader-font")).toBe(
      "var(--font-sans)"
    );
    expect(root.style.getPropertyValue("--dict-width")).toBe("512px");
    expect(root.style.getPropertyValue("--reader-page-max")).toBe("1234px");
    expect(root.getAttribute("data-dict-width")).toBe("wide");
    expect(root.getAttribute("data-reader-hide-gutter")).toBe("");
  });

  test("ignores non-string values and any other names", async () => {
    localStorage.setItem(
      PREPAINT_KEY,
      JSON.stringify({
        "--reader-scale": 1.25,
        "data-dict-width": null,
        onclick: "alert(1)",
        style: "display:none",
        class: "x",
      })
    );

    await runCriticalScript();

    expect(root.getAttribute("style") ?? "").toBe("");
    expect(root.hasAttribute("data-dict-width")).toBe(false);
    expect(root.hasAttribute("onclick")).toBe(false);
    expect(root.hasAttribute("class")).toBe(false);
  });

  test("takes the theme from GlobalSettings", async () => {
    localStorage.setItem("GlobalSettings", JSON.stringify({ darkMode: true }));
    await runCriticalScript();
    expect(root.getAttribute("data-theme")).toBe("dark");

    resetState();
    localStorage.setItem("GlobalSettings", JSON.stringify({ darkMode: false }));
    await runCriticalScript();
    expect(root.getAttribute("data-theme")).toBe("light");
  });

  test("no longer maps legacy preference stores itself", async () => {
    localStorage.setItem(
      "GlobalSettings",
      JSON.stringify({ highlightStrength: 80, readerWidth: 1234 })
    );
    localStorage.setItem(
      "morcus_reader_settings",
      JSON.stringify({ readerScale: 125 })
    );
    await runCriticalScript();
    expect(root.getAttribute("style") ?? "").toBe("");
  });

  test("tolerates a corrupt or non-object snapshot", async () => {
    for (const raw of ["{not json", "null", "5", '"str"']) {
      resetState();
      localStorage.setItem(PREPAINT_KEY, raw);
      await expect(runCriticalScript()).resolves.toBeUndefined();
      expect(root.getAttribute("style") ?? "").toBe("");
    }
  });
});
