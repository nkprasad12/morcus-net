/**
 * Browser-safe DOM abstraction and lenient page-layer types for
 * The Latin Library HTML pages (`src/common/thelatinlibrary/`).
 *
 * IMPORTANT: This module must remain 100% browser-safe (no `fs`, `path`, `crypto`,
 * or `parse5` runtime imports).
 */

/**
 * Attribute key-value pair on a `MinimalElementNode`.
 * Attribute names are always lowercased.
 */
export interface MinimalAttr {
  readonly name: string;
  readonly value: string;
}

/**
 * Text node in the minimal DOM tree.
 * Structurally compatible with `parse5`'s `DefaultTreeAdapterMap["textNode"]`.
 */
export interface MinimalTextNode {
  readonly nodeName: "#text";
  readonly value: string;
}

/**
 * Element node in the minimal DOM tree.
 * Structurally compatible with `parse5`'s `DefaultTreeAdapterMap["element"]`
 * so `parse5` trees satisfy `MinimalElementNode` with zero wrapper overhead in Node,
 * while a tiny recursive adapter over `DOMParser` satisfies it in the browser.
 */
export interface MinimalElementNode {
  /** Lowercase HTML tag name, e.g. `"body"`, `"p"`, `"div"`, `"a"`, `"br"`. */
  readonly tagName: string;
  /** Element attributes with lowercase `name`. */
  readonly attrs: readonly MinimalAttr[];
  /** Ordered child nodes (elements, text nodes, or ignored comment/other nodes). */
  readonly childNodes: readonly MinimalChildNode[];
}

/**
 * Any child node inside a `MinimalElementNode`. Non-element, non-`#text` nodes
 * (such as `#comment`) have `nodeName` other than `"#text"` and no `tagName`.
 */
export type MinimalChildNode =
  | MinimalElementNode
  | MinimalTextNode
  | { readonly nodeName: string };

/**
 * Pluggable HTML-to-body parser function.
 * - In Node builds/tests: backed by `parse5.parse(html)`.
 * - In Browser bundles: backed by `new DOMParser().parseFromString(html, "text/html")`.
 */
export type HtmlBodyParser = (rawHtml: string) => {
  readonly body: MinimalElementNode;
  readonly headTitle?: string;
};

/**
 * Categories of structural or section markers detected by the lenient page layer
 * inside headings and paragraphs:
 * - `"bracketed_number"`: `[1]`, `[1,1]`, `[I]`, `[pr.]`, `[1a]`
 * - `"anchor"`: `<a name="...">` or `<a id="...">` milestone
 * - `"liber_heading"`: `LIBER I`, `LIBER PRIMUS`, `LIBER SECUNDUS`, etc.
 * - `"roman_heading"`: Standalone or leading Roman numeral heading (`I`, `II.`, `XIV.`)
 * - `"digest_citation"`: Digest four-part or three-part citation (`1.1.1pr.`, `30.0.1`)
 * - `"gaius_rubric"`: Gaius numbered rubric heading (`I. DE ...`)
 * - `"prologus"`: Trogus `PROLOGUS LIBRI ...` heading
 * - `"bare_number"`: Leading bare or parenthesized section number (`1.`, `(1)`)
 */
export type DetectedMarkerKind =
  | "bracketed_number"
  | "anchor"
  | "liber_heading"
  | "roman_heading"
  | "digest_citation"
  | "gaius_rubric"
  | "prologus"
  | "bare_number";

/**
 * A structural/citation marker detected within or at the start of a `PageBlock`.
 */
export interface DetectedMarker {
  /** Marker classification. */
  readonly kind: DetectedMarkerKind;
  /** Exact raw matched substring (e.g. `"[1]"`, `"LIBER PRIMUS"`, `"1.1.1pr."`) or anchor name. */
  readonly raw: string;
  /** Normalized marker value (e.g. `"1"`, `"1.1"`, `"1.1.1pr"`, `"pr"`). */
  readonly value: string;
  /**
   * 0-based character offset of `raw` inside `PageBlock.text` (`0` for block-initial
   * markers or `<a name>` anchors at the start of the block).
   */
  readonly offset: number;
  /** True when the marker is accompanied by an `<a name="...">` anchor in the block. */
  readonly anchored?: boolean;
}

/**
 * Kind of structural block emitted in reading order by the lenient page parser.
 */
export type PageBlockKind = "heading" | "paragraph" | "verse" | "table";

/**
 * A single ordered content block extracted from a Latin Library page after
 * stripping the page title, internal navigation bar, and site footer.
 */
export interface PageBlock {
  /** Block classification (`"heading"` for centred `div` / subheaders, `"paragraph"` for `<p>`, etc.). */
  readonly kind: PageBlockKind;
  /** Normalized visible text of the block (with `<br>` preserved as `"\n"` when verse/lines). */
  readonly text: string;
  /** Underlying minimal DOM element for strict converters that inspect inline tags (`<b>`, `<i>`, `<a name>`). */
  readonly element: MinimalElementNode;
  /** Structural/section markers detected inside this block in text order. */
  readonly markers: readonly DetectedMarker[];
  /** All `<a name="...">` / `<a id="...">` values found inside this block. */
  readonly anchors: readonly string[];
}

/**
 * Options for `extractLenientPage`.
 */
export interface LenientPageParseOptions {
  /**
   * Optional custom `HtmlBodyParser`. Defaults to the universal parser
   * (`DOMParser` when `typeof DOMParser !== "undefined"`, otherwise `parse5` if registered).
   */
  readonly parser?: HtmlBodyParser;
  /**
   * Whether to preserve `<br>` line breaks as `"\n"` inside block text
   * (useful for verse works in Experimental Texts). Defaults to `false` (collapses whitespace)
   * when omitted.
   */
  readonly preserveLineBreaks?: boolean;
}

/**
 * Lenient output of `extractLenientPage` (`src/common/thelatinlibrary/`).
 *
 * Never throws on page layout quirks; any structural anomaly is recorded in
 * `warnings` so lenient callers can render any page while strict converters
 * can assert `warnings.length === 0` (or run strict validators) on top of
 * `LenientPageContent`.
 */
export interface LenientPageContent {
  /**
   * Extracted page title (`<h1>` or `p.pagehead`). Empty string `""` if the page
   * has no recognizable title element (with a warning recorded in `warnings`).
   */
  readonly pageTitle: string;
  /**
   * Internal `#target` anchor names from the `<p class="internal_navigation">`
   * or `<p class="margin">` jump bar, or `undefined` if the page has no nav bar.
   */
  readonly nav: string[] | undefined;
  /**
   * Centred `<div>` / subheading texts in reading order.
   */
  readonly headings: string[];
  /**
   * Non-empty content paragraph elements in reading order.
   */
  readonly paragraphs: MinimalElementNode[];
  /**
   * Unified sequence of all content blocks (both headings and paragraphs/verse blocks)
   * in exact document reading order, annotated with detected `markers` and `anchors`.
   */
  readonly blocks: PageBlock[];
  /**
   * Visible text of the site footer (`div.footer` / `p.border` with `The Latin Library`),
   * or `undefined` if no footer was found.
   */
  readonly footerText: string | undefined;
  /**
   * All visible text inside `<body>` (including title and footer), used for
   * provenance and copyright scanning.
   */
  readonly bodyText: string;
  /**
   * Non-fatal layout or marker anomalies encountered while parsing the page
   * (e.g. unexpected direct child tag in `<body>`, multiple nav bars, missing footer).
   */
  readonly warnings: string[];
}
