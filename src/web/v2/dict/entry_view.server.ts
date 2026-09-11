import { EntryResult } from "@/common/dictionaries/dict_result";
import { xmlNodeToHtml } from "@/web/v2/dict/xml_to_html.server";
import {
  dedupeInflections,
  formatInflectionForm,
  renderInflectionTable,
} from "@/web/v2/dict/inflection_table.server";
import {
  collectXmlIds,
  dedupeSubsections,
  matchedAnchorIds,
  renderSubsectionNote,
} from "@/web/v2/dict/subsection_note.server";
import * as he from "he";

export { formatInflectionForm };

/**
 * Formats an EntryResult into semantic HTML with top tools bar / desktop side-rail.
 */
export function renderEntryResult(
  result: EntryResult,
  entryIndex: string | number = 0,
  entryNumber?: number,
  totalEntries?: number
): string {
  const safeId = String(entryIndex)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_");
  const entryAnchorId = result.outline.mainSection.sectionId;

  const hasOutline = Boolean(
    result.outline?.senses && result.outline.senses.length > 0
  );
  const hasInflections = Boolean(
    result.inflections && result.inflections.length > 0
  );
  const hasTools = hasOutline || hasInflections;
  const isMultiEntry = Boolean(totalEntries && totalEntries > 1);

  // Resolve which parts of this entry the query actually matched. Anchors are
  // resolved against the ids present in the entry, since not every subsection
  // id survives into the rendered markup.
  const subsectionGroups =
    result.subsections && result.subsections.length > 0
      ? dedupeSubsections(
          result.subsections,
          entryAnchorId,
          collectXmlIds(result.entry)
        )
      : [];
  const subsectionNoteHtml = renderSubsectionNote(subsectionGroups, {
    mainKey: result.outline?.mainKey,
  });

  const headword =
    result.outline?.mainLabel?.trim() ||
    result.outline?.mainKey?.trim() ||
    result.outline?.mainSection?.text?.trim() ||
    (isMultiEntry ? `Entry ${entryNumber ?? 1}` : "");

  let headwordBtnHtml = "";
  if (isMultiEntry || (hasTools && headword)) {
    headwordBtnHtml = `
      <a href="#${entryAnchorId}" class="v2-entry-headword" title="Permanent link to this entry">
        <span class="v2-entry-headword-text">${he.encode(headword)}</span>
        <span class="v2-entry-headword-anchor" aria-hidden="true">#</span>
      </a>
    `;
  }

  let toolsHtml = "";
  if (hasTools) {
    const groupName = `entry-tools-${safeId}`;
    const outlineItems = hasOutline
      ? result
          .outline!.senses!.map((sense) => {
            const indentLevel = Math.max(0, sense.level - 1);
            const indentStyle =
              indentLevel > 0
                ? ` style="margin-left: ${indentLevel * 0.75}rem;"`
                : "";
            const ordinalHtml = sense.ordinal
              ? `<strong class="v2-toc-ordinal">${he.encode(
                  sense.ordinal
                )}</strong> `
              : "";
            const textHtml = he.encode(sense.text.trim());
            return `<li${indentStyle}><a href="#${he.encode(
              sense.sectionId
            )}" class="v2-toc-link">${ordinalHtml}${textHtml}</a></li>`;
          })
          .join("")
      : "";

    const outlinePanelHtml = hasOutline
      ? `
        <details class="v2-tool-pane" name="${groupName}">
          <summary class="v2-tab-pill">Outline</summary>
          <div class="v2-tool-body">
            <ul class="v2-toc-list">
              ${outlineItems}
            </ul>
          </div>
        </details>
      `
      : "";

    const inflectionsPanelHtml = hasInflections
      ? `
        <details class="v2-tool-pane" name="${groupName}">
          <summary class="v2-tab-pill">Inflections</summary>
          <div class="v2-tool-body v2-inflections-body">${renderInflectionTable(
            dedupeInflections(result.inflections!)
          )}</div>
        </details>
      `
      : "";

    toolsHtml = `
      <header class="v2-entry-header has-tools">
        <div class="v2-entry-tools">
          <div class="v2-segmented-bar">
            ${headwordBtnHtml}
            ${outlinePanelHtml}
            ${inflectionsPanelHtml}
          </div>
        </div>
      </header>
    `;
  }

  const headerHtml = isMultiEntry
    ? `
      <header class="v2-entry-header">
        ${headwordBtnHtml}
      </header>
    `
    : "";

  const topBarHtml = hasTools ? toolsHtml : headerHtml;
  const entryHtml = xmlNodeToHtml(result.entry, {
    omitRootId: true,
    matchedSubsectionIds: matchedAnchorIds(subsectionGroups),
  });

  return `
    <article class="v2-entry ${
      hasTools ? "has-tools" : ""
    }" id="${entryAnchorId}">
      ${topBarHtml}${subsectionNoteHtml}
      <div class="v2-entry-content">
        ${entryHtml}
      </div>
    </article>
  `;
}
