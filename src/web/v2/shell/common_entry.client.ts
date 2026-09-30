// Entry for `common.js`, which every UI V2 page loads first. Everything else
// `dependOn`s it, so shared `core/` code imported here ships exactly once.
import "@/web/v2/core/index.client";

// Shell elements present on every page.
import "@/web/v2/shell/theme_toggle.client";
import "@/web/v2/dialog/report_dialog.client";

import { setupAnchorScroll } from "@/web/v2/core/anchor_scroll.client";
import { setupBackToTop } from "@/web/v2/core/back_to_top.client";
import { setupDeferredIframes } from "@/web/v2/core/deferred_iframe.client";
import { onPageReady } from "@/web/v2/core/page_ready.client";
import { setupMobileMenu } from "@/web/v2/shell/mobile_menu.client";

// Global shell and interactive behaviours. They run once every chunk on the
// page has executed, not when `common.js` does: until the route chunk has
// upgraded its components, the page must behave like the No-JS page
// (CHUNK_ORDERING.md). Entries are the only modules allowed side effects
// beyond `registerElement` (boot_conformance.test.ts).
onPageReady(() => {
  setupAnchorScroll();
  setupBackToTop();
  setupMobileMenu();
  setupDeferredIframes();
});

// There is deliberately no global "JS is on" flag (the old `.has-js`): each
// component reveals its own `data-js-only` UI once upgraded. See the JS gate
// in v2-critical.css.
