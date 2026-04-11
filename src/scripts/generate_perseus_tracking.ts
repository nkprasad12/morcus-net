import * as fs from "fs";
import * as path from "path";
import { parseRawXml } from "@/common/xml/xml_utils";
import { processTei2 } from "@/common/library/process_work";
import { LatinWorks } from "@/common/library/library_constants";

const TRACKING_DIR = path.join(__dirname, "../..", "tracking");
const PERSEUS_DIR =
  "/home/nitin/Documents/morcus_data/corpus/perseus/canonical-latinLit/data";
const OUTPUT_FILE = path.join(TRACKING_DIR, "perseus_tracking.json");
const MAPPINGS_FILE = path.join(
  TRACKING_DIR,
  "hypotactic_perseus_mappings.json"
);

const ALREADY_SUPPORTED = new Set(Object.values(LatinWorks));

// Author-level prefixes to skip entirely (all works by that author are already covered).
// phi0914 = Livy (Ab Urbe Condita already fully added via LIVY_AUC).
const SKIP_AUTHOR_PREFIXES = ["phi0914"];

interface HypotacticMapping {
  hypotacticAuthor: string;
  hypotacticTitle: string;
  hypotacticStatus: string;
  perseusBaseId: string | null;
  notes?: string;
}

function loadHypotacticBaseIds(): Set<string> {
  const mappings: HypotacticMapping[] = JSON.parse(
    fs.readFileSync(MAPPINGS_FILE, "utf-8")
  );
  const ids = new Set<string>();
  for (const m of mappings) {
    if (m.perseusBaseId !== null) {
      // Some entries point to a parent dir (e.g. "phi0692") without a sub-work;
      // only add proper two-part base IDs.
      if (m.perseusBaseId.includes(".")) {
        ids.add(m.perseusBaseId);
      }
    }
  }
  return ids;
}

function extractTitleAndAuthor(xmlContent: string): {
  title: string;
  author: string;
} {
  const titleMatch =
    xmlContent.match(/<title[^>]*xml:lang="lat"[^>]*>([^<]+)<\/title>/) ||
    xmlContent.match(/<title[^>]*xml:lang="eng"[^>]*>([^<]+)<\/title>/) ||
    xmlContent.match(/<title>([^<]+)<\/title>/);
  const authorMatch =
    xmlContent.match(/<author[^>]*xml:lang="lat"[^>]*>([^<]+)<\/author>/) ||
    xmlContent.match(/<author>([^<]+)<\/author>/);
  return {
    title: titleMatch?.[1]?.trim() ?? "Unknown",
    author: authorMatch?.[1]?.trim() ?? "Unknown",
  };
}

function findXmlFiles(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      findXmlFiles(fullPath, fileList);
    } else if (file.endsWith(".xml") && file.includes("-lat")) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function approximateWordCount(xmlContent: string): number {
  // Strip tags and count approx words
  const textContent = xmlContent.replace(/<[^>]+>/g, " ");
  const words = textContent.split(/\s+/).filter((w) => w.trim().length > 0);
  return words.length;
}

async function run() {
  const hypotacticBaseIds = loadHypotacticBaseIds();
  const allFiles = findXmlFiles(PERSEUS_DIR);

  // Group files by base Work ID (e.g. "phi0978.phi001")
  const worksByBaseId = new Map<string, string[]>();

  for (const file of allFiles) {
    const filename = path.basename(file, ".xml");
    const match =
      filename.match(/^([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\.perseus-lat\d+$/) ||
      filename.match(/^([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)$/);
    if (match) {
      const baseId = `${match[1]}.${match[2]}`;
      if (!worksByBaseId.has(baseId)) {
        worksByBaseId.set(baseId, []);
      }
      worksByBaseId.get(baseId)!.push(file);
    } else {
      const parts = filename.split(".");
      if (parts.length >= 2) {
        const baseId = `${parts[0]}.${parts[1]}`;
        if (!worksByBaseId.has(baseId)) {
          worksByBaseId.set(baseId, []);
        }
        worksByBaseId.get(baseId)!.push(file);
      }
    }
  }

  interface TrackingRow {
    baseId: string;
    acceptedVersion: string;
    author: string;
    title: string;
    wordCount: number;
    blocker: string;
  }

  const results: TrackingRow[] = [];

  for (const [baseId, versions] of worksByBaseId.entries()) {
    // Check if explicitly supported in any version format
    if (versions.some((v) => ALREADY_SUPPORTED.has(path.basename(v, ".xml")))) {
      continue;
    }
    // Check if already covered by Hypotactic
    if (hypotacticBaseIds.has(baseId)) {
      continue;
    }
    // Check if the author is fully covered already
    if (SKIP_AUTHOR_PREFIXES.some((prefix) => baseId.startsWith(prefix))) {
      continue;
    }

    let success = false;
    let fallbackCount = 0;
    let lastError = "Unknown error";
    let acceptedVersion = "N/A";
    let author = "Unknown";
    let title = "Unknown";

    for (const versionFile of versions) {
      const versionId = path.basename(versionFile, ".xml");
      const content = fs.readFileSync(versionFile, "utf-8");

      const count = approximateWordCount(content);
      if (fallbackCount === 0) {
        fallbackCount = count;
        // Extract metadata from the first version regardless of parse success
        const meta = extractTitleAndAuthor(content);
        author = meta.author;
        title = meta.title;
      }

      try {
        const parsed = parseRawXml(content);
        processTei2(parsed, { workId: versionId });
        // If we reach here, it succeeded
        success = true;
        acceptedVersion = versionId.split(".").pop() || versionId;
        fallbackCount = count;
        const meta = extractTitleAndAuthor(content);
        author = meta.author;
        title = meta.title;
        break;
      } catch (err: any) {
        lastError = err.message || String(err);
      }
    }

    if (success) {
      results.push({
        baseId,
        acceptedVersion,
        author,
        title,
        wordCount: fallbackCount,
        blocker: "None (Ready)",
      });
    } else {
      // Clean up the error message for markdown formatting
      const cleanError = lastError.replace(/\n|\|/g, " ").trim();
      results.push({
        baseId,
        acceptedVersion: "N/A",
        author,
        title,
        wordCount: fallbackCount,
        blocker: cleanError || "Failed parsing",
      });
    }
  }

  // Sort deterministically
  results.sort((a, b) => a.baseId.localeCompare(b.baseId));

  const jsonOut = JSON.stringify(results, null, 2);

  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, jsonOut, "utf-8");
  console.log(`Tracking sheet successfully written to ${OUTPUT_FILE}`);
}

run().catch((err) => {
  console.error("Execution failed:", err);
  process.exit(1);
});
