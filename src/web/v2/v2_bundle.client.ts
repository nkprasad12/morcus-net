// Component manifest for UI V2 Custom Elements
import "@/web/v2/v2_elements.client";

// Global shell and interactive behaviors
import "@/web/v2/core/anchor_scroll.client";
import "@/web/v2/core/back_to_top.client";
import "@/web/v2/shell/mobile_menu.client";
import "@/web/v2/dict/abbr_popover.client";

// Mark document as JS-enhanced to disable static No-JS CSS fallbacks
document.documentElement.classList.add("has-js");
