import { assert } from "@/common/assert";
import { envVar } from "@/common/env_vars";
import type {
  DocumentInfo,
  ProcessedWork2,
} from "@/common/library/library_types";
import { buildNavTree, divideWork } from "@/common/library/process_work";
import { XmlNode } from "@/common/xml/xml_node";
import fs from "fs";
import path from "path";

export interface RawPhiJson {
  author: string;
  title: string;
  authorCode: string;
  workCode: string;
  publishedTitle: string;
  editor: string;
  publishedYear: number;
  text: [id: [string, string, string, string], text: string][];
}

const PHI_TITLE_CODE = "t";
const SKIP_LINES = new Set<string>(["* * *"]);

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

function convertPhiId(id: [string, string, string, string]): string[] {
  const convertedIds = [id[0], id[3], id[2]];
  for (let i = 0; i < convertedIds.length; i++) {
    if (convertedIds[i] === PHI_TITLE_CODE) {
      return convertedIds.slice(0, i);
    }
  }
  return convertedIds;
}

function validateId(id: string[]): string[] {
  for (const part of id) {
    assert(!part.includes("."), `Invalid id part with dot: ${part}`);
  }
  return id;
}

function groupPhiText(
  rawText: RawPhiJson["text"]
): [joinedId: string, textLines: string[]][] {
  let lastId = validateId(convertPhiId(rawText[0][0])).join(".");
  const seenIds = new Set<string>([lastId]);
  const result: [string, string[]][] = [[lastId, []]];

  for (const [idParts, text] of rawText) {
    const id = validateId(convertPhiId(idParts)).join(".");
    if (id === lastId) {
      // If it's the same ID as the last, just add to the last entry.
      result[result.length - 1][1].push(text);
      continue;
    }
    assert(!seenIds.has(id), `Duplicate non-contiguous id found: ${id}`);
    lastId = id;
    seenIds.add(id);
    result.push([id, [text]]);
  }
  return result;
}

export function containsLatinOrGreek(input: string): boolean {
  return (
    input.length === 0 || /[\p{Script=Latin}\p{Script=Greek}]/u.test(input)
  );
}

function findClauseEnd(line: string): number {
  const clauseEnders = [".", ";", ":", "!", "?"];
  for (let i = 0; i < line.length; i++) {
    const c = line.charAt(i);
    if (clauseEnders.includes(c)) {
      return i;
    }
  }
  return -1;
}

function findCarryOverBreak(line: string): number {
  const clauseEnd = findClauseEnd(line);
  if (clauseEnd !== -1) {
    return clauseEnd;
  }
  console.warn("No clause end found, breaking at last space.");
  return line.lastIndexOf(" ");
}

function preprocessPhiText(rawText: RawPhiJson["text"]): [string[], string][] {
  const rows: [string[], string][] = [];
  let hasCarryOver = false;
  for (const [joinedId, rawLines] of groupPhiText(rawText)) {
    const id = joinedId.length === 0 ? [] : joinedId.split(".");
    const lines: string[] = [];
    let mergeWithLast = false;
    for (const rawLine of rawLines) {
      let line = rawLine.trim();
      if (hasCarryOver) {
        const carryOverBreak = findCarryOverBreak(line);
        assert(
          carryOverBreak !== -1,
          `Expected break in line: '${joinedId} | ${line}'`
        );
        const firstPart = line.slice(0, carryOverBreak + 1);
        const lastIndex = rows.length - 1;
        rows[lastIndex][1] = rows[lastIndex][1] + firstPart;
        hasCarryOver = false;
        line = line.slice(carryOverBreak + 1).trim();
      }
      if (!containsLatinOrGreek(line)) {
        assert(SKIP_LINES.has(line), `Non-Latin/Greek line found: '${line}'`);
        continue;
      }
      if (line.length === 0) {
        continue;
      }
      const lastChar = line.charAt(line.length - 1);
      const endsWithDash = "-‐‑".includes(lastChar);
      if (mergeWithLast) {
        const lastIndex = lines.length - 1;
        const partToMerge = endsWithDash ? line.slice(0, -1) : line;
        lines[lastIndex] = lines[lastIndex] + partToMerge;
        // We may need to continue merging if this line also ends with a dash
        mergeWithLast = endsWithDash;
        continue;
      }
      if (endsWithDash) {
        mergeWithLast = true;
        lines.push(line.slice(0, -1));
        continue;
      }

      lines.push(line);
    }
    hasCarryOver = mergeWithLast;
    rows.push([id, lines.join(" ")]);
  }
  return rows;
}

function convertPhiText(raw: RawPhiJson): ProcessedWork2["rows"] {
  const preprocessed = preprocessPhiText(raw.text);
  return preprocessed.map(([id, line]) => [
    id,
    new XmlNode("span", [], [line]),
  ]);
}

export function convertRawPhi(raw: RawPhiJson): ProcessedWork2 {
  const info = getDocumentInfo(raw);
  const rows = convertPhiText(raw);
  const textParts = ["Book", "Chapter", "Section"];
  const pages = divideWork(rows, textParts);
  const navTree = buildNavTree(pages);

  return {
    info,
    textParts,
    rows,
    pages,
    navTree,
  };
}

export function processPhiJson(): ProcessedWork2[] {
  const root = envVar("PHI_JSON_ROOT");
  const results: ProcessedWork2[] = [];
  for (const work of walkDir(root)) {
    results.push(convertRawPhi(work));
  }
  return results;
}
