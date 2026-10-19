import { LIB_DEFAULT_DIR } from "@/common/library/library_lookup";
import {
  V2_LIBRARY_DB,
  V2PreprocessedPage,
  V2PreprocessedWork,
  V2WorkSummary,
} from "@/common/library/v2/v2_types";
import { ReadOnlyDb } from "@/common/sql_helper";
import { SqliteDb } from "@/common/sqlite/sql_db";
import { preRenderTocItemsHtml } from "@/web/v2/reader/reader_toc.server";
import fs from "fs";
import path from "path";

interface PageHeader {
  id: string | string[];
  title: string;
  sectionCount: number;
  citationRange: [string, string];
}

interface SummaryRow {
  summary_json: string;
}

interface WorkRow {
  work_json: string;
  toc_html: string;
}

interface PassageRow {
  single_html: string;
  notes_html: string | null;
}

interface TranslationRow {
  translation_html: string | null;
}

type WorkShell = Omit<V2PreprocessedWork, "pages" | "tocHtml" | "navTree"> & {
  pages: PageHeader[];
};

interface LibraryStore {
  summaries: V2WorkSummary[];
  slugToWorkId: Map<string, string>;
  worksById: Map<string, V2PreprocessedWork>;
  selectWork: (id: string) => WorkRow | undefined;
  selectPassage: (workId: string, pageIndex: number) => PassageRow | undefined;
  selectTranslation: (
    workId: string,
    pageIndex: number
  ) => TranslationRow | undefined;
  close: () => void;
}

const storesByDir = new Map<string, LibraryStore>();

function isSummaryRow(val: unknown): val is SummaryRow {
  return (
    typeof val === "object" &&
    val !== null &&
    "summary_json" in val &&
    typeof val.summary_json === "string"
  );
}

function isV2WorkSummary(val: unknown): val is V2WorkSummary {
  return (
    typeof val === "object" &&
    val !== null &&
    "id" in val &&
    typeof val.id === "string" &&
    "urlAuthor" in val &&
    "urlName" in val
  );
}

function isWorkShell(val: unknown): val is WorkShell {
  return (
    typeof val === "object" &&
    val !== null &&
    "id" in val &&
    typeof val.id === "string" &&
    "pages" in val &&
    Array.isArray(val.pages)
  );
}

function isWorkRow(val: unknown): val is WorkRow {
  return (
    typeof val === "object" &&
    val !== null &&
    "work_json" in val &&
    typeof val.work_json === "string" &&
    "toc_html" in val &&
    typeof val.toc_html === "string"
  );
}

function isPassageRow(val: unknown): val is PassageRow {
  return (
    typeof val === "object" &&
    val !== null &&
    "single_html" in val &&
    typeof val.single_html === "string"
  );
}

function isTranslationRow(val: unknown): val is TranslationRow {
  return typeof val === "object" && val !== null && "translation_html" in val;
}

function createLazyPage(
  store: LibraryStore,
  workId: string,
  pageIndex: number,
  header: PageHeader
): V2PreprocessedPage {
  return {
    id: header.id,
    title: header.title,
    sectionCount: header.sectionCount,
    citationRange: header.citationRange,
    get singleHtml(): string {
      return store.selectPassage(workId, pageIndex)?.single_html ?? "";
    },
    get notesHtml(): string | undefined {
      return store.selectPassage(workId, pageIndex)?.notes_html ?? undefined;
    },
    get translationHtml(): string | undefined {
      return (
        store.selectTranslation(workId, pageIndex)?.translation_html ??
        undefined
      );
    },
  };
}

function openLibraryStore(resultDir: string): LibraryStore | undefined {
  const existing = storesByDir.get(resultDir);
  if (existing !== undefined) {
    return existing;
  }

  const dbPath = path.join(resultDir, V2_LIBRARY_DB);
  if (!fs.existsSync(dbPath)) {
    return undefined;
  }

  try {
    const db = ReadOnlyDb.getDatabase(dbPath);
    const selectSummariesStmt = db.prepare(
      "SELECT summary_json FROM works ORDER BY sort_order ASC"
    );
    const selectWorkStmt = db.prepare(
      "SELECT work_json, toc_html FROM works WHERE id = ?"
    );
    const selectPassageStmt = db.prepare(
      "SELECT single_html, notes_html FROM pages WHERE work_id = ? AND page_index = ?"
    );
    const selectTranslationStmt = db.prepare(
      "SELECT translation_html FROM pages WHERE work_id = ? AND page_index = ?"
    );

    const summaryRows: unknown[] = selectSummariesStmt.all();
    const summaries: V2WorkSummary[] = [];
    for (const row of summaryRows) {
      if (!isSummaryRow(row)) continue;
      const parsed: unknown = JSON.parse(row.summary_json);
      if (isV2WorkSummary(parsed)) {
        summaries.push(parsed);
      }
    }

    const slugToWorkId = new Map<string, string>();
    for (const item of summaries) {
      slugToWorkId.set(`${item.urlAuthor}/${item.urlName}`, item.id);
      slugToWorkId.set(item.urlName, item.id);
      slugToWorkId.set(item.id, item.id);
    }

    let lastPassageWorkId = "";
    let lastPassageIndex = -1;
    let lastPassageRow: PassageRow | undefined = undefined;

    const store: LibraryStore = {
      summaries,
      slugToWorkId,
      worksById: new Map<string, V2PreprocessedWork>(),
      selectWork(id: string): WorkRow | undefined {
        const row: unknown = selectWorkStmt.get(id);
        return isWorkRow(row) ? row : undefined;
      },
      selectPassage(workId: string, pageIndex: number): PassageRow | undefined {
        if (workId === lastPassageWorkId && pageIndex === lastPassageIndex) {
          return lastPassageRow;
        }
        const row: unknown = selectPassageStmt.get(workId, pageIndex);
        lastPassageWorkId = workId;
        lastPassageIndex = pageIndex;
        lastPassageRow = isPassageRow(row) ? row : undefined;
        return lastPassageRow;
      },
      selectTranslation(
        workId: string,
        pageIndex: number
      ): TranslationRow | undefined {
        const row: unknown = selectTranslationStmt.get(workId, pageIndex);
        return isTranslationRow(row) ? row : undefined;
      },
      close(): void {
        db.close();
      },
    };

    storesByDir.set(resultDir, store);
    return store;
  } catch (err) {
    console.error(`Error opening V2 library DB at ${dbPath}:`, err);
    return undefined;
  }
}

/**
 * Writes the preprocessed V2 Latin library works and pages into a single
 * SQLite database (`v2_library.db`) inside `outputDir`.
 */
export function saveV2LibraryDb(
  outputDir: string,
  works: V2PreprocessedWork[]
): V2WorkSummary[] {
  const existingStore = storesByDir.get(outputDir);
  if (existingStore !== undefined) {
    existingStore.close();
    storesByDir.delete(outputDir);
  }

  const entries = works.map((v2Work) => {
    const rawFirstPageId = v2Work.pages[0]?.id ?? [];
    const firstPageId = Array.isArray(rawFirstPageId)
      ? rawFirstPageId
      : rawFirstPageId
      ? rawFirstPageId.split(".")
      : [];
    const summary: V2WorkSummary = {
      id: v2Work.id,
      title: v2Work.title,
      shortTitle: v2Work.shortTitle,
      author: v2Work.author,
      urlAuthor: v2Work.urlAuthor,
      urlName: v2Work.urlName,
      attribution: v2Work.attribution,
      hasMacra: v2Work.hasMacra,
      hasTranslation: v2Work.hasTranslation,
      translator: v2Work.translator,
      editor: v2Work.editor,
      textParts: v2Work.textParts,
      paginationDepth: v2Work.paginationDepth,
      pageCount: v2Work.pages.length,
      firstPageId,
    };
    return { summary, v2Work };
  });

  entries.sort((a, b) => {
    const authorCmp = a.summary.author.localeCompare(b.summary.author);
    if (authorCmp !== 0) return authorCmp;
    return a.summary.title.localeCompare(b.summary.title);
  });

  fs.mkdirSync(outputDir, { recursive: true });
  const dbPath = path.join(outputDir, V2_LIBRARY_DB);
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = `${dbPath}${suffix}`;
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }

  const db = SqliteDb.create(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(
    "CREATE TABLE works (" +
      "id TEXT PRIMARY KEY, " +
      "sort_order INTEGER NOT NULL, " +
      "url_author TEXT NOT NULL, " +
      "url_name TEXT NOT NULL, " +
      "summary_json TEXT NOT NULL, " +
      "work_json TEXT NOT NULL, " +
      "toc_html TEXT NOT NULL" +
      ") WITHOUT ROWID; " +
      "CREATE TABLE pages (" +
      "work_id TEXT NOT NULL, " +
      "page_index INTEGER NOT NULL, " +
      "single_html TEXT NOT NULL, " +
      "notes_html TEXT, " +
      "translation_html TEXT, " +
      "PRIMARY KEY (work_id, page_index)" +
      ") WITHOUT ROWID;"
  );

  const insertWork = db.prepare(
    "INSERT INTO works (id, sort_order, url_author, url_name, summary_json, work_json, toc_html) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  const insertPage = db.prepare(
    "INSERT INTO pages (work_id, page_index, single_html, notes_html, translation_html) VALUES (?, ?, ?, ?, ?)"
  );

  const insertAll = db.transaction(() => {
    for (let sortOrder = 0; sortOrder < entries.length; sortOrder++) {
      const { summary, v2Work } = entries[sortOrder];
      const { pages, tocHtml } = v2Work;
      const pageHeaders: PageHeader[] = pages.map((p) => ({
        id: p.id,
        title: p.title,
        sectionCount: p.sectionCount,
        citationRange: p.citationRange,
      }));
      const workJson = JSON.stringify({
        ...v2Work,
        navTree: undefined,
        tocHtml: undefined,
        pages: pageHeaders,
      });
      const tocHtmlStr =
        tocHtml ??
        preRenderTocItemsHtml({
          pages,
          work: v2Work,
        });

      insertWork.run(
        v2Work.id,
        sortOrder,
        v2Work.urlAuthor,
        v2Work.urlName,
        JSON.stringify(summary),
        workJson,
        tocHtmlStr
      );

      for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
        const p = pages[pageIdx];
        insertPage.run(
          v2Work.id,
          pageIdx,
          p.singleHtml,
          p.notesHtml ?? null,
          p.translationHtml ?? null
        );
      }
    }
  });

  insertAll();
  db.close();

  return entries.map((e) => e.summary);
}

export function getV2LibrarySummaries(
  resultDir: string = LIB_DEFAULT_DIR
): Promise<V2WorkSummary[]> {
  const store = openLibraryStore(resultDir);
  return Promise.resolve(store ? store.summaries : []);
}

export function getV2Work(
  queryOrSlug: string,
  resultDir: string = LIB_DEFAULT_DIR
): Promise<V2PreprocessedWork | null> {
  const store = openLibraryStore(resultDir);
  if (!store) {
    return Promise.resolve(null);
  }

  const normalized = queryOrSlug.trim();
  const targetId = store.slugToWorkId.get(normalized) ?? normalized;

  const cached = store.worksById.get(targetId);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  const row = store.selectWork(targetId);
  if (!row) {
    return Promise.resolve(null);
  }

  const rawShell: unknown = JSON.parse(row.work_json);
  if (!isWorkShell(rawShell)) {
    return Promise.resolve(null);
  }

  const work: V2PreprocessedWork = {
    ...rawShell,
    tocHtml: row.toc_html,
    pages: rawShell.pages.map((header, idx) =>
      createLazyPage(store, rawShell.id, idx, header)
    ),
  };

  store.worksById.set(targetId, work);
  store.worksById.set(work.id, work);
  return Promise.resolve(work);
}

export function resolvePageInWork(
  work: V2PreprocessedWork,
  pageIdOrCitation?: string | string[]
): {
  page: V2PreprocessedPage;
  index: number;
  pageIndex: number;
  matched: boolean;
} {
  if (!pageIdOrCitation || work.pages.length === 0) {
    return { page: work.pages[0], index: 0, pageIndex: 0, matched: true };
  }

  const rawNeedle = Array.isArray(pageIdOrCitation)
    ? pageIdOrCitation.join(".")
    : pageIdOrCitation.trim();

  if (!rawNeedle) {
    return { page: work.pages[0], index: 0, pageIndex: 0, matched: true };
  }

  const k =
    work.paginationDepth ||
    (work.textParts.length > 1 ? work.textParts.length - 1 : 1);

  const tryResolve = (
    needle: string
  ): {
    page: V2PreprocessedPage;
    index: number;
    pageIndex: number;
    matched: true;
  } | null => {
    // 1. Exact string match against page.id (e.g. "1.1" === "1.1")
    const exactIdx = work.pages.findIndex((p) => {
      const pIdStr = Array.isArray(p.id) ? p.id.join(".") : p.id;
      return pIdStr === needle;
    });
    if (exactIdx !== -1) {
      return {
        page: work.pages[exactIdx],
        index: exactIdx,
        pageIndex: exactIdx,
        matched: true,
      };
    }

    // 2. Prefix match if user typed a deeper citation (e.g. "1.2.3" -> page "1.2")
    const tokens = needle.split(".").filter((t) => t.length > 0);
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
        matched: true,
      };
    }

    // 3. Segment-delimited prefix match (e.g. "2" -> "2.1" or "1.5.10" -> "1.5",
    //    never "1.55" -> "1.5")
    const startsWithIdx = work.pages.findIndex((p) => {
      const pIdStr = Array.isArray(p.id) ? p.id.join(".") : p.id;
      return needle.startsWith(pIdStr + ".") || pIdStr.startsWith(needle + ".");
    });
    if (startsWithIdx !== -1) {
      return {
        page: work.pages[startsWithIdx],
        index: startsWithIdx,
        pageIndex: startsWithIdx,
        matched: true,
      };
    }

    return null;
  };

  const direct = tryResolve(rawNeedle);
  if (direct) return direct;

  // Strip optional leading label word (e.g. Zero-JS `?jump=Book+2` -> "2")
  const stripped = rawNeedle
    .replace(/^(book|liber|chapter|caput|section|elegy|poem|carmen)\s+/i, "")
    .trim();
  if (stripped && stripped !== rawNeedle) {
    const afterStrip = tryResolve(stripped);
    if (afterStrip) return afterStrip;
  }

  return { page: work.pages[0], index: 0, pageIndex: 0, matched: false };
}
