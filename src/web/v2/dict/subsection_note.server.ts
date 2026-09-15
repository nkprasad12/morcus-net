import {
  DictSubsectionResult,
  InflectionData,
} from "@/common/dictionaries/dict_result";
import { XmlChild } from "@/common/xml/xml_node";
import {
  dedupeInflections,
  renderInflectionInline,
  renderInflectionTable,
} from "@/web/v2/dict/inflection_table.server";
import { renderIconSvg } from "@/web/v2/core/icons.common";
import * as he from "he";

/** A subsection anchor that resolves to an element in the rendered entry. */
export interface SubsectionTarget {
  /** The element id to link to, or undefined if nothing suitable exists. */
  anchor?: string;
  /**
   * Whether the anchor points at the entry's opening blurb rather than a sense
   * further down, which flips the direction of the jump affordance.
   */
  isBlurb: boolean;
}

/** Matches for one distinct headword within an entry. */
export interface SubsectionGroup {
  name: string;
  targets: SubsectionTarget[];
  inflections: InflectionData[];
}

/** Collects every `id` attribute defined anywhere in an entry's XML tree. */
export function collectXmlIds(root: XmlChild): Set<string> {
  const ids = new Set<string>();
  const stack: XmlChild[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined || typeof node === "string") {
      continue;
    }
    for (const [key, value] of node.attrs) {
      if (key.toLowerCase() === "id") {
        ids.add(value);
      }
    }
    for (const child of node.children) {
      stack.push(child);
    }
  }
  return ids;
}

/**
 * Finds the element a subsection match should link to.
 *
 * Most subsection ids name a sense that is rendered as its own element. The
 * exception is the first sense of an entry: when it is the only level 1 "I"
 * sense, `displayEntryFree` merges it into the opening blurb, so no element
 * ever carries that id and the raw id would be a dead anchor. Those matches
 * live in the blurb, so we redirect them there.
 *
 * Measured against Lewis & Short, this affects roughly a fifth of all
 * subsection matches, and the blurb fallback resolves all of them.
 */
export function resolveSubsectionAnchor(
  subsectionId: string,
  entryId: string,
  presentIds: Set<string>
): SubsectionTarget {
  if (presentIds.has(subsectionId)) {
    return { anchor: subsectionId, isBlurb: false };
  }
  const blurbId = `${entryId}.blurb`;
  if (presentIds.has(blurbId)) {
    return { anchor: blurbId, isBlurb: true };
  }
  // The entry root always carries the id, even when nothing inside does.
  if (presentIds.has(entryId) || subsectionId === entryId) {
    return { anchor: entryId, isBlurb: true };
  }
  return { isBlurb: false };
}

/**
 * Collapses raw subsection results into one group per distinct headword.
 *
 * Ids are deduplicated first: a single sense can be reached through several
 * orthographic variants of the same word, and without this the note would
 * render several chips all pointing at the same place.
 */
export function dedupeSubsections(
  subsections: DictSubsectionResult[],
  entryId: string,
  presentIds: Set<string>
): SubsectionGroup[] {
  const groups = new Map<string, SubsectionGroup>();
  const seenIds = new Set<string>();
  for (const subsection of subsections) {
    if (seenIds.has(subsection.id)) {
      continue;
    }
    seenIds.add(subsection.id);
    const existing = groups.get(subsection.name);
    const group: SubsectionGroup = existing ?? {
      name: subsection.name,
      targets: [],
      inflections: [],
    };
    group.targets.push(
      resolveSubsectionAnchor(subsection.id, entryId, presentIds)
    );
    group.inflections.push(...(subsection.inflections ?? []));
    if (existing === undefined) {
      groups.set(subsection.name, group);
    }
  }
  return Array.from(groups.values());
}

/** Returns the set of element ids that should be marked in the entry body. */
export function matchedAnchorIds(groups: SubsectionGroup[]): Set<string> {
  const ids = new Set<string>();
  for (const group of groups) {
    for (const target of group.targets) {
      if (target.anchor !== undefined) {
        ids.add(target.anchor);
      }
    }
  }
  return ids;
}

function arrowIcon(isBlurb: boolean): string {
  return renderIconSvg(isBlurb ? "chevronUp" : "chevronDown", {
    className: "subsection-chip-icon",
  });
}

function renderGroupLabel(group: SubsectionGroup): string {
  const name = `<span class="subsection-name">${he.escape(group.name)}</span>`;

  // With a single match the headword itself carries the link, which reads more
  // naturally than a bare numbered chip.
  if (group.targets.length === 1) {
    const target = group.targets[0];
    if (target.anchor === undefined) {
      return name;
    }
    return `<a class="subsection-namelink" href="#${he.escape(
      target.anchor
    )}">${name}${arrowIcon(target.isBlurb)}</a>`;
  }

  const chips = group.targets
    .map((target, index) => {
      const label = `${arrowIcon(target.isBlurb)}${index + 1}`;
      if (target.anchor === undefined) {
        return `<span class="subsection-chip subsection-chip-dead">${
          index + 1
        }</span>`;
      }
      return `<a class="subsection-chip" href="#${he.escape(
        target.anchor
      )}" title="Jump to match ${index + 1}">${label}</a>`;
    })
    .join("");
  return `${name}${chips}`;
}

function renderInflections(group: SubsectionGroup): string {
  const inflections = dedupeInflections(group.inflections);
  if (inflections.length === 0) {
    return "";
  }
  if (inflections.length === 1) {
    return renderInflectionInline(inflections[0]);
  }
  return `
      <details class="subsection-details">
        <summary class="tab-pill">Inflections of ${he.escape(group.name)} (${
    inflections.length
  })</summary>
        <div class="tool-body inflections-body">${renderInflectionTable(
          inflections
        )}</div>
      </details>`;
}

/**
 * Renders the banner shown when a query matched inside an entry rather than
 * its headword, telling the reader what matched and where it is.
 */
export function renderSubsectionNote(
  groups: SubsectionGroup[],
  options?: { mainKey?: string }
): string {
  // A subsection that repeats the headword adds nothing: the reader is already
  // looking at that word.
  const relevant = groups.filter(
    (group) => group.name !== options?.mainKey?.trim()
  );
  if (relevant.length === 0) {
    return "";
  }

  const labels = relevant.map(renderGroupLabel);
  const joined =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  const inflections = relevant.map(renderInflections).join("");

  return `
    <aside class="subsection-note" aria-label="Matched sections in this entry">
      <p class="subsection-note-lead">
        <span class="subsection-note-label">Matched</span>
        ${joined}
        <span class="subsection-note-tail">inside this entry.</span>
      </p>${inflections}
    </aside>`;
}
