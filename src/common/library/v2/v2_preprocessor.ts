import type {
  LibraryWorkMetadata,
  ProcessedWork2,
  ProcessedWorkContentNodeType,
} from "@/common/library/library_types";
import type {
  V2PreprocessedPage,
  V2PreprocessedWork,
} from "@/common/library/v2/v2_types";
import { XmlNode } from "@/common/xml/xml_node";
import * as he from "he";

function formatPartCoordinate(partName: string, value: string): string {
  const capitalized = partName.charAt(0).toUpperCase() + partName.slice(1);
  return `${capitalized} ${value}`;
}

export function formatPageTitle(pageId: string[], textParts: string[]): string {
  if (pageId.length === 0) return "Preface";
  const parts: string[] = [];
  for (let i = 0; i < pageId.length; i++) {
    const partName = textParts[i] ?? `Level ${i + 1}`;
    parts.push(formatPartCoordinate(partName, pageId[i]));
  }
  return parts.join(", ");
}

function getSectionLocalId(secId: string[], pageId: string[]): string {
  const localTokens = secId.slice(pageId.length);
  return localTokens.length > 0
    ? localTokens.join(".")
    : secId[secId.length - 1] ?? "";
}

function getSectionPrefix(secId: string[], pageId: string[]): string {
  const full = secId.join(".");
  const local = getSectionLocalId(secId, pageId);
  return full.slice(0, full.length - local.length);
}

function renderXmlNodeCleanHtml(
  node: XmlNode<ProcessedWorkContentNodeType> | string
): string {
  if (typeof node === "string") {
    return he.escape(node);
  }

  const tag = node.name;
  const rend = node.getAttr("rend");
  const isLine = node.getAttr("l") === "1";
  const isBlock = node.getAttr("block") === "1";
  const isSectionHead = node.getAttr("sectionHead") === "1";
  const noteId = node.getAttr("noteId");

  if (tag === "br") {
    return "<br>";
  }
  if (tag === "space") {
    return '<span class="line-space" aria-hidden="true"></span>';
  }
  if (tag === "gap") {
    return '<span class="reader-gap text-muted">[gap]</span>';
  }
  if (tag === "note" && noteId !== undefined) {
    return `<button type="button" class="reader-note-ref" data-note-id="${he.escape(
      noteId
    )}" aria-label="Note ${he.escape(noteId)}"><sup>*</sup></button>`;
  }

  const childrenHtml = node.children.map(renderXmlNodeCleanHtml).join("");

  if (tag === "head" || isSectionHead) {
    return `<h3 class="reader-subheading">${childrenHtml}</h3>`;
  }
  if (tag === "b") {
    return `<strong>${childrenHtml}</strong>`;
  }
  if (tag === "ul") {
    return `<ul class="reader-list">${childrenHtml}</ul>`;
  }
  if (tag === "li") {
    return `<li>${childrenHtml}</li>`;
  }

  // Handle attributes and renditions
  const classes: string[] = [];
  if (isLine) classes.push("reader-line");
  if (isBlock) classes.push("reader-block");
  if (rend === "italic") classes.push("italic");
  if (rend === "bold") classes.push("bold");
  if (rend === "blockquote") classes.push("blockquote");
  if (rend === "sup" || rend === "superscript") classes.push("superscript");
  if (rend === "uppercase" || rend === "smallcaps") classes.push("smallcaps");
  if (rend === "indent") classes.push("indent");

  const classAttr = classes.length > 0 ? ` class="${classes.join(" ")}"` : "";

  if (rend === "blockquote") {
    return `<blockquote${classAttr}>${childrenHtml}</blockquote>`;
  }
  if (isLine) {
    return `<span${classAttr}>${childrenHtml}</span>`;
  }
  if (isBlock) {
    return `<p${classAttr}>${childrenHtml}</p>`;
  }
  if (classes.length === 0) {
    return childrenHtml;
  }

  return `<span${classAttr}>${childrenHtml}</span>`;
}

function renderPassageContent(
  node: XmlNode<ProcessedWorkContentNodeType>,
  isVerseWork: boolean
): string {
  const rendered = renderXmlNodeCleanHtml(node);
  if (isVerseWork) {
    if (
      rendered.startsWith('<span class="reader-line"') ||
      rendered.startsWith("<h") ||
      rendered.startsWith('<span class="line-space"')
    ) {
      return rendered;
    }
    return `<span class="reader-line">${rendered}</span>`;
  }
  // For prose, if it's not already wrapped in a paragraph or block, wrap in paragraph
  if (
    rendered.startsWith("<p") ||
    rendered.startsWith("<h") ||
    rendered.startsWith("<blockquote") ||
    rendered.startsWith("<ul")
  ) {
    return rendered;
  }
  return `<p class="reader-paragraph">${rendered}</p>`;
}

export function preprocessWorkToV2(
  work: ProcessedWork2,
  metadata: LibraryWorkMetadata,
  translationWork?: ProcessedWork2
): V2PreprocessedWork {
  const textParts = work.textParts;
  const isVerseWork =
    textParts.length > 0 &&
    textParts[textParts.length - 1].toLowerCase() === "line";
  const paginationDepth =
    work.pages[0]?.id.length ??
    (textParts.length > 1 ? textParts.length - 1 : 1);

  // Index translation rows if available
  const translationRowsByDotId = new Map<
    string,
    XmlNode<ProcessedWorkContentNodeType>
  >();
  if (translationWork) {
    for (const [tId, tNode] of translationWork.rows) {
      translationRowsByDotId.set(tId.join("."), tNode);
    }
  }

  const v2Pages: V2PreprocessedPage[] = [];

  for (const page of work.pages) {
    const pageId = page.id;
    const pageTitle = formatPageTitle(pageId, textParts);
    const [startIdx, endIdx] = page.rows;

    const singleSectionsHtml: string[] = [];
    const parallelSectionsHtml: string[] = [];
    const citationIds: string[] = [];

    for (let j = startIdx; j < endIdx; j++) {
      const [secId, node] = work.rows[j];
      const dotId = secId.join(".");
      const localId = getSectionLocalId(secId, pageId);
      const prefix = getSectionPrefix(secId, pageId);
      const latinHtml = renderPassageContent(node, isVerseWork);

      citationIds.push(dotId);

      const gutterHtml = `
        <div class="reader-gutter">
          <a href="#sec-${dotId}"
             class="section-anchor"
             title="Citation § ${dotId} (Click to copy anchor)"
             aria-label="Section ${dotId}">
            <span class="cite-prefix">${he.escape(
              prefix
            )}</span><span class="cite-local">${he.escape(localId)}</span>
          </a>
        </div>
      `.trim();

      const sectionClass = isVerseWork
        ? "reader-section section-verse"
        : "reader-section";

      singleSectionsHtml.push(
        `
        <div class="${sectionClass}" id="sec-${dotId}">
          ${gutterHtml}
          <div class="reader-passage" data-tokenize-target="true">
            ${latinHtml}
          </div>
        </div>
      `.trim()
      );

      // Check for matching translation
      if (translationWork) {
        const transNode = translationRowsByDotId.get(dotId);
        const transHtml = transNode
          ? renderPassageContent(transNode, isVerseWork)
          : "";
        const translator = translationWork.info.translator ?? "Translation";

        parallelSectionsHtml.push(
          `
          <div class="${sectionClass} section-parallel" id="sec-${dotId}">
            ${gutterHtml}
            <div class="reader-parallel-content">
              <div class="reader-passage-col passage-latin">
                <div class="reader-passage" data-tokenize-target="true">${latinHtml}</div>
              </div>
              <div class="reader-passage-col passage-english">
                <span class="reader-trans-author">${he.escape(
                  translator
                )}:</span>
                <div class="reader-passage">${transHtml}</div>
              </div>
            </div>
          </div>
        `.trim()
        );
      }
    }

    const citationRange: [string, string] = [
      citationIds[0] ?? "",
      citationIds[citationIds.length - 1] ?? "",
    ];

    v2Pages.push({
      id: pageId.join("."),
      title: pageTitle,
      sectionCount: citationIds.length,
      citationRange,
      singleHtml: singleSectionsHtml.join("\n"),
      parallelHtml:
        translationWork && parallelSectionsHtml.length > 0
          ? parallelSectionsHtml.join("\n")
          : undefined,
    });
  }

  return {
    id: work.info.workId,
    title: work.info.title,
    shortTitle: work.info.shortTitle,
    author: work.info.author,
    urlAuthor: metadata.urlAuthor,
    urlName: metadata.urlName,
    attribution: work.info.attribution,
    hasMacra: work.info.attribution === "hypotactic",
    hasTranslation: translationWork !== undefined,
    translator: translationWork?.info.translator,
    editor: work.info.editor,
    ctsUrn: work.info.workId.startsWith("urn:cts:")
      ? work.info.workId
      : undefined,
    license:
      work.info.attribution === "perseus"
        ? "Creative Commons Attribution-ShareAlike 3.0"
        : work.info.attribution === "hypotactic"
        ? "Hypotactic Latin Metron (Public / Educational)"
        : "Public Domain",
    sourceRepo: work.info.sourceRef?.[0],
    textParts,
    paginationDepth,
    navTree: work.navTree,
    pages: v2Pages,
  };
}
