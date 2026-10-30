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
 * - Cato's *De Agri Cultura* omits `<milestone unit="section" n="1"/>` in its
 *   prologue, and Historia Augusta's *Aurelianus* 20 repeats milestone 7 twice
 *   (`normalizeSectionMilestones`).
 * - Livy's *Periochae* are book divisions (`1s`, and `46`…`142` for the lost
 *   books) outside the `book.chapter.section` scheme (`collectPeriochae`).
 * - Cicero's single-book works put an editor's sigla or argumentum in a
 *   citable section (`normalizeCiceroChapterMilestones`).
 *
 * See `phase3_research_options.md` (Decision 3) for the census behind these.
 */

import { assert, checkPresent } from "@/common/assert";
import { sliceAtMarkers } from "@/common/library/cite_structure";
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

const DIVISION_NAMES = new Set(["div", "div1", "div2", "div3"]);

/**
 * Repairs two upstream `<milestone unit="section">` encoding bugs inside a
 * division before `buildCitationSpine` slices section milestones:
 *
 * 1. Cato's *De Agri Cultura* (`stoa0079.stoa001.perseus-lat1`, `<div1
 *    type="chapter" n="pr">`) omits `<milestone unit="section" n="1"/>` at the
 *    beginning of `<p>` before `<milestone unit="section" n="2"/>`, leaving
 *    `pr.1` ("Est interdum praestare...") as an uncitable shallow row. When a
 *    division's first section milestone is `n="2"` inside a `<p>` with
 *    non-whitespace text before that milestone, prepend
 *    `<milestone unit="section" n="1"/>` to that `<p>`.
 * 2. Historia Augusta's *Divus Aurelianus* (`phi2331.phi026.perseus-lat2`,
 *    chapter 20) repeats `<milestone unit="section" n="7"/>` twice in the
 *    sequence `1, 2, 3, 4, 5, 6, 7, 7` (a typo for `8`). When a division's
 *    section milestones run `1..k` and the next milestone repeats `k` (with
 *    either the end of the division or `k + 2` after it), renumber the
 *    duplicate to `k + 1`.
 */
export function normalizeSectionMilestones(root: XmlNode): void {
  const visitDivision = (div: XmlNode) => {
    const milestones: {
      node: XmlNode;
      pAncestor?: XmlNode;
      textBeforeInP: boolean;
    }[] = [];
    const scan = (
      node: XmlNode,
      currentP: XmlNode | undefined,
      state: { seenTextInP: boolean }
    ) => {
      for (const child of node.children) {
        if (typeof child === "string") {
          if (currentP !== undefined && child.trim().length > 0) {
            state.seenTextInP = true;
          }
          continue;
        }
        if (child.name === "note" || child.name === "#comment") {
          continue;
        }
        if (DIVISION_NAMES.has(child.name)) {
          visitDivision(child);
          continue;
        }
        if (child.name === "milestone" && child.getAttr("unit") === "section") {
          milestones.push({
            node: child,
            pAncestor: currentP,
            textBeforeInP: state.seenTextInP,
          });
          continue;
        }
        const enteringP = currentP === undefined && child.name === "p";
        const pState = enteringP ? { seenTextInP: false } : state;
        scan(child, currentP ?? (enteringP ? child : undefined), pState);
      }
    };
    scan(div, undefined, { seenTextInP: false });

    if (milestones.length === 0) {
      return;
    }
    const first = milestones[0];
    if (
      first.node.getAttr("n") === "2" &&
      first.pAncestor !== undefined &&
      first.textBeforeInP
    ) {
      first.pAncestor.children.unshift(
        new XmlNode(
          "milestone",
          [
            ["unit", "section"],
            ["n", "1"],
          ],
          []
        )
      );
    }

    for (let i = 1; i < milestones.length; i++) {
      const prevN = milestones[i - 1].node.getAttr("n");
      const currN = milestones[i].node.getAttr("n");
      if (prevN === undefined || currN !== prevN || !/^\d+$/.test(currN)) {
        continue;
      }
      const k = Number(currN);
      const prefixSequential = milestones
        .slice(0, i)
        .every((m, idx) => m.node.getAttr("n") === String(idx + 1));
      const nextN = milestones[i + 1]?.node.getAttr("n");
      if (
        prefixSequential &&
        k === i &&
        (nextN === undefined || nextN === String(k + 2))
      ) {
        setAttr(milestones[i].node, "n", String(k + 1));
      }
    }
  };
  visitDivision(root);
}

function startsWithSectionMilestoneInChapter(node: XmlNode): boolean {
  for (const child of node.children) {
    if (typeof child === "string") {
      if (child.trim().length > 0) {
        return false;
      }
      continue;
    }
    if (
      child.name === "head" ||
      child.name === "label" ||
      child.name === "docAuthor" ||
      child.name === "note" ||
      child.name === "pb" ||
      child.name === "#comment"
    ) {
      continue;
    }
    if (child.name === "milestone" && child.getAttr("unit") === "section") {
      return true;
    }
    return startsWithSectionMilestoneInChapter(child);
  }
  return false;
}

/**
 * Normalizes Pliny's *Naturalis Historia* (phi0978.phi001.perseus-lat2):
 * 1. Cleans `@n` attributes on all `<milestone unit="section"/>` (trimming whitespace
 *    and trailing `?`).
 * 2. Moves trailing textless section milestones across chapter boundaries into the
 *    opening of the next chapter, keeping apparatus notes attached to the right section.
 * 3. Prepends active section milestones to mid-section chapter openings.
 * 4. Disambiguates duplicate section numbers within a chapter with a `b` suffix.
 */
export function normalizePlinySectionMilestones(root: XmlNode): void {
  const books = (
    root.name === "div" && isTextpart(root, "book") ? [root] : []
  ).concat(
    root
      .findDescendants("div")
      .filter(
        (n) =>
          isTextpart(n, "book") &&
          n.children.some((c) => isTextpart(c, "chapter"))
      )
  );
  for (const book of books) {
    const secMilestones = book
      .findDescendants("milestone")
      .filter((n) => n.getAttr("unit") === "section");
    if (secMilestones.length === 0) {
      continue;
    }
    // 1. Clean @n
    for (const m of secMilestones) {
      const n = m.getAttr("n");
      if (n !== undefined) {
        setAttr(m, "n", n.trim().replace(/\?$/, ""));
      }
    }

    const chapters = book.children.filter((c): c is XmlNode =>
      isTextpart(c, "chapter")
    );
    // 2. Move trailing textless section milestones across chapter boundaries
    for (let i = 0; i < chapters.length - 1; i++) {
      const currCh = chapters[i];
      const nextCh = chapters[i + 1];
      const ps = currCh.findDescendants("p");
      if (ps.length === 0) continue;
      const lastP = ps[ps.length - 1];

      let msIndex = -1;
      for (let j = lastP.children.length - 1; j >= 0; j--) {
        const child = lastP.children[j];
        if (typeof child === "string") {
          if (child.trim().length > 0) {
            break;
          }
          continue;
        }
        if (
          child.name === "note" ||
          child.name === "pb" ||
          child.name === "#comment"
        ) {
          continue;
        }
        if (child.name === "milestone" && child.getAttr("unit") === "section") {
          msIndex = j;
        }
        break;
      }

      if (msIndex >= 0) {
        const movedChildren = lastP.children.splice(msIndex);
        let nextP = nextCh.findDescendants("p")[0];
        if (nextP === undefined) {
          nextP = new XmlNode("p", [], []);
          nextCh.children.push(nextP);
        }
        nextP.children.unshift(...movedChildren);
      }
    }

    // 3 & 4. Mid-section chapter starts and within-chapter dedup
    let prevActiveSecN: string | undefined = undefined;
    for (const ch of chapters) {
      const secMs = ch
        .findDescendants("milestone")
        .filter((n) => n.getAttr("unit") === "section");
      const paraMs = ch
        .findDescendants("milestone")
        .filter((n) => n.getAttr("unit") === "paragraph");
      if (secMs.length === 0 && paraMs.length > 1) {
        continue;
      }

      let firstP = ch.findDescendants("p")[0];
      if (firstP === undefined && ch.children.length > 0) {
        firstP = new XmlNode("p", [], []);
        ch.children.push(firstP);
      }

      const startsWithSec = startsWithSectionMilestoneInChapter(ch);
      if (
        !startsWithSec &&
        prevActiveSecN !== undefined &&
        firstP !== undefined
      ) {
        const synMs = new XmlNode(
          "milestone",
          [
            ["unit", "section"],
            ["n", prevActiveSecN],
          ],
          []
        );
        firstP.children.unshift(synMs);
        secMs.unshift(synMs);
      }

      const seenInCh = new Set<string>();
      for (const m of secMs) {
        let n = checkPresent(m.getAttr("n"));
        if (seenInCh.has(n)) {
          n = `${n}b`;
          setAttr(m, "n", n);
        }
        seenInCh.add(n);
        prevActiveSecN = n;
      }
    }
  }
}

/**
 * `@n`s of the sections in single-book Cicero works that hold an editor's
 * front matter rather than Cicero's text: the `SIGLA` of *Partitiones
 * Oratoriae*, *Brutus* and *Orator* (phi038, phi039, phi042), and the Teubner
 * *Argumentum* of *De Fato* (phi054, the only onboarded work with an `arg`
 * division; it summarises the dialogue and dates it `a. u. c. 710, a. ante
 * Chr. nat. 44`). `normalizeCiceroChapterMilestones` makes them unnumbered
 * `<div type="front" subtype="sigla|arg">`s, which `process_work.ts` marks
 * as editorial (`EDITORIAL_DIV_SUBTYPES`).
 */
const FRONT_MATTER_SECTIONS: ReadonlySet<string> = new Set(["sigla", "arg"]);

/**
 * Normalizes single-book Cicero speeches and treatises (phi0474.*):
 * When a single-book work is cited by section but has `<milestone unit="chapter" n="..."/>`
 * markers throughout the text, slices the edition `<div>` into `<div type="textpart" subtype="chapter">`
 * containers at those markers, promoting the work to `["chapter", "section"]`.
 *
 * A leading `sigla` or `arg` section (`FRONT_MATTER_SECTIONS`) becomes
 * uncitable front matter at the top of the first chapter, so it opens the
 * first page instead of being a page (and the first citation) of its own.
 */
export function normalizeCiceroChapterMilestones(root: XmlNode): void {
  const editionDiv =
    root.name === "div" &&
    (root.getAttr("type") === "edition" ||
      root.getAttr("type") === "translation")
      ? root
      : root
          .findDescendants("div")
          .find(
            (n) =>
              n.getAttr("type") === "edition" ||
              n.getAttr("type") === "translation"
          );
  if (editionDiv === undefined) {
    return;
  }

  const chMilestones = editionDiv
    .findDescendants("milestone")
    .filter(
      (n) => n.getAttr("unit") === "chapter" && n.getAttr("n") !== undefined
    );
  if (chMilestones.length === 0) {
    return;
  }
  const hasSectionDivs = editionDiv
    .findDescendants("div")
    .some((n) => isTextpart(n, "section"));
  if (!hasSectionDivs) {
    return;
  }
  const hasNumberedOuterDivs = editionDiv.children.some((c) => {
    if (typeof c === "string") return false;
    if (c.name !== "div") return false;
    const subtype = c.getAttr("subtype") ?? c.getAttr("type") ?? "";
    if (["book", "actio", "letter", "poem", "chapter"].includes(subtype)) {
      return true;
    }
    if (subtype === "speech" && c.getAttr("n") !== undefined) {
      return true;
    }
    return false;
  });
  if (hasNumberedOuterDivs) {
    return;
  }

  // Unwrap unnumbered grouping divs (e.g. In Pisonem phi027 fragments/speech wrappers)
  const newChildren: XmlChild[] = [];
  for (const child of editionDiv.children) {
    if (
      typeof child !== "string" &&
      child.name === "div" &&
      child.getAttr("n") === undefined &&
      (child.getAttr("subtype") === "fragments" ||
        child.getAttr("subtype") === "speech" ||
        child.getAttr("type") === "textpart")
    ) {
      newChildren.push(...child.children);
    } else {
      newChildren.push(child);
    }
  }
  editionDiv.children.splice(0, editionDiv.children.length, ...newChildren);

  // The editor's front matter (a list of sigla, De Fato's Teubner
  // argumentum) is not Cicero's text: it becomes uncitable front matter at
  // the top of the first chapter (see `FRONT_MATTER_SECTIONS`).
  const frontMatter: XmlNode[] = [];
  const withoutFrontMatter = editionDiv.children.filter((c) => {
    const n = typeof c === "string" ? undefined : c.getAttr("n");
    if (!isTextpart(c, "section") || !FRONT_MATTER_SECTIONS.has(n ?? "")) {
      return true;
    }
    frontMatter.push(
      new XmlNode(
        "div",
        [
          ["type", "front"],
          ["subtype", checkPresent(n)],
        ],
        c.children
      )
    );
    return false;
  });
  editionDiv.children.splice(
    0,
    editionDiv.children.length,
    ...withoutFrontMatter
  );

  // Handle back matter (fragments)
  let seenCh1 = false;
  let addedPreFrag = false;
  let addedPostFrag = false;

  for (const c of editionDiv.children) {
    if (typeof c === "string") continue;
    if (
      (c.name === "milestone" &&
        c.getAttr("unit") === "chapter" &&
        c.getAttr("n") === "1") ||
      c
        .findDescendants("milestone")
        .some((n) => n.getAttr("unit") === "chapter" && n.getAttr("n") === "1")
    ) {
      seenCh1 = true;
    }
    if (isTextpart(c, "section")) {
      const n = c.getAttr("n");
      if (n === "fragments") {
        setAttr(c, "n", "1");
        c.children.unshift(
          new XmlNode(
            "milestone",
            [
              ["unit", "chapter"],
              ["n", n],
            ],
            []
          )
        );
      } else if (!seenCh1 && n?.startsWith("fr") && !addedPreFrag) {
        c.children.unshift(
          new XmlNode(
            "milestone",
            [
              ["unit", "chapter"],
              ["n", "fragments"],
            ],
            []
          )
        );
        addedPreFrag = true;
      } else if (seenCh1 && n?.startsWith("fr") && !addedPostFrag) {
        c.children.unshift(
          new XmlNode(
            "milestone",
            [
              ["unit", "chapter"],
              ["n", "fragments"],
            ],
            []
          )
        );
        addedPostFrag = true;
      }
    }
  }

  const allChMs = editionDiv
    .findDescendants("milestone")
    .filter(
      (n) => n.getAttr("unit") === "chapter" && n.getAttr("n") !== undefined
    );
  assert(
    allChMs.length > 0 || frontMatter.length === 0,
    "No chapter to attach Cicero front matter to"
  );
  if (allChMs.length === 0) return;

  sliceAtMarkers(
    editionDiv,
    new Set(allChMs),
    (m, content) =>
      new XmlNode(
        "div",
        [
          ["type", "textpart"],
          ["subtype", "chapter"],
          ["n", checkPresent(m.getAttr("n"))],
        ],
        content
      )
  );
  if (frontMatter.length > 0) {
    // Opens the first page, above its first section, as Terence's front
    // matter does (`normalizeTerenceFrontMatter`).
    const firstChapter = checkPresent(
      editionDiv.children.find((c): c is XmlNode => isTextpart(c, "chapter")),
      "No chapter to attach Cicero front matter to"
    );
    firstChapter.children.unshift(...frontMatter);
  }
}

/**
 * Normalizes Seneca tragedies (phi1017.phi001-010.perseus-lat2):
 * Hoists any `<milestone unit="card" n="..."/>` nested inside `<sp>` (e.g. Phaedra
 * card 1115) out of `<sp>` by splitting the `<sp>` around the milestone, so every
 * card milestone in Seneca tragedies sits cleanly at the top level between speech blocks.
 */
export function hoistSenecaCardMilestones(root: XmlNode): void {
  const visit = (parent: XmlNode) => {
    for (const child of parent.children) {
      if (typeof child !== "string") {
        visit(child);
      }
    }
    const hasCardInSp = parent.children.some(
      (c) =>
        typeof c !== "string" &&
        c.name === "sp" &&
        c.children.some(
          (sc) =>
            typeof sc !== "string" &&
            sc.name === "milestone" &&
            sc.getAttr("unit") === "card"
        )
    );
    if (!hasCardInSp) return;

    const newChildren: XmlChild[] = [];
    for (const child of parent.children) {
      if (typeof child === "string" || child.name !== "sp") {
        newChildren.push(child);
        continue;
      }
      const cardIdx = child.children.findIndex(
        (sc) =>
          typeof sc !== "string" &&
          sc.name === "milestone" &&
          sc.getAttr("unit") === "card"
      );
      if (cardIdx === -1) {
        newChildren.push(child);
        continue;
      }
      const before = child.children.slice(0, cardIdx);
      const milestone = child.children[cardIdx];
      const after = child.children.slice(cardIdx + 1);

      if (before.length > 0) {
        newChildren.push(new XmlNode("sp", [...child.attrs], before));
      }
      newChildren.push(milestone);
      if (after.length > 0) {
        newChildren.push(new XmlNode("sp", [...child.attrs], after));
      }
    }
    parent.children.splice(0, parent.children.length, ...newChildren);
  };
  visit(root);
}

/** Applies every drama normalization to `body`, in place. */
/**
 * A verse line quoted inside a heading is part of the heading, not a citable
 * line of the poem: Ausonius' Eclogae 26 quotes the monostich it refutes as
 * `<head>… <lg><l n="1">UNGUES Mercurio …</l></lg> Hoc sic refellendum</head>`,
 * and its `n="1"` collides with the poem's own line 1. Drops `@n` from any
 * `<l>` inside a `<head>`, so the whole heading stays one row of the poem.
 */
export function unnumberHeadingLines(root: XmlNode): void {
  for (const head of root.findDescendants("head")) {
    for (const line of head.findDescendants("l")) {
      const idx = line.attrs.findIndex(([key]) => key === "n");
      if (idx !== -1) {
        line.attrs.splice(idx, 1);
      }
    }
  }
}

/** Whether `node` is a `<div type="textpart" subtype="…">` of `subtype`. */
function isTextpartOf(node: XmlChild, subtype: string): node is XmlNode {
  return (
    typeof node !== "string" &&
    node.name === "div" &&
    node.getAttr("type") === "textpart" &&
    node.getAttr("subtype") === subtype
  );
}

/**
 * Claudian's multi-book poems cite every book as `book.poem.line`, the
 * book's preface as poem `pr` and its main text as poem `1` (De Raptu
 * Proserpinae, In Rufinum). De Consulatu Stilichonis and In Eutropium give
 * poems only to the book that has a preface (Stil. 3, Eutr. 2); the other
 * books hold their lines directly, which mixes `book.line` with
 * `book.poem.line`. Where some sibling books have poems and others hold
 * numbered lines directly, wraps those books' content (after any leading
 * heading) in an implicit `<div type="textpart" subtype="poem" n="1">`.
 */
export function wrapPoemlessBooks(root: XmlNode): void {
  const parents = [root, ...root.findDescendants("div")];
  for (const parent of parents) {
    const books = parent.children.filter((c): c is XmlNode =>
      isTextpartOf(c, "book")
    );
    const hasPoems = (book: XmlNode) =>
      book.children.some((c) => isTextpartOf(c, "poem"));
    const holdsLines = (book: XmlNode) =>
      book.children.some(
        (c) =>
          typeof c !== "string" &&
          c.name === "l" &&
          c.getAttr("n") !== undefined
      );
    const poemless = books.filter((b) => !hasPoems(b) && holdsLines(b));
    if (poemless.length === 0 || !books.some(hasPoems)) {
      continue;
    }
    for (const book of poemless) {
      const isLeading = (c: XmlChild) =>
        typeof c === "string" ? c.trim() === "" : c.name === "head";
      let start = 0;
      while (start < book.children.length && isLeading(book.children[start])) {
        start++;
      }
      const content = book.children.slice(start);
      const poem = new XmlNode(
        "div",
        [
          ["type", "textpart"],
          ["subtype", "poem"],
          ["n", "1"],
        ],
        content
      );
      book.children.splice(start, content.length, poem);
    }
  }
}

/** The citation token of the group `collectPeriochae` builds. */
export const PERIOCHAE_GROUP = "per";

/** A book division holding only the summary of book N: Livy's `1s`. */
const SUMMARY_BOOK_N = /^(\d+)s$/;

/**
 * Livy's *Ab Urbe Condita* (phi0914.phi001) carries the *Periochae*, the
 * late-antique summaries of all 142 books, as book divisions: `n="1s"` …
 * `n="45s"` (each headed `periocha libri I`, next to the book it summarises)
 * and, for the lost books, `n="46"` … `n="142"`, which hold only their
 * periocha. Neither is cited `book.chapter.section`, so they are on no page.
 *
 * Moves them, in periocha order, into one new book-level group
 * `<div subtype="book" n="per">` at the end of the work, each as a chapter
 * numbered by its book (`per.1`, `per.49`, `per.142`): a shallow leaf, one
 * page per periocha. Detected from the markup: books whose `@n` is `Ns`, and,
 * only in a work that has those, numbered books past the last one with
 * chapters (the lost books). No-op everywhere else.
 */
export function collectPeriochae(root: XmlNode): void {
  const parents = [root, ...root.findDescendants("div")];
  const parentOf = new Map<XmlNode, XmlNode>();
  const books: XmlNode[] = [];
  for (const parent of parents) {
    for (const child of childNodes(parent)) {
      if (isTextpartOf(child, "book")) {
        parentOf.set(child, parent);
        books.push(child);
      }
    }
  }
  const summaries = books.filter((b) =>
    SUMMARY_BOOK_N.test(b.getAttr("n") ?? "")
  );
  if (summaries.length === 0) {
    return;
  }
  const hasChapters = (book: XmlNode) =>
    book.children.some((c) => isTextpartOf(c, "chapter"));
  const lastNarrated = Math.max(
    ...books
      .filter(hasChapters)
      .map((b) => b.getAttr("n") ?? "")
      .filter((n) => /^\d+$/.test(n))
      .map(Number)
  );
  const lost = books.filter((b) => {
    const n = b.getAttr("n") ?? "";
    return (
      Number.isFinite(lastNarrated) &&
      /^\d+$/.test(n) &&
      Number(n) > lastNarrated
    );
  });
  const periochae = [...summaries, ...lost].map((book): [number, XmlNode] => [
    Number.parseInt(checkPresent(book.getAttr("n")), 10),
    book,
  ]);
  periochae.sort(([a], [b]) => a - b);
  const numbers = periochae.map(([n]) => n);
  assert(
    new Set(numbers).size === numbers.length,
    () => `Duplicate periocha numbers: ${numbers}`
  );
  const lastBook = checkPresent(periochae[periochae.length - 1])[1];
  const lastParent = checkPresent(parentOf.get(lastBook));
  for (const [n, book] of periochae) {
    const parent = checkPresent(parentOf.get(book));
    parent.children.splice(parent.children.indexOf(book), 1);
    setAttr(book, "subtype", "chapter");
    setAttr(book, "n", String(n));
  }
  lastParent.children.push(
    new XmlNode(
      "div",
      [
        ["type", "textpart"],
        ["subtype", "book"],
        ["n", PERIOCHAE_GROUP],
      ],
      periochae.map(([, book]) => book)
    )
  );
}

export function normalizeDramaTei(body: XmlNode): void {
  normalizeNestedActs(body);
  normalizeTerenceFrontMatter(body);
  unnumberHeadingLines(body);
  wrapPoemlessBooks(body);
  collectPeriochae(body);
  numberContinuedLines(body);
  normalizeSplitLineParts(body);
  normalizeSectionMilestones(body);
  normalizePlinySectionMilestones(body);
  normalizeCiceroChapterMilestones(body);
  hoistSenecaCardMilestones(body);
}
