/**
 * Page-level startup: when global setups (anchor scroll, back-to-top, the
 * mobile menu, deferred iframes, the abbreviation popover) may run.
 *
 * A page loads a chain of module scripts (`common.js`, then the route chunk;
 * see `v2RouteScripts`). They execute in document order, and
 * `DOMContentLoaded` fires only after all of them have run, so by then every
 * custom element on the page is defined and connected. Global setups that read
 * component state (registered revealers) or take over native behaviour (the
 * in-page anchor `click` handler) must therefore run from here, never at
 * import time (CHUNK_ORDERING.md).
 *
 * Only `*_entry.client.ts` files call {@link onPageReady}; feature modules
 * export their `setupX` functions and have no import-time side effects. Both
 * rules are enforced by `boot_conformance.test.ts`.
 *
 * The wait covers deferred and non-`async` module scripts only. V2 chunk tags
 * must never be `async` (checked in `page_shell.test.ts`), and lazily
 * `import()`ed chunks are not waited for: components they define are handled
 * by the activation gate in `core/js_gate.client.ts` (`canHandleActivation`).
 */

/**
 * Whether `DOMContentLoaded` has already fired for `doc`. While module
 * scripts run, `readyState` is already `"interactive"` but the event has not
 * fired yet, so `readyState` alone can't tell; Navigation Timing can.
 */
function domContentLoadedFired(doc: Document): boolean {
  if (doc.readyState === "complete") return true;
  if (doc.readyState === "loading") return false;
  const perf = doc.defaultView?.performance;
  const nav = perf?.getEntriesByType?.("navigation")[0];
  if (nav === undefined || !("domContentLoadedEventStart" in nav)) {
    return false;
  }
  const start = nav.domContentLoadedEventStart;
  return typeof start === "number" && start > 0;
}

/**
 * Runs `setup` once every chunk on the page has executed: on
 * `DOMContentLoaded`, or immediately if it has already fired (e.g. when
 * called from a lazily imported chunk).
 */
export function onPageReady(
  setup: () => unknown,
  doc: Document = document
): void {
  if (domContentLoadedFired(doc)) {
    setup();
    return;
  }
  // Bootstrap, before any component scope exists; not an activation event.
  // eslint-disable-next-line no-restricted-syntax
  doc.addEventListener("DOMContentLoaded", () => setup(), { once: true });
}
