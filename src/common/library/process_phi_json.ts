import { envVar } from "@/common/env_vars";
import type {
  DocumentInfo,
  NavTreeNode,
  ProcessedWork2,
} from "@/common/library/library_types";
import fs from "fs";
import path from "path";

interface RawPhiJson {
  author: string;
  title: string;
  authorCode: string;
  workCode: string;
  publishedTitle: string;
  editor: string;
  publishedYear: number;
  text: Array<[id: [string, string, string, string], text: string][]>;
}

function* walkDir(dir: string): Generator<RawPhiJson> {
  for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
    const file_path = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      walkDir(file_path);
      continue;
    }
    if (!dirent.isFile() || !file_path.endsWith(".json")) {
      continue;
    }
    yield JSON.parse(fs.readFileSync(file_path, "utf8"));
  }
}

function getDocumentInfo(raw: RawPhiJson): DocumentInfo {
  return {
    title: raw.title,
    author: raw.author,
    editor: raw.editor,
    attribution: "publicDomain",
    workId: `phi-json-lat${raw.authorCode}.${raw.workCode}`,
  };
}

function convertRawPhi(raw: RawPhiJson): ProcessedWork2 {
  const info = getDocumentInfo(raw);
  const navRoot: NavTreeNode = { id: [], children: [] };
  return { info, textParts: [], rows: [], pages: [], navTree: navRoot };
}

export function processPhiJson(): ProcessedWork2[] {
  const root = envVar("PHI_JSON_ROOT");
  const results: ProcessedWork2[] = [];
  for (const work of walkDir(root)) {
    results.push(convertRawPhi(work));
  }
  return results;
}

processPhiJson();
