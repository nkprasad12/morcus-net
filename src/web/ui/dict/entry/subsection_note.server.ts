import {
  DictSubsectionResult,
  InflectionData,
} from "@/common/dictionaries/dict_result";
import { renderInflections } from "@/web/ui/dict/entry/inflection_table.server";
import { renderIconSvg } from "@/web/ui/core/widgets/icons.common";
import * as he from "he";

/** A subsection anchor that resolves to an element in the rendered entry. */
interface SubsectionTarget {
  /** The element id to link to, or undefined if nothing suitable exists. */
  anchor?: string;
  /**
   * Whether the anchor points at the entry's opening blurb rather than a sense
   * further down, which flips the direction of the jump affordance.
   */
  isBlurb: boolean;
}

/** Matches for one distinct headword within an entry. */
interface SubsectionGroup {
  name: string;
  targets: SubsectionTarget[];
  inflections: InflectionData[];
}

/** Collects every `id` attribute defined anywhere in a pre-rendered HTML entry. */
export function collectHtmlIds(html: string, rootId?: string): Set<string> {
  const ids = new Set<string>();
  if (rootId) {
    ids.add(rootId);
  }
  const regex = /\bid="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    ids.add(he.unescape(match[1]));
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

/**
 * Marks matched subsection anchor elements in pre-rendered entry HTML with
 * `subsection-hit` and `aria-current="location"`.
 */
export function markSubsectionHits(
  html: string,
  matchedIds: Set<string>
): string {
  if (matchedIds.size === 0) {
    return html;
  }
  let result = html;
  for (const id of matchedIds) {
    const needle = ` id="${he.escape(id)}"`;
    const idx = result.indexOf(needle);
    if (idx === -1) {
      continue;
    }
    const afterId = idx + needle.length;
    if (result.startsWith(' class="', afterId)) {
      const classStart = afterId + 8;
      const classEnd = result.indexOf('"', classStart);
      if (classEnd !== -1) {
        const existingClass = result.slice(classStart, classEnd);
        const nextClass = existingClass
          ? `${existingClass} subsection-hit`
          : "subsection-hit";
        result =
          result.slice(0, idx) +
          `${needle} class="${nextClass}" aria-current="location"` +
          result.slice(classEnd + 1);
      }
    } else {
      result =
        result.slice(0, idx) +
        `${needle} class="subsection-hit" aria-current="location"` +
        result.slice(afterId);
    }
  }
  return result;
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
  const inflections = renderInflections(
    relevant.flatMap((group) => group.inflections)
  );

  return `
    <aside class="subsection-note" aria-label="Matched sections in this entry">
      <p class="subsection-note-lead">
        <span class="subsection-note-label">Matched</span>
        ${joined}
        <span class="subsection-note-tail">inside this entry.</span>
      </p>${inflections}
    </aside>`;
}
