/**
 * The structural stage of the Perseus TEI pipeline: works out a work's
 * citation scheme and which elements of its `<body>` are citable sections.
 *
 * The scheme comes from upstream's `<refsDecl xml:id="CTS">` `<citeStructure>`
 * declaration where there is one (326 of 334 Latin files), and is otherwise
 * derived from the tree. Upstream generated the declarations by script, so they
 * are treated as strongly preferred input that is checked against the tree,
 * not as ground truth. See `docs/PLAN.md` §5.2 and the rules below.
 *
 * Citation levels are either **containers** (an element whose `@n` names the
 * section: `div`, `div1`..`div3`, `seg`, `l`) or **points** (a marker that
 * starts a section: `milestone`, `lb`, `pb`). A point level is turned into
 * containers by slicing its parent's content at each marker
 * (`sliceAtMarkers`), so the rest of the pipeline only sees containers.
 *
 * The build fails (rather than mis-citing or dropping text) where the
 * declaration and the tree cannot be reconciled: a numbered division that no
 * level accounts for, a division that matches a level but has no `@n`, or
 * leaf sections that do not fit one scheme (`checkLeafPaths`).
 */

import { assert, checkPresent } from "@/common/assert";
import { XmlNode, type XmlChild } from "@/common/xml/xml_node";

/** One step of a `citeStructure/@match` path, e.g. `div[@subtype='book']`. */
export interface CiteStep {
  /** The element name. */
  name: string;
  /** `[@key='value']` predicates; a `value` of `undefined` is `[@key]`. */
  predicates: [key: string, value: string | undefined][];
  /** Whether the step is reached by `//` (any depth) rather than `/`. */
  descendant: boolean;
}

/** A parsed `<citeStructure>` level. */
export interface CiteLevel {
  /**
   * The unit name. Upstream leaves it off some levels, which it marks
   * `n="chunk"` instead (see `toEvalLevels`).
   */
  unit?: string;
  /** The raw `@match`, for messages. */
  match: string;
  /** The `|`-separated alternatives of `@match`, each a path of steps. */
  alternatives: CiteStep[][];
  /** The attribute that holds the citation value (`@use`), usually `n`. */
  use: string;
  children: CiteLevel[];
}

/** Elements that are citation points (markers) rather than containers. */
const POINT_ELEMENTS = new Set(["milestone", "lb", "pb"]);
/** CTS edition wrappers, which are never citation levels. */
const EDITION_DIV_TYPES = new Set(["edition", "translation", "commentary"]);
/** Subtrees that never hold citation levels. */
const OPAQUE_ELEMENTS = new Set(["note", "#comment"]);
const NUMBERED_DIVS = new Set(["div1", "div2", "div3"]);

const ROOT_MATCH = "/TEI/text/body";

// // // // // // // // // // //
// `citeStructure` parsing    //
// // // // // // // // // // //

/**
 * Parses one `citeStructure/@match` into its alternatives.
 *
 * Supports the subset of XPath that upstream uses (19 normalized patterns):
 * child steps (`div/div`), descendant steps (`.//l`), `[@a='v']` and `[@a]`
 * predicates, and `|` unions. It tolerates upstream's typo with a missing
 * opening quote (`div/div[@subtype=book']` in `phi0474.phi043.perseus-lat2`).
 */
export function parseCiteMatch(match: string): CiteStep[][] {
  return match.split("|").map((rawAlternative) => {
    let rest = rawAlternative.trim();
    assert(rest.length > 0, () => `Empty alternative in match "${match}"`);
    const steps: CiteStep[] = [];
    let descendant = false;
    if (rest.startsWith(".//")) {
      descendant = true;
      rest = rest.slice(3);
    } else if (rest.startsWith("./")) {
      rest = rest.slice(2);
    }
    while (rest.length > 0) {
      const stepMatch = checkPresent(
        rest.match(/^([A-Za-z_][\w.:-]*)((?:\[[^\]]*\])*)/),
        `Unsupported citeStructure match "${match}"`
      );
      const [whole, name, rawPredicates] = stepMatch;
      const predicates: CiteStep["predicates"] = [];
      for (const predicate of rawPredicates.match(/\[[^\]]*\]/g) ?? []) {
        const parsed = checkPresent(
          predicate.match(
            /^\[\s*@([\w:-]+)\s*(?:=\s*(['"]?)([^'"\]]*)['"]?\s*)?\]$/
          ),
          `Unsupported predicate ${predicate} in match "${match}"`
        );
        predicates.push([parsed[1], parsed[3]]);
      }
      steps.push({ name, predicates, descendant });
      rest = rest.slice(whole.length);
      descendant = false;
      if (rest.startsWith("//")) {
        descendant = true;
        rest = rest.slice(2);
      } else if (rest.startsWith("/")) {
        rest = rest.slice(1);
      } else {
        assert(
          rest.length === 0,
          () => `Unsupported citeStructure match "${match}"`
        );
      }
    }
    return steps;
  });
}

function parseCiteLevel(node: XmlNode): CiteLevel {
  const match = checkPresent(node.getAttr("match"), "citeStructure@match");
  const use = (node.getAttr("use") ?? "@n").trim();
  assert(use.startsWith("@"), () => `Unsupported citeStructure@use: ${use}`);
  return {
    unit: node.getAttr("unit"),
    match,
    alternatives: parseCiteMatch(match),
    use: use.slice(1),
    children: node.findChildren("citeStructure").map(parseCiteLevel),
  };
}

function findEncodingDesc(teiRoot: XmlNode): XmlNode | undefined {
  return teiRoot.findChildren("teiHeader")[0]?.findChildren("encodingDesc")[0];
}

/**
 * The citation levels that `<refsDecl xml:id="CTS">` declares under its root
 * `<citeStructure match="/TEI/text/body">`, or `undefined` if there is no
 * such declaration.
 */
export function parseCiteStructure(teiRoot: XmlNode): CiteLevel[] | undefined {
  const refsDecls = (findEncodingDesc(teiRoot)?.findChildren("refsDecl") ?? [])
    .filter((node) => node.getAttr("xml:id") === "CTS")
    .filter((node) => node.findChildren("citeStructure").length > 0);
  if (refsDecls.length === 0) {
    return undefined;
  }
  assert(refsDecls.length === 1, "Expected one <refsDecl xml:id='CTS'>");
  const roots = refsDecls[0].findChildren("citeStructure");
  assert(roots.length === 1, "Expected one root <citeStructure>");
  const rootMatch = roots[0].getAttr("match")?.replace(/^\/tei:/, "/");
  assert(
    rootMatch === ROOT_MATCH,
    () => `Unexpected root citeStructure match: ${rootMatch}`
  );
  return roots[0].findChildren("citeStructure").map(parseCiteLevel);
}

/**
 * The unit names declared by the older header declarations, lowercased: the
 * `cRefPattern/@n`s of `<refsDecl n="CTS">` and the `refState/@unit`s (or
 * `state/@unit`s) of any other `<refsDecl>` without `xml:id="CTS"`.
 */
export function declaredUnitNames(teiRoot: XmlNode): string[] {
  const names: string[] = [];
  for (const refsDecl of findEncodingDesc(teiRoot)?.findChildren("refsDecl") ??
    []) {
    if (refsDecl.getAttr("xml:id") === "CTS") {
      continue;
    }
    for (const child of refsDecl.children) {
      if (typeof child === "string") {
        continue;
      }
      const name =
        child.name === "cRefPattern"
          ? child.getAttr("n")
          : child.name === "refState" || child.name === "state"
          ? child.getAttr("unit")
          : undefined;
      if (name !== undefined) {
        names.push(name.toLowerCase());
      }
    }
  }
  return names;
}

// // // // // // // // // // //
// Spine evaluation           //
// // // // // // // // // // //

/** An element that is a citable section, and the value that cites it. */
export interface CitationContainer {
  unit: string;
  n: string;
}

export interface CitationSpine {
  /**
   * The unit names of the work's citation scheme, e.g.
   * `["book", "chapter", "section"]`: the path of the most common kind of
   * leaf section (see `dominantPath`). Rows whose id has this many parts are
   * citable; shallower rows (headings, prologues) are not.
   */
  textParts: string[];
  /** Every citable section element in the body, by identity. */
  containers: Map<XmlNode, CitationContainer>;
  /**
   * The ids (parts joined by `.`) of the leaf sections: containers with no
   * container inside them. Usually `textParts.length` parts long; a shorter
   * one is a section at a shallower depth (Livy's books 46-142, which are
   * only summaries).
   */
  leafIds: Set<string>;
  /** Where the scheme came from. */
  source: "citeStructure" | "tree";
  /** Non-fatal disagreements between the declaration and the tree. */
  warnings: string[];
}

export namespace CitationSpine {
  /**
   * The section id of the last of `ancestors` (a root-first chain), and
   * whether that node is itself a citation container (a section "leader").
   */
  export function sectionIdOf(
    spine: Pick<CitationSpine, "containers">,
    ancestors: XmlNode[]
  ): [string[], boolean] {
    const id: string[] = [];
    let isLeader = false;
    for (const ancestor of ancestors) {
      const container = spine.containers.get(ancestor);
      isLeader = container !== undefined;
      if (container !== undefined) {
        id.push(container.n);
      }
    }
    return [id, isLeader];
  }
}

/** A level as evaluated: a container or point test with child levels. */
interface EvalLevel {
  /** The unit name; if undefined, named after the elements it matches. */
  unit?: string;
  /** The alternatives' paths; the last step of each is its node test. */
  alternatives: CiteStep[][];
  use: string;
  children: EvalLevel[];
  /** Why the level exists, for messages. */
  origin: string;
  /** Elements inside which this level's sections are not sought. */
  skipInside?: ReadonlySet<string>;
}

/**
 * Converts the declared levels to evaluated ones, dropping unnamed leaf
 * levels. Upstream gives a few `citeStructure`s no `@unit` but `n="chunk"`:
 * a page (`pb`) or Perseus `card` milestone beside the real `line` level
 * (Ovid's Ibis, Seneca's tragedies), which is a display-chunking hint for
 * an alternative to the citation, not a level of it, so it is left out. An
 * unnamed level with levels below it (Persius' `div[@type]` over `line`) is
 * part of the citation and is named after the elements it matches.
 */
function toEvalLevels(levels: CiteLevel[]): EvalLevel[] {
  return levels
    .filter((level) => level.unit !== undefined || level.children.length > 0)
    .map((level) => ({
      unit: level.unit,
      alternatives: level.alternatives,
      use: level.use,
      children: toEvalLevels(level.children),
      origin: `citeStructure ${level.unit ?? "(no unit)"} <- ${level.match}`,
    }));
}

/** The most common unit name among `names` (first on ties). */
function mostCommon(names: string[]): string {
  const counts = new Map<string, number>();
  names.forEach((name) => counts.set(name, (counts.get(name) ?? 0) + 1));
  let best = names[0];
  for (const [name, count] of counts) {
    if (count > (counts.get(best) ?? 0)) {
      best = name;
    }
  }
  return best;
}

/** Whether `node` passes the node test of `step`. */
function passesStep(node: XmlNode, step: CiteStep): boolean {
  return (
    node.name === step.name &&
    step.predicates.every(([key, value]) => {
      const actual = node.getAttr(key);
      return value === undefined ? actual !== undefined : actual === value;
    })
  );
}

/** Whether `node` is a citation match for `step` (edition wrappers never are). */
function matchesStep(node: XmlNode, step: CiteStep): boolean {
  return (
    passesStep(node, step) &&
    !(node.name === "div" && EDITION_DIV_TYPES.has(node.getAttr("type") ?? ""))
  );
}

/**
 * The elements of `between` (the chain from a context down to a match) that
 * the declared path `steps` explicitly steps through, e.g. the edition `div`
 * and Livy's `part` for `div/div/div[@subtype='book']`. Elements reached by
 * `//`, or by our relaxed matching past the declared steps, are not.
 */
function steppedThrough(steps: CiteStep[], between: XmlNode[]): Set<XmlNode> {
  const covered = new Set<XmlNode>();
  let i = 0;
  for (const step of steps.slice(0, -1)) {
    if (step.descendant) {
      while (i < between.length && !passesStep(between[i], step)) {
        i++;
      }
    }
    if (i >= between.length || !passesStep(between[i], step)) {
      return new Set();
    }
    covered.add(between[i]);
    i++;
  }
  return covered;
}

function isPointTest(step: CiteStep): boolean {
  return POINT_ELEMENTS.has(step.name);
}

interface ContainerMatch {
  node: XmlNode;
  level: EvalLevel;
  n: string;
  /** The elements strictly between the context and `node`. */
  between: XmlNode[];
  /** The alternative of `level.alternatives` that matched. */
  steps: CiteStep[];
  /** Whether it matched by position rather than by the declared test. */
  positional?: boolean;
}

interface PointMatch {
  node: XmlNode;
  level: EvalLevel;
  n: string;
}

interface LevelMatches {
  containers: ContainerMatch[];
  points: PointMatch[];
}

/** Where `collectMatches` reports what it finds wrong or works around. */
interface MatchSink {
  errors: Set<string>;
  warnings: string[];
}

/** The citation value of `node`: `@use` (normally `@n`), else `@xml:id`. */
function citationValue(node: XmlNode, use: string): string | undefined {
  return node.getAttr(use) ?? node.getAttr("xml:id");
}

function lastStep(steps: CiteStep[]): CiteStep {
  return steps[steps.length - 1];
}

/** The container node tests of `level`'s alternatives. */
function containerTests(level: EvalLevel): CiteStep[] {
  return level.alternatives.map(lastStep).filter((t) => !isPointTest(t));
}

/** Whether a numbered section of `level` lies anywhere below `node`. */
function containsLevelMatch(node: XmlNode, level: EvalLevel): boolean {
  const tests = containerTests(level);
  const visit = (parent: XmlNode): boolean =>
    parent.children.some(
      (child) =>
        typeof child !== "string" &&
        !OPAQUE_ELEMENTS.has(child.name) &&
        ((child.getAttr(level.use) !== undefined &&
          tests.some((test) => matchesStep(child, test))) ||
          visit(child))
    );
  return visit(node);
}

/**
 * The container levels below `levels`, shallowest first. A section of one of
 * these may sit directly in the context when the level between is absent
 * there: Claudian's In Rufinum declares book > poem > line, but books 1 and 2
 * have their lines directly in the book (only book 3 has poems).
 */
function deeperLevels(levels: EvalLevel[]): EvalLevel[] {
  const result: EvalLevel[] = [];
  let frontier = levels;
  while (frontier.length > 0) {
    frontier = frontier
      .flatMap((level) => level.children)
      .filter((level) => containerTests(level).length > 0);
    result.push(...frontier);
  }
  return result;
}

/**
 * Finds the nearest matches of `levels` (sibling `citeStructure` branches)
 * below `context`.
 *
 * Each level is matched by the node test of its last step, at any depth below
 * the context but not below another match. Upstream's generator writes child
 * steps (`div[@subtype='poem']`, `l`), but the encoding often has wrappers in
 * between (`<lg>`, `<p>`, an unnumbered grouping `<div>`), which strict XPath
 * would miss; the steps before the last only describe which intermediate
 * elements the declaration skips (see Rule A in `evaluateLevels`). Besides:
 *
 * - An element that passes a level's test but holds sections of that same
 *   level is a wrapper, not a section: Sidonius' `<div2 type="section">`
 *   over numbered `<l>`s, for `l | div2[@type='section']`.
 * - A section of a deeper level may stand in for an absent level (see
 *   `deeperLevels`).
 * - A numbered division in the place of a level's sections, with the same
 *   element and attributes but another value, is one of them: upstream's
 *   typos (`subtype="secton"`, `"chaper"`), prefaces (`subtype="preface"
 *   n="pr"` before the sections) and variant names (Sidonius' letters
 *   encoded as `<div2 type="poem">` in books 1-7).
 * - A container match with no citation value is not a section. For `<l>` that
 *   is expected (Rule E: Lucretius' `<l><gap/></l>`), and its content belongs
 *   to the enclosing section; any other division that passes a level's test
 *   without one is an error, as its sections could not be cited.
 */
function collectMatches(
  context: XmlNode,
  levels: EvalLevel[],
  sink?: MatchSink
): LevelMatches {
  const result: LevelMatches = { containers: [], points: [] };
  const deeper = deeperLevels(levels);
  const tryDeclared = (
    child: XmlNode,
    between: XmlNode[]
  ): "matched" | "tested" | undefined => {
    for (const level of [...levels, ...deeper]) {
      const isDeeper = !levels.includes(level);
      const skipInside = level.skipInside;
      if (skipInside && between.some((node) => skipInside.has(node.name))) {
        continue;
      }
      const steps = level.alternatives.find((alternative) =>
        matchesStep(child, lastStep(alternative))
      );
      if (steps === undefined || (isDeeper && isPointTest(lastStep(steps)))) {
        continue;
      }
      if (isPointTest(lastStep(steps))) {
        const n = citationValue(child, level.use);
        if (n === undefined) {
          return "tested";
        }
        result.points.push({ node: child, level, n });
        return "matched";
      }
      const n = child.getAttr(level.use);
      if (n === undefined) {
        if (child.name !== "l" && child.name !== "seg") {
          sink?.errors.add(
            `<${child.name}> matching ${level.origin} has no @${level.use}`
          );
        }
        return "tested";
      }
      if (
        containsLevelMatch(child, level) ||
        (isDeeper && levels.some((l) => containsLevelMatch(child, l)))
      ) {
        return "tested";
      }
      result.containers.push({ node: child, level, n, between, steps });
      return "matched";
    }
    return undefined;
  };
  const tryPositional = (child: XmlNode, between: XmlNode[]): boolean => {
    if (!isNumberedDivision(child)) {
      return false;
    }
    for (const level of levels) {
      const steps = level.alternatives.find((alternative) => {
        const test = lastStep(alternative);
        return (
          !isPointTest(test) &&
          test.name === child.name &&
          test.predicates.every(([key]) => child.getAttr(key) !== undefined)
        );
      });
      if (steps === undefined || containsLevelMatch(child, level)) {
        continue;
      }
      sink?.warnings.push(
        `Citing <${child.name} ${lastStep(steps)
          .predicates.map(([key]) => `${key}="${child.getAttr(key)}"`)
          .join(" ")} n="${child.getAttr("n")}"> as ${level.origin}`
      );
      result.containers.push({
        node: child,
        level,
        n: checkPresent(child.getAttr("n")),
        between,
        steps,
        positional: true,
      });
      return true;
    }
    return false;
  };
  const visit = (node: XmlNode, between: XmlNode[]) => {
    for (const child of node.children) {
      if (typeof child === "string" || OPAQUE_ELEMENTS.has(child.name)) {
        continue;
      }
      const declared = tryDeclared(child, between);
      if (declared === "matched") {
        continue;
      }
      if (declared === undefined && tryPositional(child, between)) {
        continue;
      }
      visit(child, [...between, child]);
    }
  };
  visit(context, []);
  return result;
}

function hasDuplicates(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

/** A numbered division that a declaration's path may have skipped. */
function isNumberedDivision(node: XmlNode): boolean {
  if (node.getAttr("n") === undefined) {
    return false;
  }
  if (NUMBERED_DIVS.has(node.name)) {
    return true;
  }
  return node.name === "div" && node.getAttr("type") === "textpart";
}

function divisionUnit(node: XmlNode): string {
  if (node.name === "l") {
    return "line";
  }
  return checkPresent(
    node.name === "div" && node.getAttr("type") === "textpart"
      ? node.getAttr("subtype") ?? node.getAttr("type")
      : node.getAttr("type") ?? node.getAttr("subtype"),
    `No unit name for <${node.name} n="${node.getAttr("n")}">`
  );
}

/** Non-whitespace characters of text under `node`, notes included. */
export function textWeight(node: XmlChild): number {
  if (typeof node === "string") {
    return node.replace(/\s+/g, "").length;
  }
  let total = 0;
  for (const child of node.children) {
    total += textWeight(child);
  }
  return total;
}

/**
 * Splits the content of `context` at `markers` (which may be nested inside
 * its children, e.g. `<milestone>` or `<lb>` inside a `<p>`) and replaces it
 * with: the content before the first marker, unchanged, followed by one
 * wrapper (from `makeWrapper`) per marker holding the content from that marker
 * to the next. An element that contains a marker is split into shallow copies
 * on either side of it, so block and paragraph tags (and everything in them,
 * notes included) are kept. The markers themselves are dropped. Returns the
 * wrappers, in order.
 *
 * Exported for unit testing.
 */
export function sliceAtMarkers(
  context: XmlNode,
  markers: ReadonlySet<XmlNode>,
  makeWrapper: (marker: XmlNode, content: XmlChild[]) => XmlNode
): XmlNode[] {
  const holdsMarker = new Set<XmlNode>();
  const mark = (node: XmlNode): boolean => {
    let found = false;
    for (const child of node.children) {
      if (typeof child === "string") {
        continue;
      }
      if (markers.has(child) || mark(child)) {
        found = true;
      }
    }
    if (found) {
      holdsMarker.add(node);
    }
    return found;
  };
  mark(context);

  interface Part {
    marker: XmlNode;
    content: XmlChild[];
  }
  const isBlank = (content: XmlChild[]) =>
    content.every((c) => typeof c === "string" && c.trim().length === 0);
  // A copy of `node` with other `children`. Continuation copies drop the
  // element's identity and its paragraph indent, which belong to its start.
  const copyWith = (node: XmlNode, children: XmlChild[], first: boolean) => {
    const attrs = node.attrs
      .filter(([key]) => first || key !== "xml:id")
      .map(([key, value]): [string, string] => [
        key,
        first || key !== "rend"
          ? value
          : value
              .split(/[\s;]+/)
              .filter((t) => t !== "indent" && t !== "align(indent)")
              .join(" "),
      ])
      .filter(([key, value]) => key !== "rend" || value.length > 0);
    return new XmlNode(node.name, attrs, children);
  };
  const pushCopy = (
    target: XmlChild[],
    node: XmlNode,
    children: XmlChild[],
    first: boolean
  ) => {
    if (isBlank(children)) {
      // Nothing but layout whitespace: keep the whitespace, not the element.
      target.push(...children);
      return;
    }
    target.push(copyWith(node, children, first));
  };
  const split = (node: XmlNode): { head: XmlChild[]; parts: Part[] } => {
    const head: XmlChild[] = [];
    const parts: Part[] = [];
    let current = head;
    for (const child of node.children) {
      if (typeof child !== "string" && markers.has(child)) {
        const part: Part = { marker: child, content: [] };
        parts.push(part);
        current = part.content;
        continue;
      }
      if (typeof child !== "string" && holdsMarker.has(child)) {
        const inner = split(child);
        pushCopy(current, child, inner.head, true);
        inner.parts.forEach((innerPart, i) => {
          const part: Part = { marker: innerPart.marker, content: [] };
          pushCopy(
            part.content,
            child,
            innerPart.content,
            i === 0 && isBlank(inner.head)
          );
          parts.push(part);
          current = part.content;
        });
        continue;
      }
      current.push(child);
    }
    return { head, parts };
  };

  const { head, parts } = split(context);
  const wrappers = parts.map((part) => makeWrapper(part.marker, part.content));
  context.children.length = 0;
  context.children.push(...head, ...wrappers);
  return wrappers;
}

interface SpineBuilder {
  containers: Map<XmlNode, CitationContainer>;
  /** The unit path of each container, for `textParts`. */
  paths: Map<XmlNode, string[]>;
  /**
   * Numbered divisions that are deliberately not sections: those a declared
   * path steps through (Livy's `part`s) and undeclared groupings (Rule C).
   */
  skipped: Set<XmlNode>;
  declared: ReadonlySet<string>;
  sink: MatchSink;
  slicePoints: boolean;
}

function register(
  builder: SpineBuilder,
  node: XmlNode,
  unit: string,
  n: string,
  path: string[]
) {
  // Every id part is non-empty and has no `.`, which joins the parts.
  assert(
    n.trim().length > 0,
    () => `Empty citation value on <${node.name}> (${unit})`
  );
  assert(
    !n.includes("."),
    () => `Citation value "${n}" on <${node.name}> (${unit}) contains "."`
  );
  builder.containers.set(node, { unit, n });
  builder.paths.set(node, path);
}

/**
 * Elements whose `<l n>` are a quotation's own numbering, not the work's
 * lines: Ausonius' Epistulae 25 quotes two verses, numbered 1 and 2, in the
 * prose preface before the letter's own lines 1 and 2.
 */
const QUOTATION_ELEMENTS: ReadonlySet<string> = new Set(["quote", "q", "cit"]);

/**
 * The share of a leaf level's `<l>`s that must carry `@n` for Rule B to add a
 * `line` level; the rest belong to their enclosing section (Rule E).
 */
const IMPLICIT_LINE_MIN_NUMBERED = 0.9;

/**
 * Rule B: a leaf level whose sections hold `<seg type="X" n="...">`, where
 * the older headers declare `X` as a unit, gets `X` as an implicit last level.
 * Upstream's generator only looked at `<div>`s, so it missed (for example)
 * the `seg[@type='section']` level inside every chapter of Nepos, which
 * `<refsDecl n="CTS">` declares. Likewise a leaf level whose sections hold
 * numbered `<l>`s gets an implicit `line` level where the older headers
 * declare `line`: the `citeStructure` of Prudentius' Psychomachia and seven
 * Ausonius poems stops at `section`, so their lines would not be citable.
 * Lines inside a quotation (`QUOTATION_ELEMENTS`) are not counted or cited.
 */
function implicitLeafLevels(
  builder: SpineBuilder,
  containers: XmlNode[]
): EvalLevel[] {
  const types = new Set<string>();
  let numberedLines = 0;
  let unnumberedLines = 0;
  const visit = (node: XmlNode, inQuotation: boolean) => {
    for (const child of node.children) {
      if (typeof child === "string" || OPAQUE_ELEMENTS.has(child.name)) {
        continue;
      }
      const type = child.getAttr("type");
      if (
        child.name === "seg" &&
        type !== undefined &&
        child.getAttr("n") !== undefined &&
        builder.declared.has(type.toLowerCase())
      ) {
        types.add(type);
        continue;
      }
      if (child.name === "l" && !inQuotation) {
        if (child.getAttr("n") === undefined) {
          unnumberedLines++;
        } else {
          numberedLines++;
          continue;
        }
      }
      visit(child, inQuotation || QUOTATION_ELEMENTS.has(child.name));
    }
  };
  containers.forEach((container) => visit(container, false));
  const levels: EvalLevel[] = Array.from(types).map((type) => ({
    unit: type,
    alternatives: [
      [{ name: "seg", predicates: [["type", type]], descendant: true }],
    ],
    use: "n",
    children: [],
    origin: `seg[@type='${type}'] (undeclared in citeStructure)`,
  }));
  if (
    levels.length === 0 &&
    numberedLines > 0 &&
    builder.declared.has("line")
  ) {
    const share = numberedLines / (numberedLines + unnumberedLines);
    if (share >= IMPLICIT_LINE_MIN_NUMBERED) {
      levels.push({
        unit: "line",
        alternatives: [[{ name: "l", predicates: [], descendant: true }]],
        use: "n",
        children: [],
        origin: "l (undeclared in citeStructure)",
        skipInside: QUOTATION_ELEMENTS,
      });
    } else {
      builder.sink.warnings.push(
        `Not adding an implicit line level: only ${numberedLines} of ` +
          `${numberedLines + unnumberedLines} <l> have @n`
      );
    }
  }
  return levels;
}

/**
 * Rule C: a non-leaf level that the older headers do not declare at all,
 * whose sections' children are numbered uniquely across all of them, is an
 * editorial grouping rather than part of the citation (Catullus' `lyrics` /
 * `long_poems` / `elegies` books over poems 1..116, where `<refsDecl n="CTS">`
 * declares only `poem` and `line`). It is left out of the ids.
 */
function isUndeclaredGrouping(
  builder: SpineBuilder,
  level: EvalLevel,
  matches: ContainerMatch[],
  isTopLevel: boolean
): boolean {
  if (
    // Only a grouping of the whole work, with more than one group: a single
    // book (Seneca's Dialogi) or a scene within an act is not one.
    !isTopLevel ||
    matches.length < 2 ||
    builder.declared.size === 0 ||
    level.unit === undefined ||
    builder.declared.has(level.unit.toLowerCase()) ||
    // Leaving it out must leave a scheme of at least two levels: dropping
    // the poems of a collection whose lines run on (Claudian, Ausonius)
    // would cite bare lines and lose every poem's heading.
    level.children.length === 0 ||
    level.children.some((child) => child.children.length === 0)
  ) {
    return false;
  }
  const childValues = new Map<EvalLevel, string[]>();
  for (const match of matches) {
    for (const child of collectMatches(match.node, level.children).containers) {
      const values = childValues.get(child.level) ?? [];
      values.push(child.n);
      childValues.set(child.level, values);
    }
  }
  return (
    childValues.size > 0 &&
    Array.from(childValues.values()).every((values) => !hasDuplicates(values))
  );
}

/**
 * Whether `node`'s whole content is struck out (`<l n="453"><del>...</del></l>`).
 */
function isStruckOut(node: XmlNode): boolean {
  const content = node.children.filter(
    (c) => typeof c !== "string" || c.trim().length > 0
  );
  return (
    content.length === 1 &&
    typeof content[0] !== "string" &&
    content[0].name === "del"
  );
}

/**
 * `matches` without the struck-out sections whose number another section
 * here also has. An editor who transposes lines prints them, cited, where
 * they belong and, struck out, where they were transmitted (Silius 11.453-458
 * after 11.290 and after 11.452); the struck-out copy is not a second 11.453
 * but part of the enclosing section. Struck-out sections with a number of
 * their own (bracketed spurious lines in Juvenal or Lucretius) stay citable.
 */
function withoutStruckOutDuplicates(
  matches: ContainerMatch[]
): ContainerMatch[] {
  const byN = new Map<string, ContainerMatch[]>();
  for (const match of matches) {
    byN.set(match.n, [...(byN.get(match.n) ?? []), match]);
  }
  const dropped = new Set<ContainerMatch>();
  for (const group of byN.values()) {
    const struck = group.filter((m) => isStruckOut(m.node));
    if (group.length > 1 && 0 < struck.length && struck.length < group.length) {
      struck.forEach((m) => dropped.add(m));
    }
  }
  return matches.filter((m) => !dropped.has(m));
}

function evaluateLevels(
  builder: SpineBuilder,
  context: XmlNode,
  levels: EvalLevel[],
  path: string[]
) {
  if (levels.length === 0) {
    return;
  }
  const { containers, points } = collectMatches(context, levels, builder.sink);
  // The levels with sections here, which may include deeper levels standing
  // in for absent ones (see `deeperLevels`).
  const matchedLevels = Array.from(new Set(containers.map((m) => m.level)));
  for (const level of matchedLevels) {
    const matches = withoutStruckOutDuplicates(
      containers.filter((m) => m.level === level)
    );
    if (isUndeclaredGrouping(builder, level, matches, path.length === 0)) {
      builder.sink.warnings.push(
        `Ignoring undeclared grouping level ${level.origin}`
      );
      for (const match of matches) {
        builder.skipped.add(match.node);
        evaluateLevels(builder, match.node, level.children, path);
      }
      continue;
    }
    // Rule A: the declaration may skip intermediate numbered divisions
    // (`div/div/div[@subtype='section']`). That is right when the sections
    // are numbered uniquely without them (Livy's `part`s over books 1..45),
    // but where the numbering restarts in each division (Cicero's
    // Philippics, speech > section) they must stay in the id. A numbered
    // division that the path does not explicitly step through (reached by
    // `//`, as in `.//div[@subtype='fragment']` under Seneca the Elder's
    // `book`, or by a wrapper the generator did not see) also stays: the
    // declaration says nothing about it.
    const collide = hasDuplicates(matches.map((m) => m.n));
    const unit =
      level.unit ?? mostCommon(matches.map((m) => divisionUnit(m.node)));
    const leafLevels =
      level.children.length > 0
        ? level.children
        : implicitLeafLevels(
            builder,
            matches.map((m) => m.node)
          );
    // A division of the same kind as those kept between (Jerome's letters,
    // kept over their sections) that has no sections of its own (letter 44)
    // matched the level by position; it is one of those divisions.
    const signature = (node: XmlNode) =>
      `${node.name}|${divisionUnit(node).toLowerCase()}`;
    const keptKinds = new Set(
      collide
        ? matches.flatMap((m) =>
            m.between.filter(isNumberedDivision).map(signature)
          )
        : []
    );
    for (const match of matches) {
      if (match.positional && keptKinds.has(signature(match.node))) {
        const kindPath = [...path, divisionUnit(match.node)];
        register(
          builder,
          match.node,
          divisionUnit(match.node),
          match.n,
          kindPath
        );
        evaluateLevels(builder, match.node, [level], kindPath);
        continue;
      }
      let matchPath = path;
      // Also skipped: a wrapper that passes this level's own test (see
      // `collectMatches`), which the declaration does mention.
      const explicit = collide
        ? new Set<XmlNode>()
        : new Set([
            ...steppedThrough(match.steps, match.between),
            ...match.between.filter((node) =>
              containerTests(level).some((test) => matchesStep(node, test))
            ),
          ]);
      for (const between of match.between) {
        if (!isNumberedDivision(between)) {
          continue;
        }
        if (explicit.has(between)) {
          builder.skipped.add(between);
          continue;
        }
        const unit = divisionUnit(between);
        matchPath = [...matchPath, unit];
        if (!builder.containers.has(between)) {
          register(
            builder,
            between,
            unit,
            checkPresent(between.getAttr("n")),
            matchPath
          );
        }
      }
      matchPath = [...matchPath, unit];
      register(builder, match.node, unit, match.n, matchPath);
      evaluateLevels(builder, match.node, leafLevels, matchPath);
    }
  }

  if (points.length === 0 || !builder.slicePoints) {
    return;
  }
  for (const level of levels) {
    const markers = points.filter((p) => p.level === level);
    if (markers.length === 0) {
      continue;
    }
    if (containers.some((c) => c.level === level)) {
      // A union like `div3[@type='section'] | milestone[@unit='section']`
      // where both kinds occur in one parent: the containers win.
      builder.sink.warnings.push(
        `Ignoring ${markers.length} point markers of ${level.origin} beside containers of the same level`
      );
      continue;
    }
    const valueOf = new Map(markers.map((m) => [m.node, m.n]));
    const unit =
      level.unit ?? markers[0].node.getAttr("unit") ?? markers[0].node.name;
    const before = textWeight(context);
    const wrappers = sliceAtMarkers(
      context,
      new Set(valueOf.keys()),
      (marker, content) =>
        new XmlNode(
          "div",
          [
            ["type", "textpart"],
            ["subtype", unit],
            ["n", checkPresent(valueOf.get(marker))],
          ],
          content
        )
    );
    // Coverage: slicing only moves content and drops the markers.
    assert(
      textWeight(context) === before,
      () => `Text lost slicing at ${level.origin}`
    );
    const levelPath = [...path, unit];
    for (const wrapper of wrappers) {
      register(
        builder,
        wrapper,
        unit,
        checkPresent(wrapper.getAttr("n")),
        levelPath
      );
      evaluateLevels(builder, wrapper, level.children, levelPath);
    }
  }
}

/**
 * Rule D: without a `citeStructure`, the containers are the numbered
 * divisions observed in the tree (`div[@type='textpart'][@n]`,
 * `div1`..`div3[@n]`, other typed `div[@n]`), plus `seg[@type][@n]` and
 * `l[@n]` where the older headers declare that unit (`line` for `<l>`), each
 * named by its `@subtype` / `@type`.
 */
function evaluateTree(builder: SpineBuilder, context: XmlNode, path: string[]) {
  const isContainer = (node: XmlNode): boolean => {
    if (node.getAttr("n") === undefined) {
      return false;
    }
    const type = node.getAttr("type");
    switch (node.name) {
      case "div":
        return type !== undefined && !EDITION_DIV_TYPES.has(type);
      case "div1":
      case "div2":
      case "div3":
        return true;
      case "seg":
        return type !== undefined && builder.declared.has(type.toLowerCase());
      case "l":
        return builder.declared.has("line");
      default:
        return false;
    }
  };
  for (const child of context.children) {
    if (typeof child === "string" || OPAQUE_ELEMENTS.has(child.name)) {
      continue;
    }
    if (!isContainer(child)) {
      evaluateTree(builder, child, path);
      continue;
    }
    const unit = divisionUnit(child);
    const childPath = [...path, unit];
    register(builder, child, unit, checkPresent(child.getAttr("n")), childPath);
    evaluateTree(builder, child, childPath);
  }
}

/**
 * Checks that the scheme accounts for every numbered division of the body:
 * each is a section, or deliberately skipped. Anything else (an undeclared
 * subtype the tree puts somewhere no level reaches) would have its text cited
 * by the wrong id, or by none.
 */
function checkCoverage(builder: SpineBuilder, body: XmlNode) {
  const visit = (node: XmlNode) => {
    for (const child of node.children) {
      if (typeof child === "string" || OPAQUE_ELEMENTS.has(child.name)) {
        continue;
      }
      if (
        isNumberedDivision(child) &&
        !builder.containers.has(child) &&
        !builder.skipped.has(child)
      ) {
        const attrs = child.attrs
          .filter(([key]) => ["type", "subtype", "n"].includes(key))
          .map(([key, value]) => `${key}="${value}"`)
          .join(" ");
        builder.sink.errors.add(
          `Numbered division <${child.name} ${attrs}> is not a citation level`
        );
      }
      visit(child);
    }
  };
  visit(body);
}

function assertNoErrors(builder: SpineBuilder) {
  const errors = Array.from(builder.sink.errors);
  assert(
    errors.length === 0,
    () =>
      `Citation scheme does not fit the text: ${errors
        .slice(0, 3)
        .join("; ")}` +
      (errors.length > 3 ? `; and ${errors.length - 3} more` : "")
  );
}

/**
 * The dotted ids of the leaf sections under `body` (see
 * `CitationSpine.leafIds`), and each leaf's unit path.
 */
function findLeaves(
  builder: SpineBuilder,
  body: XmlNode
): { leafIds: Set<string>; leafPaths: string[][] } {
  const leafIds = new Set<string>();
  const leafPaths: string[][] = [];
  // Returns whether `node`'s subtree has a container.
  const visit = (node: XmlNode, id: string[]): boolean => {
    let found = false;
    for (const child of node.children) {
      if (typeof child === "string" || OPAQUE_ELEMENTS.has(child.name)) {
        continue;
      }
      const container = builder.containers.get(child);
      const childId = container === undefined ? id : [...id, container.n];
      const below = visit(child, childId);
      if (container !== undefined && !below) {
        leafIds.add(childId.join("."));
        leafPaths.push(checkPresent(builder.paths.get(child)));
      }
      found = found || below || container !== undefined;
    }
    return found;
  };
  visit(body, []);
  return { leafIds, leafPaths };
}

function pathKey(path: string[]): string {
  return JSON.stringify(path.map((unit) => unit.toLowerCase()));
}

/**
 * The unit path shared by the most leaf sections (ties go to the deeper
 * path, then the first; unit names compare case-insensitively, keeping the
 * first spelling). Almost every work has one leaf depth; where some passages
 * stop short of it (Livy's books that survive only as summaries) the scheme
 * follows the majority. See `checkLeafPaths` for what may differ.
 */
function dominantPath(paths: string[][]): string[] {
  const counts = new Map<string, { path: string[]; count: number }>();
  for (const path of paths) {
    const key = pathKey(path);
    const entry = counts.get(key) ?? { path, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  let best: { path: string[]; count: number } | undefined = undefined;
  for (const entry of counts.values()) {
    if (
      best === undefined ||
      entry.count > best.count ||
      (entry.count === best.count && entry.path.length > best.path.length)
    ) {
      best = entry;
    }
  }
  return best?.path ?? [];
}

/**
 * Checks that the leaf sections fit one scheme, `textParts`. The output
 * model has one citation depth per work (rows of `textParts.length` parts are
 * citable, pages are one level up), so it cannot represent:
 *
 * - leaves deeper than the scheme (one poem of a collection split into
 *   sections), whose rows would be mis-cited (also checked on the output,
 *   see `assertOutputInvariants`);
 * - two different unit paths of the same depth (`book.poem.line` beside
 *   `poem.section.line`, where a poem is encoded outside its book);
 * - the scheme's leaf unit at another depth (lines straight under a book in
 *   a work that otherwise cites `book.poem.line`), where a level is missing.
 *
 * Shallower leaves of another unit are allowed: Livy's books 46-142 (only
 * summaries survive) are real sections, if not yet paginated well (plan
 * Phase 4).
 */
function checkLeafPaths(
  builder: SpineBuilder,
  leafPaths: string[][],
  textParts: string[]
) {
  const schemeKey = pathKey(textParts);
  const leafUnit = textParts[textParts.length - 1]?.toLowerCase();
  const reported = new Set<string>();
  for (const path of leafPaths) {
    const key = pathKey(path);
    if (key === schemeKey || reported.has(key)) {
      continue;
    }
    reported.add(key);
    const shape = `${path.join(".")} (scheme ${textParts.join(".")})`;
    if (path.length > textParts.length) {
      builder.sink.errors.add(`Ragged citation depth: ${shape}`);
    } else if (path.length === textParts.length) {
      builder.sink.errors.add(`Mixed citation units: ${shape}`);
    } else if (path[path.length - 1].toLowerCase() === leafUnit) {
      builder.sink.errors.add(`Missing citation level: ${shape}`);
    }
  }
}

export interface BuildSpineOptions {
  /**
   * Whether to slice the body at point-level markers (default `true`). This
   * rewrites `body` in place; callers that only want the section ids of an
   * existing tree (the gallery) turn it off.
   */
  slicePoints?: boolean;
}

/**
 * Works out the citation scheme of `teiRoot` and the citable section of every
 * element of `body`. Point levels are sliced into containers in place (see
 * `BuildSpineOptions.slicePoints`).
 */
export function buildCitationSpine(
  teiRoot: XmlNode,
  body: XmlNode,
  options?: BuildSpineOptions
): CitationSpine {
  const builder: SpineBuilder = {
    containers: new Map(),
    paths: new Map(),
    skipped: new Set(),
    declared: new Set(declaredUnitNames(teiRoot)),
    sink: { errors: new Set(), warnings: [] },
    slicePoints: options?.slicePoints ?? true,
  };
  const levels = parseCiteStructure(teiRoot);
  if (levels === undefined) {
    evaluateTree(builder, body, []);
  } else {
    evaluateLevels(builder, body, toEvalLevels(levels), []);
  }
  checkCoverage(builder, body);
  const { leafIds, leafPaths } = findLeaves(builder, body);
  const textParts = dominantPath(leafPaths);
  checkLeafPaths(builder, leafPaths, textParts);
  assertNoErrors(builder);
  return {
    textParts,
    containers: builder.containers,
    leafIds,
    source: levels === undefined ? "tree" : "citeStructure",
    warnings: builder.sink.warnings,
  };
}
