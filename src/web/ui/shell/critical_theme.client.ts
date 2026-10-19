/**
 * CRITICAL INLINE SCRIPT (HEAD)
 *
 * IMPORTANT CONSTRAINTS:
 * 1. Execution Context: This script runs synchronously in <head> before <body>
 *    is parsed. DO NOT query or mutate DOM elements (only document.documentElement).
 * 2. Performance: This blocks HTML parsing and paint, and is inlined into every
 *    response. Its size is fixed and budgeted (src/bundler/client_bundle_budget.ts):
 *    do NOT add per-preference logic here. Owners in the bundle call
 *    `setPrepaint` (core/dom/prepaint.client.ts) with final values; this script
 *    only copies them onto <html>.
 * 3. Bundling: Do NOT import external runtime libraries or shared chunks to ensure
 *    the output remains a single, standalone IIFE. That's why the storage key
 *    below is a literal rather than an import of `PREPAINT_KEY`
 *    (critical_theme.test.ts checks they match).
 *
 * The theme is an ordinary snapshot entry (`data-theme`, owned by
 * `theme_toggle.client.ts`), not a separate read.
 */

// Extract critical CSS rules into critical.css
import "@/web/ui/critical.css";

try {
  const root = document.documentElement;
  const parsed: unknown = JSON.parse(
    localStorage.getItem("morcus_prepaint") ?? "{}"
  );
  const snapshot: Partial<Record<string, unknown>> =
    typeof parsed === "object" && parsed !== null ? parsed : {};
  // Only `--*` custom properties and `data-*` attributes, so a value planted
  // in storage can't become an event handler attribute or `style` on <html>.
  for (const [name, value] of Object.entries(snapshot)) {
    if (typeof value !== "string") continue;
    if (name.startsWith("--")) root.style.setProperty(name, value);
    else if (name.startsWith("data-")) root.setAttribute(name, value);
  }
} catch {
  // Storage disabled (e.g. sandboxed iframe): render defaults.
}
