/**
 * The regions of the corpus page that change with the URL, shared by the
 * server (full page and partial) and `<morcus-corpus-view>`.
 *
 * Everything else (the form, its settings, and the autocomplete host)
 * persists across searches and sits outside every slot.
 */
export const CORPUS_SLOTS = [
  /** Match count, "showing X to Y", timing, and inline syntax guide. */
  "summary",
  /** Disclaimers and results, or the landing / error / empty view (with expanded syntax guide). */
  "results",
  /** The Next page button. */
  "pager",
  /** The applied settings, shown in the settings `<summary>`. */
  "settings-summary",
] as const;

export type CorpusSlot = (typeof CORPUS_SLOTS)[number];
