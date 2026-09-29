// Entry for `common.js`, which every UI V2 page loads first. Everything else
// `dependOn`s it, so shared `core/` code imported here ships exactly once.
import "@/web/v2/core/index.client";

// Shell elements present on every page.
import "@/web/v2/shell/theme_toggle.client";
import "@/web/v2/shell/mobile_menu.client";
import "@/web/v2/dialog/report_dialog.client";

// Global shell and interactive behaviors
import "@/web/v2/core/anchor_scroll.client";
import "@/web/v2/core/back_to_top.client";
import "@/web/v2/core/deferred_iframe.client";

// There is deliberately no global "JS is on" flag (the old `.has-js`): each
// component reveals its own `data-js-only` UI once upgraded. See the JS gate
// in v2-critical.css.
