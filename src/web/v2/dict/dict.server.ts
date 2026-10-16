/**
 * Server-Side Rendering (SSR) for UI V2 Dictionary.
 * Re-exports modularized components for backwards compatibility and clean public API.
 */

export {
  XmlNodeToHtmlOptions,
  markSubsectionHits,
  preRenderEntryHtml,
  xmlNodeToHtml,
} from "@/web/v2/dict/entry/xml_to_html.server";

export {
  EntryRenderOptions,
  formatInflectionForm,
  renderEntryResult,
} from "@/web/v2/dict/entry/entry_view.server";

export {
  dedupeInflections,
  renderInflectionInline,
  renderInflectionTable,
} from "@/web/v2/dict/entry/inflection_table.server";

export {
  SubsectionGroup,
  SubsectionTarget,
  collectHtmlIds,
  collectXmlIds,
  dedupeSubsections,
  matchedAnchorIds,
  renderSubsectionNote,
  resolveSubsectionAnchor,
} from "@/web/v2/dict/entry/subsection_note.server";

export {
  DICT_NAMES,
  DictPageOptions,
  DictResultsOptions,
  parseDictScale,
  renderDictErrorHtml,
  renderDictResultsHtml,
  renderDictPageHtml,
} from "@/web/v2/dict/dict_page.server";

export {
  DICT_ATTRIBUTIONS,
  DictAttributionInfo,
  resolveDictDisplayName,
  resolveDictAcronym,
  dictCardId,
  resolveDictLang,
} from "@/web/v2/dict/dict_attribution.server";

export {
  SearchBarOptions,
  renderDictSearchBar,
} from "@/web/v2/dict/search/search_bar.server";

export {
  DICT_COOKIE_NAME,
  INFLECTED_COOKIE_NAME,
  DEFAULT_DICT_KEYS,
  findDictInfo,
  parseDictKeys,
  parseInflectionParam,
  resolveInflection,
  isGuestView,
  resolveDictParams,
  parseDictsFromCookie,
  readSavedDictPrefs,
  readCookie,
  formatDictsCookie,
  formatInflectedCookie,
  resolveActiveDicts,
  filterDictsByLang,
  filterKeysByLang,
  mergeDictKeysForSave,
  toStringOrArray,
  dictParamsFromQuery,
  readDictParam,
} from "@/web/v2/dict/settings/dict_selection.server";

export {
  hasGreek,
  getLogeionUrl,
  EMBEDDED_LOGEION_SETTING_KEY,
} from "@/web/v2/dict/search/dict_greek.common";

export { renderGreekFallbackHtml } from "@/web/v2/dict/search/dict_greek.server";

export { createDictRoutes } from "@/web/v2/dict/dict_routes.server";
