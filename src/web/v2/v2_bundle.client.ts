// Component manifest for UI V2 Custom Elements
import "@/web/v2/v2_elements.client";

// Global shell and interactive behaviors
import "@/web/v2/core/anchor_scroll.client";
import "@/web/v2/core/back_to_top.client";
import "@/web/v2/shell/mobile_menu.client";
import "@/web/v2/dict/abbr_popover.client";
import "@/web/v2/core/deferred_iframe.client";

// There is deliberately no global "JS is on" flag (the old `.has-js`): each
// component reveals its own `data-js-only` UI once upgraded. See the JS gate
// in v2-critical.css.
