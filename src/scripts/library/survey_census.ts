/**
 * Pure functions behind `./morcus.sh library survey`: the markup census of a
 * TEI `<body>`, header facts, V1 error bucketing and the fingerprint of a
 * processed work. No file system access here, so it is unit-testable on
 * inline fixtures.
 */

import type {
  WorkCensus,
  WorkFingerprint,
} from "@/common/library/audit/audit_types";
import type { ProcessedWork2 } from "@/common/library/library_types";
import { XmlNode, type XmlChild } from "@/common/xml/xml_node";

export type Counter = Map<string, number>;

export function inc(counter: Counter, key: string, by = 1): void {
  counter.set(key, (counter.get(key) ?? 0) + by);
}

/** A counter as a plain object, keys sorted by descending count then name. */
export function byCount(counter: Counter): Record<string, number> {
  return Object.fromEntries(
    [...counter.entries()].sort(
      (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
    )
  );
}

/** A counter as a plain object, keys sorted by name. */
export function byKey(counter: Counter): Record<string, number> {
  return Object.fromEntries(
    [...counter.entries()].sort((a, b) =>
      a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0
    )
  );
}

const DIV_NAMES = new Set(["div", "div1", "div2", "div3"]);

/** Everything the survey counts about the markup inside one `<body>`. */
export interface BodyCensus {
  /** Element name -> occurrences, outside notes. */
  elements: Counter;
  /** Element name -> occurrences, strictly inside a `<note>`. */
  noteElements: Counter;
  /** `element@rend` -> occurrences, outside notes. */
  rends: Counter;
  /** `element@rend` -> occurrences, inside notes. */
  noteRends: Counter;
  /** `element@attr` -> occurrences, outside notes. */
  attrs: Counter;
  /** `element@attr` -> occurrences, inside notes. */
  noteAttrs: Counter;
  /** `milestone@unit` value -> occurrences (`?` if absent). */
  milestoneUnits: Counter;
  /** `type/subtype` of div-like elements (`-` if absent) -> occurrences. */
  divTypes: Counter;
  /** Number of `div[@type=textpart]` without `@n`. */
  textpartNoN: number;
  /** Depth of each textpart leaf (a textpart with no textpart child) -> count. */
  leafDepths: Counter;
  /** Non-whitespace characters of text. */
  textChars: number;
}

function isTextpart(node: XmlChild): node is XmlNode {
  return (
    typeof node !== "string" &&
    DIV_NAMES.has(node.name) &&
    node.getAttr("type") === "textpart"
  );
}

/**
 * Counts the markup used in `body`. A `<note>` element itself counts as
 * outside notes; its descendants count as inside.
 */
export function censusOfBody(body: XmlNode): BodyCensus {
  const c: BodyCensus = {
    elements: new Map(),
    noteElements: new Map(),
    rends: new Map(),
    noteRends: new Map(),
    attrs: new Map(),
    noteAttrs: new Map(),
    milestoneUnits: new Map(),
    divTypes: new Map(),
    textpartNoN: 0,
    leafDepths: new Map(),
    textChars: 0,
  };
  const walk = (node: XmlChild, inNote: boolean, depth: number) => {
    if (typeof node === "string") {
      c.textChars += node.replace(/\s+/g, "").length;
      return;
    }
    const name = node.name;
    const rend = node.getAttr("rend");
    inc(inNote ? c.noteElements : c.elements, name);
    if (rend !== undefined) {
      inc(inNote ? c.noteRends : c.rends, `${name}@${rend}`);
    }
    for (const [attr] of node.attrs) {
      inc(inNote ? c.noteAttrs : c.attrs, `${name}@${attr}`);
    }
    if (name === "milestone") {
      inc(c.milestoneUnits, node.getAttr("unit") ?? "?");
    }
    let childDepth = depth;
    if (DIV_NAMES.has(name)) {
      const type = node.getAttr("type") ?? "-";
      inc(c.divTypes, `${type}/${node.getAttr("subtype") ?? "-"}`);
      if (type === "textpart") {
        childDepth = depth + 1;
        if (node.getAttr("n") === undefined) c.textpartNoN++;
        if (!node.children.some(isTextpart)) {
          inc(c.leafDepths, String(childDepth));
        }
      }
    }
    for (const child of node.children) {
      walk(child, inNote || name === "note", childDepth);
    }
  };
  walk(body, false, 0);
  return c;
}

function sortedKeys(counter: Counter): string[] {
  return [...counter.keys()].sort();
}

/** The checked-in census entry for one work (see `WorkCensus`). */
export function workCensusEntry(
  census: BodyCensus,
  path: string,
  onboarded: boolean
): WorkCensus {
  return {
    path,
    onboarded,
    elements: sortedKeys(census.elements),
    noteElements: sortedKeys(census.noteElements),
    rends: sortedKeys(census.rends),
    noteRends: sortedKeys(census.noteRends),
    attrs: sortedKeys(census.attrs),
    noteAttrs: sortedKeys(census.noteAttrs),
  };
}

/** Facts from outside the `<body>`. */
export interface HeaderFacts {
  hasAuthor: boolean;
  hasTitle: boolean;
  refsDeclCount: number;
  /** `<refsDecl>` without `@n="CTS"`. */
  nonCtsRefsDeclCount: number;
  /** Whether any `<refsDecl>` holds a `<citeStructure>` (the new upstream form). */
  hasCiteStructure: boolean;
  hasFront: boolean;
  hasBack: boolean;
  bodyCount: number;
  /** `text/@xml:lang`. */
  language: string | null;
  /** Text of `<licence>`, whitespace-collapsed, if present. */
  licence: string | null;
}

function textOf(node: XmlNode): string {
  return node.children
    .map((c) => (typeof c === "string" ? c : textOf(c)))
    .join("");
}

export function headerFacts(tei: XmlNode): HeaderFacts {
  const titleStmt = tei.findDescendants("titleStmt")[0];
  const refsDecls = tei.findDescendants("refsDecl");
  const text = tei.findDescendants("text")[0];
  const licence = tei.findDescendants("licence")[0];
  return {
    hasAuthor: (titleStmt?.findDescendants("author").length ?? 0) > 0,
    hasTitle: (titleStmt?.findDescendants("title").length ?? 0) > 0,
    refsDeclCount: refsDecls.length,
    nonCtsRefsDeclCount: refsDecls.filter((n) => n.getAttr("n") !== "CTS")
      .length,
    hasCiteStructure: refsDecls.some(
      (r) => r.findDescendants("citeStructure").length > 0
    ),
    hasFront: (text?.findDescendants("front").length ?? 0) > 0,
    hasBack: (text?.findDescendants("back").length ?? 0) > 0,
    bodyCount: tei.findDescendants("body").length,
    language: text?.getAttr("xml:lang") ?? null,
    licence:
      licence === undefined
        ? null
        : textOf(licence).replace(/\s+/g, " ").trim() || null,
  };
}

/**
 * Removes what precedes `<TEI` that our XML parser cannot take: comments and
 * any `<!DOCTYPE ...>` (with or without an internal subset). Processing
 * instructions such as `<?xml-model ...?>` are left alone.
 */
export function stripProlog(raw: string): string {
  const teiIdx = raw.search(/<TEI[\s>.]/);
  const prefix =
    teiIdx > 0 ? raw.slice(0, teiIdx).replace(/<!--[\s\S]*?-->/g, "") : "";
  const joined = teiIdx > 0 ? prefix + raw.slice(teiIdx) : raw;
  return joined.replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>/g, "");
}

/** The first non-blank line of `message`, trimmed. */
export function firstLineOf(message: string): string {
  return (
    message
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? ""
  );
}

/**
 * Buckets a V1 (`processTei2`) failure by the function that threw, so that
 * the survey can count works by blocker.
 */
export function categorizeV1Error(message: string, stack: string): string {
  const firstLine = firstLineOf(message);
  if (stack.includes("at getTextparts")) return "textParts: refsDecl ambiguous";
  if (stack.includes("at findCtsEncoding")) {
    return "textParts: CTS refsDecl self-inconsistent";
  }
  if (stack.includes("at getSectionId")) return "structure: nesting mismatch";
  if (stack.includes("at extractInfo")) return "metadata: titleStmt incomplete";
  if (stack.includes("at transformNoteNode")) return "markup: note contents";
  if (
    stack.includes("at processListNode") ||
    stack.includes("processListItem")
  ) {
    return "markup: list/table contents";
  }
  if (stack.includes("at transformContentNode")) {
    return `markup: content node (${firstLine.slice(0, 60)})`;
  }
  if (stack.includes("at divideWork")) return "pagination: duplicate page id";
  if (stack.includes("at preprocessTree")) return "structure: preprocess";
  return `other: ${firstLine.slice(0, 70)}`;
}

function countNodes(node: XmlChild, histogram: Counter): void {
  if (typeof node === "string") return;
  const rend = node.getAttr("rend");
  inc(histogram, rend === undefined ? node.name : `${node.name}@${rend}`);
  for (const child of node.children) countNodes(child, histogram);
}

/** The fingerprint of V1's output for one work (see `WorkFingerprint`). */
export function fingerprintOf(work: ProcessedWork2): WorkFingerprint {
  const depth = work.textParts.length;
  const citable = work.rows.filter(([id]) => id.length === depth);
  const histogram: Counter = new Map();
  for (const [, content] of work.rows) countNodes(content, histogram);
  return {
    textParts: [...work.textParts],
    rows: work.rows.length,
    pages: work.pages.length,
    citableRows: citable.length,
    firstCitation: citable.length > 0 ? citable[0][0].join(".") : null,
    lastCitation:
      citable.length > 0 ? citable[citable.length - 1][0].join(".") : null,
    notes: work.notes?.length ?? 0,
    nodes: byKey(histogram),
  };
}

/** Output assertions (plan §4.3 pillar 2) that V1 does not itself enforce. */
export interface OutputChecks {
  /** At least one citable row. */
  hasCitableRow: boolean;
  /** No row id is longer than `textParts`. */
  arityOk: boolean;
  /** There is at least one page, and pages are in order and non-overlapping. */
  pagesOrdered: boolean;
  /**
   * Rows that fall in no page. `divideWork` leaves out rows whose id is
   * shorter than a page id (e.g. a book heading when pages are chapters), so
   * this is not necessarily an error; it is reported so that it is visible.
   */
  rowsOutsidePages: number;
}

export function outputChecks(work: ProcessedWork2): OutputChecks {
  const depth = work.textParts.length;
  let pagesOrdered = work.pages.length > 0;
  let covered = 0;
  let prevEnd = 0;
  for (const page of work.pages) {
    const [start, end] = page.rows;
    if (end < start || start < prevEnd) pagesOrdered = false;
    covered += Math.max(0, end - start);
    prevEnd = end;
  }
  return {
    hasCitableRow: work.rows.some(([id]) => id.length === depth),
    arityOk: work.rows.every(([id]) => id.length <= depth),
    pagesOrdered,
    rowsOutsidePages: Math.max(0, work.rows.length - covered),
  };
}
