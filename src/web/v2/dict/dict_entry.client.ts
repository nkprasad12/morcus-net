// <morcus-dict-suggestions> must register before <morcus-dict-search> so that
// when the parent's onConnect queries its child, the child's public methods
// are already on the prototype.
import "@/web/v2/dict/search/dict_suggestions.client";
import "@/web/v2/dict/search/dict_search.client";
import "@/web/v2/dict/settings/dict_settings.client";
import "@/web/v2/dict/search/dict_greek.client";
import "@/web/v2/dict/toc/dict_toc.client";

import { onPageReady } from "@/web/v2/core/dom/page_ready.client";
import { setupAbbrPopover } from "@/web/v2/dict/entry/abbr_popover.client";

onPageReady(() => {
  setupAbbrPopover();
});
