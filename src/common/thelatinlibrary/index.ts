/**
 * Browser-safe page layer for The Latin Library (`src/common/thelatinlibrary/`).
 *
 * Imported by browser code (Open Texts, C6/C8) and Node scripts (C7), so no
 * file here may import `fs`, `path`, `crypto`, `node:*` or `parse5` (enforced
 * by `browser_safety.test.ts`). Node callers inject parse5 with
 * `createParse5BodyParser(parse5.parse)`.
 */

export * from "@/common/thelatinlibrary/page_layer_types";
export * from "@/common/thelatinlibrary/snapshot_types";

export {
  decodeLatinLibraryHtmlBytes,
  sniffDeclaredCharset,
} from "@/common/thelatinlibrary/encoding";
export {
  adaptDomElement,
  bodyAndTitleOfDocument,
  createParse5BodyParser,
  defaultHtmlBodyParser,
  domParserBodyParser,
  extractText,
  extractTextWithMarks,
  findElements,
  getAttr,
  hasClass,
  hasClassIgnoreCase,
  isElement,
  isText,
  normalizeSpace,
  parseHtmlToMinimalBody,
  setDefaultHtmlBodyParser,
  wordTokens,
  type ExtractTextOptions,
  type MinimalDocumentLike,
  type TextMark,
} from "@/common/thelatinlibrary/dom_adapter";
export {
  detectBlockMarkers,
  parseLatinOrdinal,
  parseRoman,
  toRoman,
} from "@/common/thelatinlibrary/markers";
export {
  extractLenientPage,
  isNavigationBlock,
  SYNTHETIC_PARAGRAPH_ATTR,
} from "@/common/thelatinlibrary/page_layer";
