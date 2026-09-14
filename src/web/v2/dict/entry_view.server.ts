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
import { renderIconSvg } from "@/web/v2/core/icons.common";
import * as he from "he";

export { formatInflectionForm };

export interface EntryRenderOptions {
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

  // Bind the narrowed arrays rather than booleans. `Boolean(...)` discards the
  // type information, which is precisely what the non-null assertions at the
  // use sites below used to restore by hand.
  const outlineSenses = result.outline?.senses?.length
    ? result.outline.senses
    : undefined;
  const inflections = result.inflections?.length
    ? result.inflections
    : undefined;
  const hasTools = outlineSenses !== undefined || inflections !== undefined;
  const isMultiEntry = Boolean(totalEntries && totalEntries > 1);

  // Every `id` defined anywhere in this entry's XML. Used both to resolve
  // subsection anchors and to decide whether a sense bullet needs to carry its
  // own id so its `#senseid` link has something to land on.
  const existingIds = collectXmlIds(result.entry);

  // Resolve which parts of this entry the query actually matched. Anchors are
  // resolved against the ids present in the entry, since not every subsection
  // id survives into the rendered markup.
  const subsectionGroups =
    result.subsections && result.subsections.length > 0
      ? dedupeSubsections(result.subsections, entryAnchorId, existingIds)
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
  // has Outline / Inflections panes beside it.
  const headwordHtml = headword
    ? `
      <span class="v2-entry-headword">
        <span class="v2-entry-headword-text">${he.escape(headword)}</span>
      </span>
    `
    : "";

  // A real anchor, so the permalink exists without JS (right-click -> copy link,
  // or plain navigation). With JS the click is intercepted and copied instead.
  const copyPillHtml = headword
    ? `
      <a href="/v2/dicts/id/${encodeURIComponent(entryAnchorId)}"
         class="v2-tab-pill v2-copy-pill"
         title="Copy link to this article">
        <span class="v2-copy-pill-icon" aria-hidden="true">${renderIconSvg(
          "link",
          { className: "v2-copy-pill-glyph v2-copy-pill-link" }
        )}${renderIconSvg("check", {
        className: "v2-copy-pill-glyph v2-copy-pill-check",
      })}</span>
        <span class="v2-copy-pill-long">Copy link</span>
        <span class="v2-copy-pill-short">Link</span>
      </a>
    `
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
            ? `<strong class="v2-toc-ordinal">${he.escape(
                sense.ordinal
              )}</strong> `
            : "";
          const textHtml = he.escape(sense.text.trim());
          return `<li${indentStyle}><a href="#${he.escape(
            sense.sectionId
          )}" class="v2-toc-link">${ordinalHtml}${textHtml}</a></li>`;
        })
        .join("")
    : "";

  const outlinePanelHtml = outlineSenses
    ? `
      <details class="v2-tool-pane v2-tool-outline" name="${groupName}">
        <summary class="v2-tab-pill">Outline</summary>
        <div class="v2-tool-body">
          <ul class="v2-toc-list">
            ${outlineItems}
          </ul>
        </div>
      </details>
    `
    : "";

  const inflectionsPanelHtml = inflections
    ? `
      <details class="v2-tool-pane" name="${groupName}">
        <summary class="v2-tab-pill">Inflections</summary>
        <div class="v2-tool-body v2-inflections-body">${renderInflectionTable(
          dedupeInflections(inflections)
        )}</div>
      </details>
    `
    : "";

  const dictLang = options?.dictLang;
  const safeLang = dictLang && /^[a-z]{2,5}$/.test(dictLang) ? dictLang : "la";

  const dictBadgeHtml =
    options?.isEmbedded && options.dictAcronym
      ? `
        <span class="v2-dict-badge v2-dict-badge-${safeLang}" title="${he.escape(
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
  const hasHeader = Boolean(
    headword || (options?.isEmbedded && options.dictAcronym)
  );
  const topBarHtml = hasHeader
    ? `
      <header class="v2-entry-header has-tools">
        <div class="v2-entry-tools">
          <div class="v2-segmented-bar${
            options?.isEmbedded && options.dictAcronym ? " has-badge" : ""
          }">
            ${dictBadgeHtml}
            ${headwordHtml}
            ${copyPillHtml}
            ${outlinePanelHtml}
            ${inflectionsPanelHtml}
          </div>
        </div>
      </header>
    `
    : "";

  const entryHtml = xmlNodeToHtml(result.entry, {
    omitRootId: true,
    matchedSubsectionIds: matchedAnchorIds(subsectionGroups),
    existingIds,
  });

  return `
    <article class="v2-entry ${
      hasTools ? "has-tools" : ""
    }" id="${entryAnchorId}">
      ${topBarHtml}${subsectionNoteHtml}
      <div class="v2-entry-content" data-tokenize-target="true">
        ${entryHtml}
      </div>
    </article>
  `;
}
