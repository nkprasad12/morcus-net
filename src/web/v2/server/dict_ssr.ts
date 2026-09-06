/**
 * Server-Side Rendering (SSR) for UI V2 Dictionary.
 * Re-exports modularized components for backwards compatibility and clean public API.
 */

export { linkifyText } from "@/web/v2/server/dict/linkify";

export {
  XmlNodeToHtmlOptions,
  xmlNodeToHtml,
} from "@/web/v2/server/dict/xml_to_html";

export {
  formatInflectionForm,
  renderEntryResult,
} from "@/web/v2/server/dict/entry_view";

export {
  DICT_NAMES,
  DictPageOptions,
  renderDictResultsHtml,
  renderDictPageHtml,
} from "@/web/v2/server/dict/dict_page";
