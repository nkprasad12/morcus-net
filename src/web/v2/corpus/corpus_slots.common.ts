/**
 * The regions of the corpus page that change with the URL, shared by the
 * server (full page and partial) and `<morcus-corpus-view>`.
 *
 * Everything else (the form and its settings, the syntax help, the
 * autocomplete host) persists across searches and sits outside every slot.
 */
export const CORPUS_SLOTS = [
  /** Match count, "showing X–Y", timing. */
  "summary",
  /** Disclaimers and results, or the landing / error / empty message. */
  "results",
  /** The Next link. */
  "pager",
  /** The applied settings, shown in the settings `<summary>`. */
  "settings-summary",
] as const;

export type CorpusSlot = (typeof CORPUS_SLOTS)[number];

/** The document title for a corpus page, set by the server and the client. */
export function corpusPageTitle(query: string): string {
  const suffix = "Morcus Latin Tools";
  return query.length > 0
    ? `Corpus: ${query} - ${suffix}`
    : `Corpus Query - ${suffix}`;
}
