/**
 * The document model for best-effort ("Open Texts") reading.
 *
 * A source file (TEI today; plain text later) is parsed once, on the reader's
 * device, into this shape, which is then paginated and rendered by the reader.
 * Nothing here is curated: the model records what the source has, plus enough
 * structure (pages, section markers, notes) to read and cite it.
 */

/** Inline styling carried over from the source's `rend` attributes. */
export interface OpenTextStyle {
  italic?: true;
  bold?: true;
  smallCaps?: true;
  superscript?: true;
  subscript?: true;
}

/** A run of text with uniform styling. */
export interface OpenTextRun {
  kind: "text";
  text: string;
  style?: OpenTextStyle;
  /** Set for text in another language (e.g. `grc`), so lookup can skip it. */
  lang?: string;
}

/**
 * A citable point inside a block, e.g. a Migne section letter. `label` is the
 * full citation for the point (e.g. `529A`), not just the letter.
 */
export interface OpenTextSectionMarker {
  kind: "section";
  label: string;
}

export type OpenTextSegment = OpenTextRun | OpenTextSectionMarker;

export type OpenTextBlockKind = "heading" | "paragraph" | "line";

export interface OpenTextBlock {
  kind: OpenTextBlockKind;
  segments: OpenTextSegment[];
  /** This block continues one cut off by the end of the previous page. */
  continued?: true;
  /** For `line` blocks: the first line of a stanza (`<lg>`). */
  stanzaStart?: true;
}

export interface OpenTextNote {
  segments: OpenTextSegment[];
}

export interface OpenTextPage {
  /** Unique within the document; used in URLs. */
  id: string;
  /** Human-readable label, e.g. `col. 529`. */
  label: string;
  blocks: OpenTextBlock[];
  /** Notes that the source places on this page, in source order. */
  notes: OpenTextNote[];
}

/**
 * How pages were derived:
 * - `pageBreaks`: from the source's `<pb>` elements (Migne columns for PL).
 * - `chunks`: the source had no page breaks, so blocks were grouped by size.
 */
export type OpenTextPagination = "pageBreaks" | "chunks";

export interface OpenTextDocument {
  title: string;
  author?: string;
  /** The CTS URN of the edition, when the source declares one. */
  urn?: string;
  pagination: OpenTextPagination;
  pages: OpenTextPage[];
  /** Non-fatal oddities found while parsing, for diagnostics. */
  warnings: string[];
}
