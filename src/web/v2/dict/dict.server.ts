/**
 * Server-Side Rendering (SSR) for UI V2 Dictionary.
 * Re-exports modularized components for backwards compatibility and clean public API.
 */

export { linkifyText } from "@/web/v2/dict/linkify.server";

export {
  XmlNodeToHtmlOptions,
  xmlNodeToHtml,
} from "@/web/v2/dict/xml_to_html.server";

export {
  formatInflectionForm,
  renderEntryResult,
} from "@/web/v2/dict/entry_view.server";

export {
  DICT_NAMES,
  DictPageOptions,
  renderDictResultsHtml,
  renderDictPageHtml,
} from "@/web/v2/dict/dict_page.server";

export {
  DICT_ATTRIBUTIONS,
  DictAttributionInfo,
} from "@/web/v2/dict/dict_attribution";

export {
  SearchBarOptions,
  renderDictSearchBar,
} from "@/web/v2/dict/search_bar.server";

export {
  DICT_COOKIE_NAME,
  DEFAULT_DICTS,
  DEFAULT_DICT_KEYS,
  parseDictKeys,
  parseDictsFromCookie,
  formatDictsCookie,
  formatDictsParam,
  resolveActiveDicts,
} from "@/web/v2/dict/dict_selection.server";
