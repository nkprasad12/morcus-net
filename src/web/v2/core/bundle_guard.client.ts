/**
 * Detects a UI V2 bundle that threw during top-level evaluation, and marks
 * <html> `data-js-failed` so every No-JS fallback is painted again (see the JS
 * gate in `v2-critical.css`).
 *
 * The bundle's modules are static imports, which can't be wrapped in
 * `try/catch`. Instead this module is imported first, and `v2_bundle.client.ts`
 * calls {@link markBundleEvaluated} as its last statement. An uncaught error
 * before then aborts evaluation, so the call never happens.
 *
 * Errors thrown from `connectedCallback` while `customElements.define()`
 * upgrades existing elements are also reported to `window`, but they don't
 * abort evaluation, so by the time the check runs the bundle has finished and
 * nothing is marked. `BaseElement` marks that one component instead.
 *
 * A bundle that fails to load at all is handled by the `onerror` attribute on
 * its `<script>` tag in `shell/page_shell.server.ts`.
 */

import { markFailed } from "@/web/v2/core/js_gate.client";

let evaluated = false;

function onError(): void {
  setTimeout(() => {
    if (evaluated) return;
    markFailed(document.documentElement);
    window.removeEventListener("error", onError);
  }, 0);
}

window.addEventListener("error", onError);

/** Called once, as the last statement of the bundle entry point. */
export function markBundleEvaluated(): void {
  evaluated = true;
  window.removeEventListener("error", onError);
}
