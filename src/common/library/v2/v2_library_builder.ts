import {
  LIB_DEFAULT_DIR,
  LIBRARY_INDEX,
  LibraryIndex,
} from "@/common/library/library_lookup";
import {
  ProcessedWork2,
  LibraryWorkMetadata,
} from "@/common/library/library_types";
import { V2PreprocessedWork } from "@/common/library/v2/v2_types";
import { preprocessWorkToV2 } from "@/common/library/v2/v2_preprocessor";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import { decodeMessage } from "@/web/utils/rpc/parsing";
import { ServerMessage } from "@/web/utils/rpc/rpc";
import fs from "fs";
import path from "path";
import zlib from "zlib";

export const V2_LIBRARY_INDEX = "morcus_v2_index.json";

export interface V2WorkSummary {
  id: string;
  title: string;
  shortTitle?: string;
  author: string;
  urlAuthor: string;
  urlName: string;
  attribution: "perseus" | "hypotactic" | "publicDomain";
  hasMacra: boolean;
  hasTranslation: boolean;
  translator?: string;
  editor?: string;
  textParts: string[];
  paginationDepth: number;
  pageCount: number;
  firstPageId: string[];
}

function decodeProcessedWork(rawBuffer: Buffer): ProcessedWork2 {
  // Check if buffer is gzipped (starts with 0x1f, 0x8b)
  const isGzip =
    rawBuffer.length > 2 && rawBuffer[0] === 0x1f && rawBuffer[1] === 0x8b;
  const decoded = (isGzip ? zlib.gunzipSync(rawBuffer) : rawBuffer).toString(
    "utf8"
  );
  return decodeMessage(
    decoded,
    ServerMessage.validator(ProcessedWork2.isMatch),
    [XmlNodeSerialization.DEFAULT]
  ).data;
}

export async function buildV2Library(
  outputDir: string = LIB_DEFAULT_DIR
): Promise<V2WorkSummary[]> {
  const indexPath = path.join(outputDir, LIBRARY_INDEX);
  if (!fs.existsSync(indexPath)) {
    throw new Error(
      `Library index not found at ${indexPath}. Run processLibrary first.`
    );
  }

  const rawIndex: LibraryIndex = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  const worksMap = new Map<string, [string, LibraryWorkMetadata]>(
    Object.entries(rawIndex)
  );

  const workCache = new Map<string, ProcessedWork2>();
  function loadWork(id: string): ProcessedWork2 | undefined {
    if (workCache.has(id)) return workCache.get(id);
    const entry = worksMap.get(id);
    if (!entry) return undefined;
    const workPath = entry[0];
    if (!fs.existsSync(workPath)) return undefined;
    const work = decodeProcessedWork(fs.readFileSync(workPath));
    workCache.set(id, work);
    return work;
  }

  const summaries: V2WorkSummary[] = [];

  for (const [workId, [, metadata]] of worksMap.entries()) {
    // Skip standalone English translations from being treated as primary Latin works
    if (metadata.isTranslation) {
      continue;
    }

    try {
      const work = loadWork(workId);
      if (!work) continue;

      let translationWork: ProcessedWork2 | undefined = undefined;
      if (metadata.translationId) {
        translationWork = loadWork(metadata.translationId);
      }

      const v2Work: V2PreprocessedWork = preprocessWorkToV2(
        work,
        metadata,
        translationWork
      );

      // Write compressed V2 work artifact
      const v2ArtifactPath = path.join(outputDir, `${workId}.v2.json.gz`);
      const serialized = Buffer.from(JSON.stringify(v2Work), "utf8");
      const compressed = zlib.gzipSync(serialized, { level: 9 });
      fs.writeFileSync(v2ArtifactPath, compressed);

      const rawFirstPageId = v2Work.pages[0]?.id ?? [];
      const firstPageId = Array.isArray(rawFirstPageId)
        ? rawFirstPageId
        : rawFirstPageId
        ? rawFirstPageId.split(".")
        : [];
      summaries.push({
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
      });
    } catch (err) {
      console.error(`Error preprocessing V2 work ${workId}:`, err);
    }
  }

  // Sort summaries alphabetically by author, then title
  summaries.sort((a, b) => {
    const authorCmp = a.author.localeCompare(b.author);
    if (authorCmp !== 0) return authorCmp;
    return a.title.localeCompare(b.title);
  });

  const v2IndexPath = path.join(outputDir, V2_LIBRARY_INDEX);
  fs.writeFileSync(v2IndexPath, JSON.stringify(summaries, null, 2));
  console.log(`Preprocessed ${summaries.length} V2 works into ${outputDir}`);

  return summaries;
}
