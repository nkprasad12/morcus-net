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

const LATIN_PART_NAMES = new Map<string, string>([
  ["book", "Liber"],
  ["chapter", "Caput"],
  ["section", "Sectio"],
  ["poem", "Carmen"],
  ["line", "Versus"],
  ["act", "Actus"],
  ["scene", "Scaena"],
]);

const ROMAN_NUMERALS: [number, string][] = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

function toRoman(num: number): string {
  if (num <= 0 || !Number.isInteger(num)) return String(num);
  let n = num;
  let result = "";
  for (const [val, roman] of ROMAN_NUMERALS) {
    while (n >= val) {
      result += roman;
      n -= val;
    }
  }
  return result;
}

function formatPartCoordinate(partName: string, value: string): string {
  const num = Number.parseInt(value, 10);
  const latinName =
    LATIN_PART_NAMES.get(partName.toLowerCase()) ??
    (partName.charAt(0).toUpperCase() + partName.slice(1));
  if (!Number.isNaN(num) && String(num) === value.trim()) {
    return `${latinName} ${toRoman(num)}`;
  }
  return `${latinName} ${value}`;
}

export function formatPageTitle(
  pageId: string[],
  textParts: string[]
): string {
  if (pageId.length === 0) return "Praefatio";
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
    return he.encode(node);
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
    return '<span class="v2-line-space" aria-hidden="true"></span>';
  }
  if (tag === "gap") {
    return '<span class="v2-reader-gap text-muted">[gap]</span>';
  }
  if (tag === "note" && noteId !== undefined) {
    return `<button type="button" class="v2-reader-note-ref" data-note-id="${he.encode(
      noteId
    )}" aria-label="Note ${he.encode(noteId)}"><sup>*</sup></button>`;
  }

  const childrenHtml = node.children.map(renderXmlNodeCleanHtml).join("");

  if (tag === "head" || isSectionHead) {
    return `<h3 class="v2-reader-subheading">${childrenHtml}</h3>`;
  }
  if (tag === "b") {
    return `<strong>${childrenHtml}</strong>`;
  }
  if (tag === "ul") {
    return `<ul class="v2-reader-list">${childrenHtml}</ul>`;
  }
  if (tag === "li") {
    return `<li>${childrenHtml}</li>`;
  }

  // Handle attributes and renditions
  const classes: string[] = [];
  if (isLine) classes.push("v2-reader-line");
  if (isBlock) classes.push("v2-reader-block");
  if (rend === "italic") classes.push("v2-italic");
  if (rend === "bold") classes.push("v2-bold");
  if (rend === "blockquote") classes.push("v2-blockquote");
  if (rend === "sup" || rend === "superscript") classes.push("v2-superscript");
  if (rend === "uppercase" || rend === "smallcaps") classes.push("v2-smallcaps");
  if (rend === "indent") classes.push("v2-indent");

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
      rendered.startsWith("<span class=\"v2-reader-line\"") ||
      rendered.startsWith("<h") ||
      rendered.startsWith("<span class=\"v2-line-space\"")
    ) {
      return rendered;
    }
    return `<span class="v2-reader-line">${rendered}</span>`;
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
  return `<p class="v2-reader-paragraph">${rendered}</p>`;
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
        <div class="v2-reader-gutter">
          <a href="#sec-${dotId}"
             class="v2-section-anchor"
             title="Citation § ${dotId} (Click to copy anchor)"
             aria-label="Section ${dotId}">
            <span class="v2-cite-prefix">${he.encode(prefix)}</span><span class="v2-cite-local">${he.encode(localId)}</span>
          </a>
        </div>
      `.trim();

      const sectionClass = isVerseWork
        ? "v2-reader-section v2-section-verse"
        : "v2-reader-section";

      singleSectionsHtml.push(`
        <div class="${sectionClass}" id="sec-${dotId}">
          ${gutterHtml}
          <div class="v2-reader-passage">
            ${latinHtml}
          </div>
        </div>
      `.trim());

      // Check for matching translation
      if (translationWork) {
        const transNode = translationRowsByDotId.get(dotId);
        const transHtml = transNode
          ? renderPassageContent(transNode, isVerseWork)
          : "";
        const translator =
          translationWork.info.translator ?? "Translation";

        parallelSectionsHtml.push(`
          <div class="${sectionClass} v2-section-parallel" id="sec-${dotId}">
            ${gutterHtml}
            <div class="v2-reader-parallel-content">
              <div class="v2-reader-passage-col v2-passage-latin">
                <div class="v2-reader-passage">${latinHtml}</div>
              </div>
              <div class="v2-reader-passage-col v2-passage-english">
                <span class="v2-reader-trans-author">${he.encode(translator)}:</span>
                <div class="v2-reader-passage">${transHtml}</div>
              </div>
            </div>
          </div>
        `.trim());
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
    textParts,
    paginationDepth,
    navTree: work.navTree,
    pages: v2Pages,
  };
}
