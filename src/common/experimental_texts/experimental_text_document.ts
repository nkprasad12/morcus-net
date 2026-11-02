/**
 * The document model for best-effort (Experimental Texts) reading.
 *
 * A source file (TEI or HTML today; plain text later) is parsed once, on the
 * reader's device, into this shape, which is then paginated and rendered by
 * the reader. Nothing here is curated: the model records what the source has,
 * plus enough structure (pages, section markers, notes) to read and cite it.
 */

/**
 * Schema and parser version for cached `ExperimentalTextDocument` records. Bump when
 * either the `ExperimentalTextDocument` shape or the output of a parser changes, so
 * stale IndexedDB cache entries are bypassed.
 */
export const EXPERIMENTAL_TEXT_DOCUMENT_VERSION = 1;

/** Inline styling carried over from the source's `rend` attributes. */
export interface ExperimentalTextStyle {
  italic?: true;
  bold?: true;
  smallCaps?: true;
  superscript?: true;
  subscript?: true;
}

/** A run of text with uniform styling. */
export interface ExperimentalTextRun {
  kind: "text";
  text: string;
  style?: ExperimentalTextStyle;
  /** Set for text in another language (e.g. `grc`), so lookup can skip it. */
  lang?: string;
}

/**
 * A citable point inside a block, e.g. a Migne section letter. `label` is the
 * full citation for the point (e.g. `529A`), not just the letter.
 */
export interface ExperimentalTextSectionMarker {
  kind: "section";
  label: string;
}

export type ExperimentalTextSegment =
  | ExperimentalTextRun
  | ExperimentalTextSectionMarker;

export type ExperimentalTextBlockKind = "heading" | "paragraph" | "line";

export interface ExperimentalTextBlock {
  kind: ExperimentalTextBlockKind;
  segments: ExperimentalTextSegment[];
  /** This block continues one cut off by the end of the previous page. */
  continued?: true;
  /** For `line` blocks: the first line of a stanza (`<lg>`). */
  stanzaStart?: true;
}

export interface ExperimentalTextNote {
  segments: ExperimentalTextSegment[];
}

export interface ExperimentalTextPage {
  /** Unique within the document; used in URLs. */
  id: string;
  /** Human-readable label, e.g. `col. 529`. */
  label: string;
  blocks: ExperimentalTextBlock[];
  /** Notes that the source places on this page, in source order. */
  notes: ExperimentalTextNote[];
}

/**
 * How pages were derived:
 * - `pageBreaks`: from the source's `<pb>` elements (Migne columns for PL).
 * - `chunks`: the source had no page breaks, so blocks were grouped by size.
 */
export type ExperimentalTextPagination = "pageBreaks" | "chunks";

export interface ExperimentalTextDocument {
  title: string;
  author?: string;
  /** The CTS URN of the edition, when the source declares one. */
  urn?: string;
  pagination: ExperimentalTextPagination;
  pages: ExperimentalTextPage[];
  /** Non-fatal oddities found while parsing, for diagnostics. */
  warnings: string[];
}
