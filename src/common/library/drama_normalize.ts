/**
 * Structural normalizations of the Perseus drama editions (Plautus, Terence,
 * Seneca's tragedies), applied to a work's `<body>` before its citation spine
 * is built (`buildCitationSpine`). Each one repairs a specific, documented
 * upstream encoding problem that would otherwise fail the build or mis-cite
 * text; each is a no-op on works without that problem.
 *
 * - Plautus' *Rudens* nests its prologue as `act > act` instead of
 *   `act > scene` (`normalizeNestedActs`).
 * - Every Terence play opens with `<div subtype="act" n="front">`, an act with
 *   no scenes holding the cast list, Parry's 1857 English introductions and
 *   the Latin didascalia (`normalizeTerenceFrontMatter`).
 * - Seneca's *Octavia* leaves 22 final half-lines (`<l part="F">`) without
 *   `@n`, where every other play numbers them `185b` (`numberContinuedLines`).
 * - A few of Seneca's split lines carry the wrong `@part`s (Medea 170 is
 *   `F,F,F,F`) (`normalizeSplitLineParts`).
 *
 * See `phase3_research_options.md` (Decision 3) for the census behind these.
 */

import { assert, checkPresent } from "@/common/assert";
import { XmlNode, type XmlChild } from "@/common/xml/xml_node";

/** The `@type="textpart"` division with `@subtype` `subtype`. */
function isTextpart(node: XmlChild, subtype: string): node is XmlNode {
  return (
    typeof node !== "string" &&
    node.name === "div" &&
    node.getAttr("type") === "textpart" &&
    node.getAttr("subtype") === subtype
  );
}

function setAttr(node: XmlNode, name: string, value: string): void {
  const existing = node.attrs.find(([key]) => key === name);
  if (existing === undefined) {
    node.attrs.push([name, value]);
  } else {
    existing[1] = value;
  }
}

function childNodes(node: XmlNode): XmlNode[] {
  return node.children.filter((c): c is XmlNode => typeof c !== "string");
}

/**
 * An `act` division directly inside another `act` division is a scene:
 * Plautus' *Rudens* encodes its prologue as
 * `<div subtype="act" n="prologue"><div subtype="act" n="prologue">`, where
 * the `citeStructure` (and every other play) has `act > scene > line`.
 */
export function normalizeNestedActs(root: XmlNode): void {
  for (const child of childNodes(root)) {
    if (isTextpart(root, "act") && isTextpart(child, "act")) {
      setAttr(child, "subtype", "scene");
    }
    normalizeNestedActs(child);
  }
}

/** `@n` values of the `<l>`s in a Terence front-matter act. */
const FRONT_CAST = "cast";
const FRONT_PRODUCTION = "production";
const FRONT_SUBJECT = /^subject_\d+$/;

/** The first `scene` division at or below `node`, in document order. */
function firstScene(node: XmlNode): XmlNode | undefined {
  for (const child of childNodes(node)) {
    if (isTextpart(child, "scene")) {
      return child;
    }
    const found = firstScene(child);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/**
 * Rebuilds a Terence play's `<div subtype="act" n="front">` as non-citable
 * front matter at the start of the first scene (the prologue, or act 1).
 *
 * The front act has no scenes, so its `<l n="cast">`, `<l n="subject_1">`
 * and `<l n="production">` would be cited `front.cast` in an
 * `act.scene.line` scheme, which fails the build. Instead:
 *
 * - `<l n="subject_N">` are dropped: they are the English introductions of
 *   Parry's 1857 school edition, not Latin text.
 * - `<l n="cast">` (the dramatis personae `<listPerson>`) is unwrapped.
 * - `<l n="production">` (the ancient didascalia) becomes an `<ab>` block.
 *
 * What remains is wrapped in an unnumbered `<div type="front">`, which is
 * editorial matter (see `isEditorialNode` in `process_work.ts`), and moved
 * into the first scene, so it opens the play's first page.
 */
export function normalizeTerenceFrontMatter(root: XmlNode): void {
  for (const edition of [root, ...root.findDescendants("div")]) {
    const index = edition.children.findIndex(
      (c) => isTextpart(c, "act") && c.getAttr("n") === "front"
    );
    if (index === -1) {
      continue;
    }
    const front = XmlNode.assertIsNode(edition.children[index]);
    const content: XmlChild[] = [];
    for (const child of front.children) {
      if (typeof child === "string") {
        content.push(child);
        continue;
      }
      assert(
        child.name === "l",
        () => `Unexpected <${child.name}> in Terence front matter`
      );
      const n = checkPresent(child.getAttr("n"), "front-matter <l> without @n");
      if (FRONT_SUBJECT.test(n)) {
        continue;
      }
      if (n === FRONT_CAST) {
        content.push(...child.children);
      } else if (n === FRONT_PRODUCTION) {
        content.push(
          new XmlNode("ab", [["type", "didascalia"]], child.children)
        );
      } else {
        throw new Error(`Unexpected <l n="${n}"> in Terence front matter`);
      }
    }
    edition.children.splice(index, 1);
    const scene = checkPresent(
      edition.children
        .filter((c): c is XmlNode => isTextpart(c, "act"))
        .map(firstScene)
        .find((s) => s !== undefined),
      "No scene to attach Terence front matter to"
    );
    scene.children.unshift(new XmlNode("div", [["type", "front"]], content));
  }
}

/** `<l part>` values that continue a verse line begun by an earlier `<l>`. */
const CONTINUED_PARTS = new Set(["M", "F"]);

/**
 * The `@n` for the next segment of a split line after one numbered `n`:
 * `185` -> `185b`, `185b` -> `185c`, `28a` -> `28b`. `undefined` if `n` is
 * not a line number with an optional one-letter suffix.
 */
export function nextSegmentNumber(n: string): string | undefined {
  const match = /^(\d+)([a-y]?)$/.exec(n);
  if (match === null) {
    return undefined;
  }
  const [, base, suffix] = match;
  const next =
    suffix === "" ? "b" : String.fromCharCode(suffix.charCodeAt(0) + 1);
  return `${base}${next}`;
}

/**
 * Numbers the medial and final segments of split verse lines that upstream
 * left without `@n` (`<sp><l n="185" part="I">..</l></sp>
 * <sp><l part="F">..</l></sp>` in Seneca's *Octavia*), following the
 * convention of the other 35 plays: `185b`, then `185c`.
 *
 * Only an `<l part="M|F">` inside a `<sp>` is numbered, and only when the
 * last `<l>` before it is a numbered segment of the same split line
 * (`part="I"` or `"M"`). Anything else is left alone: an unnumbered `<l>`
 * belongs to its enclosing section (Rule E in `cite_structure.ts`).
 */
export function numberContinuedLines(root: XmlNode): void {
  /** The last `<l>` seen: its `@n` (if any) and `@part`. */
  let previous: { n?: string; part?: string } = {};
  const visit = (node: XmlNode, inSp: boolean) => {
    for (const child of childNodes(node)) {
      if (child.name !== "l") {
        visit(child, inSp || child.name === "sp");
        continue;
      }
      const n = child.getAttr("n");
      const part = child.getAttr("part");
      const next =
        n === undefined &&
        inSp &&
        CONTINUED_PARTS.has(part ?? "") &&
        (previous.part === "I" || previous.part === "M") &&
        previous.n !== undefined
          ? nextSegmentNumber(previous.n)
          : undefined;
      if (next !== undefined) {
        setAttr(child, "n", next);
      }
      previous = { n: next ?? n, part };
    }
  };
  visit(root, false);
}

/** `<l part>` values of the segments of a verse line split between speakers. */
const SPLIT_PARTS = new Set(["I", "M", "F"]);
/** Well-formed `@part` sequences of a split line (or of several sublines). */
const VALID_SPLIT_SEQUENCE = /^(?:IM*F|IM+)+$/;

/**
 * Repairs the `@part`s of a verse line split between speakers where upstream
 * mistagged them: Seneca's Medea 170 is `170`..`170d` all `part="F"`, Medea
 * 171 `I,I,I,F`, Thyestes 1102 `I,I` and 1103 `F,F`, Hercules Oetaeus 438
 * `I,F,F,F`. The reader steps each continuation across the page, so a
 * mistagged first part (or an `I` in the middle) would break the staircase.
 *
 * A group is a run of consecutive `<l>`s (in document order) whose `@n`
 * share their number (`170`, `170b`, `170c`). It is retagged `I, M.., F` only
 * when it has more than one line, every line has a split `@part`, and the
 * sequence is not already well formed: Plautus' sublines `626 I, 626b F,
 * 626a I, 626ab F` and lacunose `1155 I, 1155b M` stay, as do lines without
 * `@part` (Seneca's lyric `19`, `19b`).
 */
export function normalizeSplitLineParts(root: XmlNode): void {
  const lines = root.findDescendants("l");
  const baseOf = (line: XmlNode) =>
    /^(\d+)([a-z]*)$/.exec(line.getAttr("n") ?? "")?.[1];
  let start = 0;
  while (start < lines.length) {
    const base = baseOf(lines[start]);
    let end = start + 1;
    while (
      base !== undefined &&
      end < lines.length &&
      baseOf(lines[end]) === base
    ) {
      end++;
    }
    const group = lines.slice(start, end);
    start = end;
    const parts = group.map((line) => line.getAttr("part") ?? "");
    if (
      group.length < 2 ||
      !parts.every((part) => SPLIT_PARTS.has(part)) ||
      VALID_SPLIT_SEQUENCE.test(parts.join(""))
    ) {
      continue;
    }
    group.forEach((line, i) =>
      setAttr(line, "part", i === 0 ? "I" : i === group.length - 1 ? "F" : "M")
    );
  }
}

/** Applies every drama normalization to `body`, in place. */
export function normalizeDramaTei(body: XmlNode): void {
  normalizeNestedActs(body);
  normalizeTerenceFrontMatter(body);
  numberContinuedLines(body);
  normalizeSplitLineParts(body);
}
