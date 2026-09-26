/**
 * CRITICAL INLINE SCRIPT (HEAD)
 *
 * IMPORTANT CONSTRAINTS:
 * 1. Execution Context: This script runs synchronously in <head> before <body>
 *    is parsed. DO NOT query or mutate DOM elements (only document.documentElement).
 * 2. Performance: This blocks HTML parsing and paint. Keep this file minimal
 *    (< 1 KB) and reserve strictly for anti-flicker logic (e.g., dark mode / theme FOUC).
 * 3. Bundling: Do NOT import external runtime libraries or shared chunks to ensure
 *    the output remains a single, standalone IIFE.
 */

// Extract critical CSS rules into critical.css
import "@/web/v2/v2-critical.css";

try {
  const settingsStr = localStorage.getItem("GlobalSettings");
  if (settingsStr) {
    const settings: unknown = JSON.parse(settingsStr);
    if (typeof settings === "object" && settings !== null) {
      if ("darkMode" in settings && typeof settings.darkMode === "boolean") {
        document.documentElement.setAttribute(
          "data-theme",
          settings.darkMode ? "dark" : "light"
        );
      }
      if (
        "highlightStrength" in settings &&
        typeof settings.highlightStrength === "number"
      ) {
        document.documentElement.style.setProperty(
          "--highlight-scale",
          String(settings.highlightStrength / 50)
        );
      }
      // Page width presets change layout, so they must land before first
      // paint. Mirrors core/page_width.client.ts; pixel values live in
      // shell/page_width.css.
      for (const surface of ["reader", "dict"]) {
        const width: unknown = Reflect.get(settings, surface + "Width");
        if (typeof width === "string" && /^(narrow|wide|full)$/.test(width)) {
          document.documentElement.setAttribute(
            "data-" + surface + "-width",
            width
          );
        }
      }
    }
  }
} catch {
  // Gracefully handle disabled localStorage (e.g. sandboxed iframes)
}
