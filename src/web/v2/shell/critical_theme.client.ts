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

type Stored = Partial<Record<string, unknown>>;

/** Parses a JSON object from localStorage; `{}` if absent or not an object. */
function read(key: string): Stored {
  const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
  return typeof parsed === "object" && parsed !== null ? parsed : {};
}

try {
  const root = document.documentElement;
  const style = root.style;
  const settings = read("GlobalSettings");
  if (typeof settings.darkMode === "boolean") {
    root.setAttribute("data-theme", settings.darkMode ? "dark" : "light");
  }
  if (typeof settings.highlightStrength === "number") {
    style.setProperty(
      "--highlight-scale",
      String(settings.highlightStrength / 50)
    );
  }
  // Page width presets change layout, so they must land before first
  // paint. Mirrors core/page_width.client.ts; pixel values live in
  // shell/page_width.css.
  for (const surface of ["reader", "dict"]) {
    const width = settings[surface + "Width"];
    if (typeof width === "string" && /^(narrow|wide|full)$/.test(width)) {
      root.setAttribute("data-" + surface + "-width", width);
    }
  }
  // Reader typography and splitter width change layout too (PRE_HYDRATION.md
  // PH11). Mirrors `MorcusReaderView.applyPreferences` and
  // `ReaderLayoutController`; once the reader upgrades, the inline values it
  // sets on its own elements win.
  const reader = read("morcus_reader_settings");
  if (typeof reader.readerScale === "number") {
    style.setProperty("--reader-scale", (reader.readerScale / 100).toFixed(2));
  }
  if (reader.fontFamily === "sans") {
    style.setProperty("--reader-font", "var(--font-sans)");
  }
  const lineHeights: Stored = { compact: "1.45", relaxed: "1.85" };
  const lineHeight = lineHeights[String(reader.lineHeight)];
  if (typeof lineHeight === "string") {
    style.setProperty("--reader-line-height", lineHeight);
  }
  if (reader.showGutter === false) {
    // Consumed by reader_text.css until the reader view upgrades.
    root.setAttribute("data-reader-hide-gutter", "");
  }
  // Number(null) is 0, so a missing value fails the check below.
  const dictWidth = Number(localStorage.getItem("morcus_v2_reader_dict_width"));
  // 300 is MIN_SPLIT_WIDTH in reader/reader_layout.client.ts.
  if (dictWidth >= 300) {
    style.setProperty("--dict-width", dictWidth + "px");
  }
} catch {
  // Gracefully handle disabled localStorage (e.g. sandboxed iframes)
}
