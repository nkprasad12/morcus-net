import { LIB_DEFAULT_DIR } from "@/common/library/library_lookup";
import {
  V2PreprocessedPage,
  V2PreprocessedWork,
} from "@/common/library/v2/v2_types";
import {
  V2_LIBRARY_INDEX,
  V2WorkSummary,
} from "@/common/library/v2/v2_library_builder";
import fs from "fs";
import path from "path";
import zlib from "zlib";

// In-memory caches for near-instant (<0.5ms) response times
let cachedSummaries: V2WorkSummary[] | null = null;
const cachedWorksById = new Map<string, V2PreprocessedWork>();
const slugToWorkId = new Map<string, string>();

const WORK_ALIASES = new Map<string, string>([
  ["dbg", "phi0448.phi001.perseus-lat2"],
  ["catullus", "phi0472.phi001.perseus-lat2"],
  ["aeneid", "hypotactic_Aeneid_Vergil"],
]);

export async function getV2LibrarySummaries(
  resultDir: string = LIB_DEFAULT_DIR
): Promise<V2WorkSummary[]> {
  if (cachedSummaries !== null) {
    return cachedSummaries;
  }

  const indexPath = path.join(resultDir, V2_LIBRARY_INDEX);
  if (fs.existsSync(indexPath)) {
    try {
      const data: V2WorkSummary[] = JSON.parse(
        fs.readFileSync(indexPath, "utf8")
      );
      cachedSummaries = data;
      for (const item of data) {
        slugToWorkId.set(`${item.urlAuthor}/${item.urlName}`, item.id);
        slugToWorkId.set(item.urlName, item.id);
        slugToWorkId.set(item.id, item.id);
      }
      return data;
    } catch (err) {
      console.error("Error reading morcus_v2_index.json:", err);
    }
  }

  return [];
}

export async function resolveV2WorkId(
  queryOrSlug: string,
  resultDir: string = LIB_DEFAULT_DIR
): Promise<string | undefined> {
  const normalized = queryOrSlug.trim();
  if (WORK_ALIASES.has(normalized)) {
    return WORK_ALIASES.get(normalized);
  }
  if (slugToWorkId.has(normalized)) {
    return slugToWorkId.get(normalized);
  }

  // Ensure index is loaded
  await getV2LibrarySummaries(resultDir);

  if (WORK_ALIASES.has(normalized)) {
    return WORK_ALIASES.get(normalized);
  }
  if (slugToWorkId.has(normalized)) {
    return slugToWorkId.get(normalized);
  }

  return undefined;
}

export async function getV2Work(
  queryOrSlug: string,
  resultDir: string = LIB_DEFAULT_DIR
): Promise<V2PreprocessedWork | null> {
  const workId = await resolveV2WorkId(queryOrSlug, resultDir);
  const targetId = workId ?? queryOrSlug;

  if (cachedWorksById.has(targetId)) {
    return cachedWorksById.get(targetId)!;
  }

  // 1. Try reading preprocessed artifact from disk
  const v2ArtifactPath = path.join(resultDir, `${targetId}.v2.json.gz`);
  if (fs.existsSync(v2ArtifactPath)) {
    try {
      const buffer = fs.readFileSync(v2ArtifactPath);
      const jsonStr = zlib.gunzipSync(buffer).toString("utf8");
      const work: V2PreprocessedWork = JSON.parse(jsonStr);
      cachedWorksById.set(targetId, work);
      cachedWorksById.set(work.id, work);
      return work;
    } catch (err) {
      console.error(`Error loading V2 artifact ${v2ArtifactPath}:`, err);
    }
  }

  return null;
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
