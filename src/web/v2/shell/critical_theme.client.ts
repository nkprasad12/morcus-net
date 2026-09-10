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
    const settings = JSON.parse(settingsStr);
    if (typeof settings.darkMode === "boolean") {
      document.documentElement.setAttribute(
        "data-theme",
        settings.darkMode ? "dark" : "light"
      );
    }
    if (typeof settings.highlightStrength === "number") {
      document.documentElement.style.setProperty(
        "--v2-highlight-scale",
        String(settings.highlightStrength / 50)
      );
    }
  }
} catch {
  // Gracefully handle disabled localStorage (e.g. sandboxed iframes)
}
