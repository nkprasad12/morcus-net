import { XmlNode } from "@/common/xml/xml_node";

export interface TranslationInfo {
  title: string;
  id: string;
  translator?: string;
}

export type DocumentAttribution = "perseus" | "hypotactic" | "publicDomain";

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
  attribution: DocumentAttribution;
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
