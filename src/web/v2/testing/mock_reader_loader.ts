import type {
  V2PreprocessedPage,
  V2PreprocessedWork,
} from "@/common/library/v2/v2_types";
import type { V2WorkSummary } from "@/common/library/v2/v2_library_builder";

export const MOCK_CAESAR_WORK: V2PreprocessedWork = {
  id: "phi0448.phi001.perseus-lat2",
  title: "De bello Gallico",
  shortTitle: "Bellum Gallicum",
  author: "Julius Caesar",
  urlAuthor: "caesar",
  urlName: "de_bello_gallico",
  attribution: "perseus",
  hasMacra: false,
  hasTranslation: false,
  editor: "T. Rice Holmes (Clarendon Press, 1914)",
  textParts: ["book", "chapter", "section"],
  paginationDepth: 2,
  navTree: {
    id: [],
    children: [
      {
        id: ["1"],
        children: [
          { id: ["1", "1"], children: [] },
          { id: ["1", "2"], children: [] },
        ],
      },
    ],
  },
  pages: [
    {
      id: "1.1",
      title: "Liber I, Caput I",
      sectionCount: 4,
      citationRange: ["1.1.1", "1.1.4"],
      singleHtml: `
        <div class="reader-section" id="sec-1.1.1">
          <div class="reader-gutter">
            <a href="#sec-1.1.1" class="section-anchor" title="Citation § 1.1.1 (Click to copy anchor)" aria-label="Section 1.1.1">
              <span class="cite-prefix">1.1.</span><span class="cite-local">1</span>
            </a>
          </div>
          <div class="reader-passage" data-tokenize-target="true">
            Gallia est omnis divisa in partes tres, quarum unam incolunt Belgae, aliam Aquitani, tertiam qui ipsorum lingua Celtae, nostra Galli appellantur.
          </div>
        </div>
        <div class="reader-section" id="sec-1.1.2">
          <div class="reader-gutter">
            <a href="#sec-1.1.2" class="section-anchor" title="Citation § 1.1.2 (Click to copy anchor)" aria-label="Section 1.1.2">
              <span class="cite-prefix">1.1.</span><span class="cite-local">2</span>
            </a>
          </div>
          <div class="reader-passage" data-tokenize-target="true">
            Hi omnes lingua, institutis, legibus inter se differunt.
          </div>
        </div>
        <div class="reader-section" id="sec-1.1.3">
          <div class="reader-gutter">
            <a href="#sec-1.1.3" class="section-anchor" title="Citation § 1.1.3 (Click to copy anchor)" aria-label="Section 1.1.3">
              <span class="cite-prefix">1.1.</span><span class="cite-local">3</span>
            </a>
          </div>
          <div class="reader-passage" data-tokenize-target="true">
            Horum omnium fortissimi sunt Belgae.
          </div>
        </div>
        <div class="reader-section" id="sec-1.1.4">
          <div class="reader-gutter">
            <a href="#sec-1.1.4" class="section-anchor" title="Citation § 1.1.4 (Click to copy anchor)" aria-label="Section 1.1.4">
              <span class="cite-prefix">1.1.</span><span class="cite-local">4</span>
            </a>
          </div>
          <div class="reader-passage" data-tokenize-target="true">
            Qua de causa Helvetii.
          </div>
        </div>
      `,
    },
    {
      id: "1.2",
      title: "Liber I, Caput II",
      sectionCount: 1,
      citationRange: ["1.2.1", "1.2.1"],
      singleHtml: `
        <div class="reader-section" id="sec-1.2.1">
          <div class="reader-gutter">
            <a href="#sec-1.2.1" class="section-anchor" title="Citation § 1.2.1" aria-label="Section 1.2.1">
              <span class="cite-prefix">1.2.</span><span class="cite-local">1</span>
            </a>
          </div>
          <div class="reader-passage" data-tokenize-target="true">
            Apud Helvetios longe nobilissimus fuit et ditissimus Orgetorix.
          </div>
        </div>
      `,
    },
  ],
};

export const MOCK_SALLUST_WORK: V2PreprocessedWork = {
  id: "phi0631.phi001.perseus-lat4",
  title: "Bellum Catilinae",
  author: "C. Sallustius Crispus",
  urlAuthor: "sallust",
  urlName: "catalina1",
  attribution: "perseus",
  hasMacra: false,
  hasTranslation: true,
  translator: "John Selby Watson",
  textParts: ["chapter", "section"],
  paginationDepth: 1,
  navTree: {
    id: [],
    children: [{ id: ["1"], children: [] }],
  },
  pages: [
    {
      id: "1",
      title: "Caput I",
      sectionCount: 1,
      citationRange: ["1.1", "1.1"],
      singleHtml: `
        <div class="reader-section" id="sec-1.1">
          <div class="reader-gutter">
            <a href="#sec-1.1" class="section-anchor" title="Citation § 1.1">
              <span class="cite-prefix">1.</span><span class="cite-local">1</span>
            </a>
          </div>
          <div class="reader-passage" data-tokenize-target="true">Omnis homines qui sese student praestare ceteris animalibus...</div>
        </div>
      `,
      parallelHtml: `
        <div class="reader-section section-parallel" id="sec-1.1">
          <div class="reader-gutter">
            <a href="#sec-1.1" class="section-anchor" title="Citation § 1.1">
              <span class="cite-prefix">1.</span><span class="cite-local">1</span>
            </a>
          </div>
          <div class="reader-parallel-content">
            <div class="reader-passage-col passage-latin">
              <div class="reader-passage" data-tokenize-target="true">Omnis homines qui sese student praestare ceteris animalibus...</div>
            </div>
            <div class="reader-passage-col passage-english">
              <span class="reader-trans-author">John Selby Watson:</span>
              <div class="reader-passage">It becomes all men, who desire to excel other animals...</div>
            </div>
          </div>
        </div>
      `,
    },
  ],
};

export const MOCK_CATULLUS_WORK: V2PreprocessedWork = {
  id: "phi0472.phi001.perseus-lat2",
  title: "Carmina",
  author: "Catullus",
  urlAuthor: "catullus",
  urlName: "carmina",
  attribution: "publicDomain",
  hasMacra: true,
  hasTranslation: false,
  textParts: ["poem", "line"],
  paginationDepth: 1,
  navTree: {
    id: [],
    children: [{ id: ["5"], children: [] }],
  },
  pages: [
    {
      id: "5",
      title: "Carmen V",
      sectionCount: 1,
      citationRange: ["5.1", "5.1"],
      singleHtml: `
        <div class="reader-section section-verse" id="sec-5.1">
          <div class="reader-gutter">
            <a href="#sec-5.1" class="section-anchor" title="Citation § 5.1">
              <span class="cite-prefix">5.</span><span class="cite-local">1</span>
            </a>
          </div>
          <div class="reader-passage" data-tokenize-target="true">
            Vivamus, mea Lesbia, atque amemus
          </div>
        </div>
      `,
    },
  ],
};

export const MOCK_VERGIL_WORK: V2PreprocessedWork = {
  id: "hypotactic_Aeneid_Vergil",
  title: "Aeneid",
  author: "Vergil",
  urlAuthor: "vergil",
  urlName: "aeneid",
  attribution: "hypotactic",
  hasMacra: true,
  hasTranslation: false,
  textParts: ["book", "line"],
  paginationDepth: 1,
  navTree: {
    id: [],
    children: [{ id: ["1"], children: [] }],
  },
  pages: [
    {
      id: "1",
      title: "Liber I",
      sectionCount: 1,
      citationRange: ["1.1", "1.1"],
      singleHtml: `
        <div class="reader-section section-verse" id="sec-1.1">
          <div class="reader-gutter">
            <a href="#sec-1.1" class="section-anchor" title="Citation § 1.1">
              <span class="cite-prefix">1.</span><span class="cite-local">1</span>
            </a>
          </div>
          <div class="reader-passage" data-tokenize-target="true">
            Arma virumque cano
          </div>
        </div>
      `,
    },
  ],
};

export const MOCK_V2_WORKS: Record<string, V2PreprocessedWork> = {
  "phi0448.phi001.perseus-lat2": MOCK_CAESAR_WORK,
  "phi0631.phi001.perseus-lat4": MOCK_SALLUST_WORK,
  "phi0472.phi001.perseus-lat2": MOCK_CATULLUS_WORK,
  hypotactic_Aeneid_Vergil: MOCK_VERGIL_WORK,
};

export const MOCK_V2_SUMMARIES: V2WorkSummary[] = [
  {
    id: MOCK_CAESAR_WORK.id,
    title: MOCK_CAESAR_WORK.title,
    shortTitle: MOCK_CAESAR_WORK.shortTitle,
    author: MOCK_CAESAR_WORK.author,
    urlAuthor: MOCK_CAESAR_WORK.urlAuthor,
    urlName: MOCK_CAESAR_WORK.urlName,
    attribution: MOCK_CAESAR_WORK.attribution,
    hasMacra: MOCK_CAESAR_WORK.hasMacra,
    hasTranslation: MOCK_CAESAR_WORK.hasTranslation,
    editor: MOCK_CAESAR_WORK.editor,
    textParts: MOCK_CAESAR_WORK.textParts,
    paginationDepth: MOCK_CAESAR_WORK.paginationDepth,
    pageCount: MOCK_CAESAR_WORK.pages.length,
    firstPageId: ["1", "1"],
  },
  {
    id: MOCK_SALLUST_WORK.id,
    title: MOCK_SALLUST_WORK.title,
    author: MOCK_SALLUST_WORK.author,
    urlAuthor: MOCK_SALLUST_WORK.urlAuthor,
    urlName: MOCK_SALLUST_WORK.urlName,
    attribution: MOCK_SALLUST_WORK.attribution,
    hasMacra: MOCK_SALLUST_WORK.hasMacra,
    hasTranslation: MOCK_SALLUST_WORK.hasTranslation,
    translator: MOCK_SALLUST_WORK.translator,
    textParts: MOCK_SALLUST_WORK.textParts,
    paginationDepth: MOCK_SALLUST_WORK.paginationDepth,
    pageCount: MOCK_SALLUST_WORK.pages.length,
    firstPageId: ["1"],
  },
  {
    id: MOCK_CATULLUS_WORK.id,
    title: MOCK_CATULLUS_WORK.title,
    author: MOCK_CATULLUS_WORK.author,
    urlAuthor: MOCK_CATULLUS_WORK.urlAuthor,
    urlName: MOCK_CATULLUS_WORK.urlName,
    attribution: MOCK_CATULLUS_WORK.attribution,
    hasMacra: MOCK_CATULLUS_WORK.hasMacra,
    hasTranslation: MOCK_CATULLUS_WORK.hasTranslation,
    textParts: MOCK_CATULLUS_WORK.textParts,
    paginationDepth: MOCK_CATULLUS_WORK.paginationDepth,
    pageCount: MOCK_CATULLUS_WORK.pages.length,
    firstPageId: ["5"],
  },
  {
    id: MOCK_VERGIL_WORK.id,
    title: MOCK_VERGIL_WORK.title,
    author: MOCK_VERGIL_WORK.author,
    urlAuthor: MOCK_VERGIL_WORK.urlAuthor,
    urlName: MOCK_VERGIL_WORK.urlName,
    attribution: MOCK_VERGIL_WORK.attribution,
    hasMacra: MOCK_VERGIL_WORK.hasMacra,
    hasTranslation: MOCK_VERGIL_WORK.hasTranslation,
    textParts: MOCK_VERGIL_WORK.textParts,
    paginationDepth: MOCK_VERGIL_WORK.paginationDepth,
    pageCount: MOCK_VERGIL_WORK.pages.length,
    firstPageId: ["1"],
  },
];

const MOCK_SLUG_MAP = new Map<string, string>([
  ["dbg", MOCK_CAESAR_WORK.id],
  ["caesar_de_bello_gallico", MOCK_CAESAR_WORK.id],
  ["caesar/de_bello_gallico", MOCK_CAESAR_WORK.id],
  ["de_bello_gallico", MOCK_CAESAR_WORK.id],
  ["sallust/catalina1", MOCK_SALLUST_WORK.id],
  ["sallust_catalina1", MOCK_SALLUST_WORK.id],
  ["catalina1", MOCK_SALLUST_WORK.id],
  ["catullus", MOCK_CATULLUS_WORK.id],
  ["catullus/carmina", MOCK_CATULLUS_WORK.id],
  ["carmina", MOCK_CATULLUS_WORK.id],
  ["aeneid", MOCK_VERGIL_WORK.id],
  ["vergil/aeneid", MOCK_VERGIL_WORK.id],
]);

export const V2_LIBRARY_INDEX = "morcus_v2_index.json";

export function getV2LibrarySummaries(): Promise<V2WorkSummary[]> {
  return Promise.resolve(MOCK_V2_SUMMARIES);
}

export function resolveV2WorkId(
  queryOrSlug: string
): Promise<string | undefined> {
  const normalized = queryOrSlug.trim();
  if (MOCK_SLUG_MAP.has(normalized)) {
    return Promise.resolve(MOCK_SLUG_MAP.get(normalized));
  }
  if (MOCK_V2_WORKS[normalized]) {
    return Promise.resolve(normalized);
  }
  return Promise.resolve(undefined);
}

export async function getV2Work(
  queryOrSlug: string
): Promise<V2PreprocessedWork | null> {
  const resolvedId = (await resolveV2WorkId(queryOrSlug)) ?? queryOrSlug;
  return MOCK_V2_WORKS[resolvedId] ?? null;
}

export function resolvePageInWork(
  work: V2PreprocessedWork,
  pageIdOrCitation?: string | string[]
): { page: V2PreprocessedPage; index: number; pageIndex: number } {
  if (!pageIdOrCitation || work.pages.length === 0) {
    return { page: work.pages[0], index: 0, pageIndex: 0 };
  }

  const needle = Array.isArray(pageIdOrCitation)
    ? pageIdOrCitation.join(".")
    : pageIdOrCitation.trim();

  // 1. Exact string match against page.id (e.g. "1.1" === "1.1")
  const exactIdx = work.pages.findIndex((p) => {
    const pIdStr = Array.isArray(p.id) ? p.id.join(".") : p.id;
    return pIdStr === needle;
  });
  if (exactIdx !== -1) {
    return { page: work.pages[exactIdx], index: exactIdx, pageIndex: exactIdx };
  }

  // 2. Prefix match if user typed a deeper citation (e.g. "1.2.3" -> page "1.2")
  const tokens = needle.split(".").filter((t) => t.length > 0);
  const k =
    work.paginationDepth ||
    (work.textParts.length > 1 ? work.textParts.length - 1 : 1);
  const pageTokens = tokens.slice(0, k);
  const pageTokenStr = pageTokens.join(".");

  const prefixIdx = work.pages.findIndex((p) => {
    const pIdStr = Array.isArray(p.id) ? p.id.join(".") : p.id;
    return pIdStr === pageTokenStr;
  });
  if (prefixIdx !== -1) {
    return {
      page: work.pages[prefixIdx],
      index: prefixIdx,
      pageIndex: prefixIdx,
    };
  }

  // 3. Substring / startsWith match
  const startsWithIdx = work.pages.findIndex((p) => {
    const pIdStr = Array.isArray(p.id) ? p.id.join(".") : p.id;
    return needle.startsWith(pIdStr) || pIdStr.startsWith(needle);
  });
  if (startsWithIdx !== -1) {
    return {
      page: work.pages[startsWithIdx],
      index: startsWithIdx,
      pageIndex: startsWithIdx,
    };
  }

  return { page: work.pages[0], index: 0, pageIndex: 0 };
}
