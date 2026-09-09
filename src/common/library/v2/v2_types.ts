import type {
  DocumentAttribution,
  NavTreeNode,
} from "@/common/library/library_types";

export interface V2PreprocessedSection {
  /** Hierarchical coordinate ID (e.g. ["1", "1", "1"]) */
  id: string[];
  /** Full dot notation (e.g. "1.1.1") */
  dotId: string;
  /** Redundant prefix established by page header (e.g. "1.1.") */
  prefix: string;
  /** Local leaf identifier (e.g. "1") */
  localId: string;
  /** Clean semantic HTML of the Latin passage (without word <a> tags) */
  latinHtml: string;
  /** Clean semantic HTML of the English translation if available */
  englishHtml?: string;
}

export interface V2PreprocessedPage {
  /** Page coordinates, e.g. "1.1" or ["1", "1"] */
  id: string | string[];
  /** Human-readable page title, e.g. "Liber I, Caput I" */
  title: string;
  /** Section count on this page */
  sectionCount: number;
  /** First and last citation coordinate on this page, e.g. ["1.1.1", "1.1.7"] */
  citationRange: [string, string];
  /** Pre-compiled HTML for single Latin view */
  singleHtml: string;
  /** Pre-compiled HTML for synchronized parallel Latin + English view */
  parallelHtml?: string;
  /** Critical apparatus notes for this page if available */
  notesHtml?: string;
}

export interface V2PreprocessedWork {
  /** Canonical work identifier, e.g. "phi0448.phi001.perseus-lat2" */
  id: string;
  /** Work title in Latin, e.g. "De bello Gallico" */
  title: string;
  /** Short or common display title, e.g. "Bellum Gallicum" */
  shortTitle?: string;
  /** Author name, e.g. "Julius Caesar" */
  author: string;
  /** URL slug for author, e.g. "caesar" */
  urlAuthor: string;
  /** URL slug for work, e.g. "de_bello_gallico" */
  urlName: string;
  /** Source provenance and rights */
  attribution: DocumentAttribution;
  /** Whether the text contains long-vowel macra (e.g. Hypotactic) */
  hasMacra: boolean;
  /** Whether an aligned English translation is available */
  hasTranslation: boolean;
  /** Translator name if translation is linked */
  translator?: string;
  /** Critical editor if recorded in TEI */
  editor?: string;
  /** Canonical Text Services URN */
  ctsUrn?: string;
  /** License details */
  license?: string;
  /** Source repository URL */
  sourceRepo?: string;
  /** Structural level names, e.g. ["book", "chapter", "section"] or ["book", "line"] */
  textParts: string[];
  /** Depth at which text is paginated, e.g. 2 for chapter, 1 for book/poem */
  paginationDepth: number;
  /** Full multi-level hierarchical outline tree for drawer TOC */
  navTree: NavTreeNode;
  /** Ordered list of pages */
  pages: V2PreprocessedPage[];
}
