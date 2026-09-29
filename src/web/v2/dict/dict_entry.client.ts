// <morcus-dict-suggestions> must register before <morcus-dict-search> so that
// when the parent's onConnect queries its child, the child's public methods
// are already on the prototype.
import "@/web/v2/dict/dict_suggestions.client";
import "@/web/v2/dict/dict_search.client";
import "@/web/v2/dict/dict_settings.client";
import "@/web/v2/dict/dict_greek.client";
import "@/web/v2/dict/dict_toc.client";
import "@/web/v2/dict/abbr_popover.client";
