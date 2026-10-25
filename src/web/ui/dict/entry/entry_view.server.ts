import { EntryResult } from "@/common/dictionaries/dict_result";
import { renderInflections } from "@/web/ui/dict/entry/inflection_table.server";
import {
  collectHtmlIds,
  dedupeSubsections,
  markSubsectionHits,
  matchedAnchorIds,
  renderSubsectionNote,
} from "@/web/ui/dict/entry/subsection_note.server";
import { renderCopyPillHtml } from "@/web/ui/core/widgets/icons.common";
import * as he from "he";

interface EntryRenderOptions {
  dictKey?: string;
  dictName?: string;
  dictAcronym?: string;
  dictLang?: string;
  isEmbedded?: boolean;
}

/**
 * Formats an EntryResult into semantic HTML with top tools bar / desktop side-rail.
 */
export function renderEntryResult(
  result: EntryResult,
  entryIndex: string | number = 0,
  entryNumber?: number,
  totalEntries?: number,
  options?: EntryRenderOptions
): string {
  const safeId = String(entryIndex)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_");
  const entryAnchorId = result.outline.mainSection.sectionId;

  const outlineSenses = result.outline?.senses?.length
    ? result.outline.senses
    : undefined;
  const inflections = result.inflections?.length
    ? result.inflections
    : undefined;
  const hasTools = outlineSenses !== undefined || inflections !== undefined;
  const isMultiEntry = Boolean(totalEntries && totalEntries > 1);

  // Resolve which parts of this entry the query actually matched. Anchors are
  // resolved against the ids present in the entry, since not every subsection
  // id survives into the rendered markup.
  const subsectionGroups =
    result.subsections && result.subsections.length > 0
      ? dedupeSubsections(
          result.subsections,
          entryAnchorId,
          collectHtmlIds(result.entry, entryAnchorId)
        )
      : [];
  const subsectionNoteHtml = renderSubsectionNote(subsectionGroups, {
    mainKey: result.outline?.mainKey,
  });

  const rawHeadword =
    result.outline?.mainLabel?.trim() ||
    result.outline?.mainKey?.trim() ||
    result.outline?.mainSection?.text?.trim() ||
    (isMultiEntry ? `Entry ${entryNumber ?? 1}` : "");
  const headword = rawHeadword.replace(/<[^>]+>/g, "").trim();

  // The headword itself is inert text. The permalink lives in its own pill so
  // that every entry gets an identical header composition, whether or not it
  // has an Outline pane beside it.
  const headwordHtml = headword
    ? `
      <span class="entry-headword">
        <span class="entry-headword-text">${he.escape(headword)}</span>
      </span>
    `
    : "";

  // A real anchor, so the permalink exists without JS (right-click -> copy link,
  // or plain navigation). With JS the click is intercepted and copied instead.
  const copyPillHtml = headword
    ? renderCopyPillHtml({
        href: `/dicts/id/${encodeURIComponent(entryAnchorId)}`,
        title: "Copy link to this article",
      })
    : "";

  const groupName = `entry-tools-${safeId}`;
  const outlineItems = outlineSenses
    ? outlineSenses
        .map((sense) => {
          const indentLevel = Math.max(0, sense.level - 1);
          const indentStyle =
            indentLevel > 0
              ? ` style="margin-left: ${indentLevel * 0.75}rem;"`
              : "";
          const ordinalHtml = sense.ordinal
            ? `<strong class="toc-ordinal">${he.escape(
                sense.ordinal
              )}</strong> `
            : "";
          const textHtml = he.escape(sense.text.trim());
          return `<li${indentStyle}><a href="#${he.escape(
            sense.sectionId
          )}" class="toc-link">${ordinalHtml}${textHtml}</a></li>`;
        })
        .join("")
    : "";

  const outlinePanelHtml = outlineSenses
    ? `
      <details class="tool-pane tool-outline" name="${groupName}">
        <summary class="tab-pill">Outline</summary>
        <div class="tool-body">
          <ul class="toc-list">
            ${outlineItems}
          </ul>
        </div>
      </details>
    `
    : "";

  const inflectionsHtml = inflections ? renderInflections(inflections) : "";

  const dictLang = options?.dictLang;
  const safeLang = dictLang && /^[a-z]{2,5}$/.test(dictLang) ? dictLang : "la";

  const dictBadgeHtml =
    options?.isEmbedded && options.dictAcronym
      ? `
        <span class="dict-badge dict-badge-${safeLang}" title="${he.escape(
          options.dictName || options.dictAcronym
        )}">${he.escape(options.dictAcronym)}</span>
      `
      : "";

  // Rendered for every entry that has a headword or embedded lexicon badge, so short
  // entries in lexica without outlines (Riddle & Arnold, Numerals) still get a header.
  // In embedded mode, even if an entry lacks an explicit headword, the lexicon badge
  // provides essential origin attribution (e.g. [LS], [OLD]) directly in the entry toolbar
  // since the parent dictionary card header is minimized into a hairline divider.
  // The empty-string guard leaves a malformed outline degrading to no header at all
  // rather than to an empty one.
  const hasSegmentedBar = Boolean(
    headword || (options?.isEmbedded && options.dictAcronym)
  );
  const segmentedBarHtml = hasSegmentedBar
    ? `
          <div class="segmented-bar${
            options?.isEmbedded && options.dictAcronym ? " has-badge" : ""
          }">
            ${dictBadgeHtml}
            ${headwordHtml}
            ${copyPillHtml}
            ${outlinePanelHtml}
          </div>
      `
    : "";

  const hasHeader = Boolean(
    segmentedBarHtml || inflectionsHtml || subsectionNoteHtml
  );
  const topBarHtml = hasHeader
    ? `
      <header class="entry-header has-tools">
        <div class="entry-tools">
          ${segmentedBarHtml}${inflectionsHtml}${subsectionNoteHtml}
        </div>
      </header>
    `
    : "";

  const entryHtml = markSubsectionHits(
    result.entry,
    matchedAnchorIds(subsectionGroups)
  );

  return `
    <article class="entry ${hasTools ? "has-tools" : ""}" id="${entryAnchorId}">
      ${topBarHtml}
      <div class="entry-content" data-tokenize-target="true">
        ${entryHtml}
      </div>
    </article>
  `;
}
