/**
 * CRITICAL INLINE SCRIPT (HEAD)
 *
 * IMPORTANT CONSTRAINTS:
 * 1. Execution Context: This script runs synchronously in <head> before <body>
 *    is parsed. DO NOT query or mutate DOM elements (only document.documentElement).
 * 2. Performance: This blocks HTML parsing and paint, and is inlined into every
 *    response. Its size is fixed and budgeted (src/bundler/v2_bundle_budget.ts):
 *    do NOT add per-preference logic here. Owners in the bundle call
 *    `setPrepaint` (core/prepaint.client.ts) with final values; this script
 *    only copies them onto <html>.
 * 3. Bundling: Do NOT import external runtime libraries or shared chunks to ensure
 *    the output remains a single, standalone IIFE. That's why the storage key
 *    below is a literal rather than an import of `PREPAINT_KEY`
 *    (critical_theme.test.ts checks they match).
 */

// Extract critical CSS rules into critical.css
import "@/web/v2/v2-critical.css";

try {
  const root = document.documentElement;
  const read = (key: string): Partial<Record<string, unknown>> => {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  };
  // Only `--*` custom properties and `data-*` attributes, so a value planted
  // in storage can't become an event handler attribute or `style` on <html>.
  for (const [name, value] of Object.entries(read("morcus_prepaint"))) {
    if (typeof value !== "string") continue;
    if (name.startsWith("--")) root.style.setProperty(name, value);
    else if (name.startsWith("data-")) root.setAttribute(name, value);
  }
  // Theme stays a direct read: V1 writes GlobalSettings. Drop at graduation.
  const dark = read("GlobalSettings").darkMode;
  if (typeof dark === "boolean") {
    root.setAttribute("data-theme", dark ? "dark" : "light");
  }
} catch {
  // Storage disabled (e.g. sandboxed iframe): render defaults.
}
