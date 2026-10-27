import "@/web/ui/dict/search/dict_search.client";
import "@/web/ui/dict/settings/dict_settings.client";
import "@/web/ui/dict/search/dict_greek.client";
import "@/web/ui/dict/toc/dict_toc.client";

import { onPageReady } from "@/web/ui/core/dom/page_ready.client";
import { setupAbbrPopover } from "@/web/ui/dict/entry/abbr_popover.client";

onPageReady(() => {
  setupAbbrPopover();
});
