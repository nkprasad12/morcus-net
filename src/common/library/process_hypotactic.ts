import { assert, assertEqual, assertType, checkPresent } from "@/common/assert";
import { envVar } from "@/common/env_vars";
import type {
  DocumentInfo,
  NavTreeNode,
  ProcessedWork2,
} from "@/common/library/library_types";
import { safeParseInt } from "@/common/misc_utils";
import { XmlNode } from "@/common/xml/xml_node";
import { isAny, isArray } from "@/web/utils/rpc/parsing";
import fs from "fs";
import path from "path";
import zlib from "zlib";

const LICENSE_KEY = "licence";
const CREDIT_KEY = "scansion credit";
const KNOWN_KEYS = new Set([LICENSE_KEY, CREDIT_KEY]);

interface HypotacticParsedJson {
  works: HypotacticWork[];
  license: string;
  credit: string;
}

interface HypotacticLineSegment {
  speaker?: string;
  text: string;
}

interface HypotacticPoemContent {
  line: string;
  meter?: string;
  segments: HypotacticLineSegment[];
}

interface HypotacticPoem {
  title: string;
  meter: string;
  poemNumber: string;
  content: HypotacticPoemContent[];
}

interface HypotacticWork {
  author: string;
  title: string;
  poems: HypotacticPoem[];
}

function getFileJson(filePath: string): any {
  const fileContents = fs.readFileSync(filePath);
  const decompressed = zlib.gunzipSync(fileContents);
  return JSON.parse(decompressed.toString());
}

function extractSegments(data: Record<string, any>[]): HypotacticLineSegment[] {
  const segments: HypotacticLineSegment[] = [];
  for (const item of data) {
    const speaker = item["speaker"];
    const rawWords = item["words"];
    const text = rawWords.map((w: { text: string }) => w["text"]).join(" ");
    segments.push({ speaker, text });
  }
  return segments;
}

function extractPoemContent(
  data: Record<string, any>[]
): HypotacticPoemContent[] {
  const content: HypotacticPoemContent[] = [];
  for (const item of data) {
    const line = item["line number"];
    const meter = item["metre"];
    const segments = extractSegments(item["segments"]);
    content.push({ line, meter, segments });
  }
  return content;
}

function resolvePoemTitle(
  workTitle: string,
  workSubtitle: string,
  data: Record<string, any>
): string {
  const nominalTitle = data["poem title"];
  // @ts-expect-error
  const poemNumber = data["poem number"];
  if (nominalTitle !== "" && workSubtitle === "poems") {
    return nominalTitle;
  }
  if (nominalTitle === "" && workSubtitle === "poems") {
    return workTitle;
  }
  return workSubtitle;
}

function extractPoems(
  data: Record<string, any>[],
  workTitle: string,
  workSubtitle: string
): HypotacticPoem[] {
  const poems: HypotacticPoem[] = [];
  for (const item of data) {
    const title = resolvePoemTitle(workTitle, workSubtitle, item);
    const meter = item["poem metre"];
    const content = extractPoemContent(item["poem content"]);
    const poemNumber = item["poem number"];
    poems.push({ title, meter, content, poemNumber });
  }
  return poems;
}

function parseHypotacticJson(data: object, fileName: string) {
  const works: HypotacticParsedJson[] = [];
  const unextendedName = fileName.replace(/\.json\.gz$/, "");
  for (const key in data) {
    if (KNOWN_KEYS.has(key)) {
      continue;
    }
    assert(key.toLowerCase().includes(unextendedName));
    const author = key;
    // @ts-expect-error
    const licence = data[LICENSE_KEY];
    // @ts-expect-error
    const credit = data[CREDIT_KEY];
    // @ts-expect-error
    const workData = data[key];

    for (const title in workData) {
      const poemsForTitle: HypotacticWork[] = [];
      const subWorkData = workData[title];
      for (const subtitle in subWorkData) {
        const poemData = subWorkData[subtitle];
        assertType(poemData, isArray(isAny));
        assert(poemData.length > 0, `No poems found in ${fileName}`);
        const poems = extractPoems(poemData, title, subtitle);
        poemsForTitle.push({ author, title, poems });
      }
      works.push({ license: licence, credit, works: poemsForTitle });
    }
  }
  return works;
}

function doTitlesMatch(first: string, second: string): boolean {
  const normalizedFirst = first.trim().toLowerCase().replaceAll(":", " ");
  const normalizedSecond = second.trim().toLowerCase().replaceAll(":", " ");
  if (normalizedFirst === normalizedSecond) {
    return true;
  }
  const firstParts = normalizedFirst.split(" ");
  const secondParts = normalizedSecond.split(" ");
  if (firstParts.length !== secondParts.length) {
    return false;
  }
  const firstEndsInNumber =
    safeParseInt(firstParts[firstParts.length - 1]) !== undefined;
  const secondEndsInNumber =
    safeParseInt(secondParts[secondParts.length - 1]) !== undefined;
  return (
    firstEndsInNumber &&
    secondEndsInNumber &&
    firstParts.slice(0, -1).join(" ") === secondParts.slice(0, -1).join(" ")
  );
}

function recombineWorks(data: HypotacticParsedJson[]): HypotacticParsedJson[] {
  const license = data[0].license;
  const credit = data[0].credit;

  const works = data.flatMap((item) => item.works);
  const groupedWorks: HypotacticWork[][] = [];
  let lastTitle: string | undefined = undefined;

  for (const work of works) {
    if (lastTitle !== undefined && doTitlesMatch(lastTitle, work.title)) {
      groupedWorks[groupedWorks.length - 1].push(work);
      continue;
    }
    groupedWorks.push([work]);
    lastTitle = work.title;
  }
  return groupedWorks.map((works) => ({ works, license, credit }));
}

function processBookAndLineWork(
  fullWork: HypotacticParsedJson
): ProcessedWork2 {
  const pages: ProcessedWork2["pages"] = [];
  const navTreeRoot: NavTreeNode = {
    id: [],
    children: [],
  };
  const title = fullWork.works[0].title;
  const rows: ProcessedWork2["rows"] = [];
  for (const work of fullWork.works) {
    assertEqual(title, work.title);
    for (const poem of work.poems) {
      assert(poem.title.startsWith(title));
      const bookId = checkPresent(
        safeParseInt(poem.title.substring(title.length).trim())
      ).toString();
      navTreeRoot.children.push({ id: [bookId], children: [] });
      const pageStart = rows.length;
      for (const content of poem.content) {
        const lineId = [bookId, content.line.trim()];
        assertEqual(content.segments.length, 1);
        assertEqual(content.segments[0].speaker, "");
        const lineText = content.segments[0].text.normalize("NFD");
        rows.push([lineId, new XmlNode("span", [], [lineText])]);
      }
      pages.push({ id: [bookId], rows: [pageStart, rows.length] });
    }
  }
  const author = fullWork.works[0].author;
  const info: DocumentInfo = {
    title,
    author,
    workId: `hypotactic_${title}_${author}`,
    attribution: "hypotactic",
  };
  return {
    info,
    textParts: ["book", "line"],
    rows,
    pages,
    navTree: navTreeRoot,
  };
}

export function processHypotactic(): ProcessedWork2[] {
  const root = envVar("HYPOTACTIC_ROOT");
  const files = fs.readdirSync(root);
  // fs.mkdirSync("hypo_out", { recursive: true });
  const processedWorks: ProcessedWork2[] = [];
  for (const file of files) {
    if (!file.endsWith(".json.gz")) {
      continue;
    }
    const data = getFileJson(path.join(root, file));
    const works = recombineWorks(parseHypotacticJson(data, file));
    for (const work of works) {
      const author = work.works[0].author.replace(/[^a-zA-Z0-9]/g, "_");
      const title = work.works[0].title.replace(/[^a-zA-Z0-9]/g, "_");
      if (author !== "Ovid" || title !== "Metamorphoses") {
        continue;
      }
      // Uncomment to write debug files.
      // const outputFile = path.join("hypo_out", `${author}_${title}.debug.json`);
      // console.log(`Writing ${outputFile}`);
      // fs.writeFileSync(outputFile, JSON.stringify(work, null, 2));
      processedWorks.push(processBookAndLineWork(work));
    }
  }
  return processedWorks;
}
