import { XmlNode } from "@/common/xml/xml_node";

export interface TranslationInfo {
  title: string;
  id: string;
  translator?: string;
}

export type DocumentAttribution =
  | "perseus"
  | "hypotactic"
  | "publicDomain"
  | "theLatinLibrary";

/**
 * Per-work citation formatting and lookup conventions.
 *
 * - `"default"`: Standard classical literary citation labels (e.g. `pr` -> `Praefatio`,
 *   dot-separated `1.1.1.pr`).
 * - `"roman_law"`: Roman juristic / Corpus Juris Civilis conventions (Digest, Gaius):
 *   - `pr` is labelled `principium` (`Principium`), not `Praefatio`.
 *   - Digest Books 30-32 (`De legatis I-III`): single-title books keep `"0"` in the
 *     section ID hierarchy (`["30", "0", "79", "1"]`), hide `Title 0` in human-readable
 *     labels (`Book 30, Lex 79, 1`), and accept `30.79.1` as a jump/lookup alias.
 *   - Compact display format attaches `pr` directly to the law/chapter number (`1.1.1pr`,
 *     local gutter `1pr`), while accepting both `1.1.1pr` and `1.1.1.pr` on lookup.
 *   - Jurist inscriptions (`Ulpianus 1 inst.`) appear once per *lex* in small caps
 *     with `kind="editorial"` (`data-no-tokenize="true"`).
 */
export type CitationStyle = "default" | "roman_law";

export interface DocumentInfo {
  title: string;
  shortTitle?: string;
  author: string;
  editor?: string;
  translator?: string;
  sponsor?: string;
  funder?: string;
  workId: string;
  translationId?: string;
  isTranslation?: boolean;
  translationInfo?: TranslationInfo;
  sourceRef?: string[];
  /** The licence statement in the source file's header, if it has one. */
  licence?: string;
  attribution: DocumentAttribution;
  /** Optional citation formatting and lookup style (defaults to `"default"`). */
  citationStyle?: CitationStyle;
}

export interface WorkPage {
  id: string[];
  // The start and end.
  rows: [number, number];
}

export interface NavTreeNode {
  id: string[];
  children: NavTreeNode[];
}

export type ProcessedWorkContentNodeType =
  | "span"
  | "head"
  | "gap"
  | "b"
  | "br"
  | "space"
  | "ul"
  | "li"
  | "note";
export interface ProcessedWork2 {
  /** Basic information about this work such as author or title. */
  info: DocumentInfo;
  /**
   * The high level divisions of texts, like chapter, section, and so on.
   * These are returned in descending order of size.
   */
  textParts: string[];
  /** Rows representing the work content. */
  rows: [string[], XmlNode<ProcessedWorkContentNodeType>][];
  /** The default pagination for the content. */
  pages: WorkPage[];
  /** The default navigation tree for the content. */
  navTree: NavTreeNode;
  /** Notes for the document. */
  notes?: XmlNode[];
}

/** Basic details about a single work in the library. */
export interface LibraryWorkMetadata {
  /** The author of this work. */
  author: string;
  /** The name of this work. */
  name: string;
  /** The id by which to obtain the full work. */
  id: string;
  /** The representation of the author in a URL. */
  urlAuthor: string;
  /** The representation of the work name in a URL. */
  urlName: string;
  /** The ID of the translation for this work. */
  translationId?: string;
  /** Whether this is a translation. */
  isTranslation?: boolean;
  /** The source of the raw data. */
  attribution: DocumentAttribution;
}
