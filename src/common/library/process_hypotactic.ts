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

// These should map Hypotactic author names to Perseus author names.
const AUTHOR_REMAPPING = new Map<string, string>([["Ovid", "P. Ovidius Naso"]]);

const CAN_SKIP_SPEAKERS = new Set(["hypotactic_Eclogues_Calpurnius Siculus"]);

const SUPPORTED_WORKS = [
  ["Calpurnius_Siculus", "Eclogues"],
  ["Germanicus", "Aratea"],
  ["Grattius", "Cynegetica"],
  ["Cicero", "Aratea"],
  ["Persius", "Satires"],
  ["Lucan", "Bellum_Civile"],
  ["Horace", "Epistulae"],
  ["Horace", "Odes"],
  ["Horace", "Sermones"],
  ["Ovid", "Metamorphoses"],
  ["Statius", "Achilleid"],
  ["Statius", "Silvae"],
  ["Statius", "Thebaid"],
  ["Vergil", "Aeneid"],
  ["Vergil", "Eclogues"],
  ["Vergil", "Georgics"],
];
const UNSUPPORTED_WORKS = [
  ["Tibullus", "Elegies_1"],
  ["Tibullus", "Messala_Encomium__pseudo_Tibullus_"],
  ["Plautus", "Amphitruo"],
  ["Plautus", "Asinaria"],
  ["Plautus", "Aulularia"],
  ["Plautus", "Bacchides"],
  ["Plautus", "Captivi"],
  ["Plautus", "Casina"],
  ["Plautus", "Cistellaria"],
  ["Plautus", "Curculio"],
  ["Plautus", "Epidicus"],
  ["Plautus", "Menaechmi"],
  ["Plautus", "Mercator"],
  ["Plautus", "Miles_Gloriosus"],
  ["Plautus", "Mostellaria"],
  ["Plautus", "Persa"],
  ["Plautus", "Poenulus"],
  ["Plautus", "Pseudolus"],
  ["Plautus", "Rudens"],
  ["Plautus", "Stichus"],
  ["Plautus", "Trinummus"],
  ["Plautus", "Truculentus"],
  ["Manilius", "Astronomica_1"],
  ["Catullus", "Poems"],
  ["Columella", "De_Re_Rustica_10"],
  ["Phaedrus", "Fabulae_1"],
  ["Phaedrus", "Fabulae_Appendix"],
  ["Seneca", "Agamemnon"],
  ["Seneca", "Hercules_Furens"],
  ["Seneca", "Hercules_Oetaeus"],
  ["Seneca", "Medea"],
  ["Seneca", "Octavia"],
  ["Seneca", "Oedipus"],
  ["Seneca", "Phaedra"],
  ["Seneca", "Phoenissae"],
  ["Seneca", "Thyestes"],
  ["Seneca", "Troades"],
  ["Lucretius", "De_Rerum_Natura_1"],
  ["Juvenal", "Satires_1"],
  ["Ovid", "Amores"],
  ["Ovid", "Ars_Amatoria"],
  ["Ovid", "Remedia_Amoris"],
  ["Ovid", "Tristia"],
  ["Ovid", "Fasti"],
  ["Ovid", "Epistulae_ex_Ponto"],
  ["Ovid", "Ibis"],
  ["Ovid", "Heroides"],
  ["Ovid", "Medicamina_Faciei_Feminae"],
  ["Ovid", "Consolatio_Liviae_and_Nux__pseudo_Ovid_"],
  ["Ovid", "Halieutica__pseudo_Ovid_"],
  ["Valerius_Flaccus", "Argonautica_1"],
  ["Petronius", "Bellum_Civile"],
  ["Petronius", "Other_Poems"],
  ["Propertius", "Elegies_1"],
  ["Silius_Italicus", "Punica_1"],
  ["Martial", "Epigrams_1"],
  ["Martial", "De_Spectaculis"],
  ["Ennius", "Annales_Fragments"],
  ["Horace", "Epodes"],
  ["Horace", "Ars_Poetica"],
  ["Unknown", "Laus_Pisonis"],
  ["Unknown", "Appendix_Vergiliana"],
  ["Unknown", "Priapea"],
  ["Unknown", "Catonis_Disticha"],
  ["Unknown", "Ilias_Latina"],
  ["Unknown", "Messala_Encomium__ps__Tibullus_"],
  ["Unknown", "Halieutica__ps__Ovid_"],
  ["Unknown", "Consolatio_Liviae_and_Nux__ps__Ovid_"],
  ["Terence", "Adelphoe"],
  ["Terence", "Andria"],
  ["Terence", "Eunuchus"],
  ["Terence", "Heauton_Timoroumenos"],
  ["Terence", "Hecyra"],
  ["Terence", "Phormio"],
];

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

function extractInfo(fullWork: HypotacticParsedJson): DocumentInfo {
  const title = fullWork.works[0].title;
  const author = fullWork.works[0].author;
  return {
    title,
    author: AUTHOR_REMAPPING.get(author) ?? author,
    workId: `hypotactic_${title}_${author}`,
    attribution: "hypotactic",
  };
}

function processPoemContent(
  allContent: HypotacticPoemContent[],
  parentId: string[],
  workId: string = ""
): ProcessedWork2["rows"] {
  return allContent.map((content) => {
    const lineId = parentId.concat([content.line.trim()]);
    assertEqual(content.segments.length, 1);
    if (!CAN_SKIP_SPEAKERS.has(workId)) {
      assertEqual("", content.segments[0].speaker, workId);
    }
    const lineText = content.segments[0].text.normalize("NFD");
    return [lineId, new XmlNode("span", [], [lineText])];
  });
}

function hasMultiPoem(fullWork: HypotacticParsedJson): boolean {
  return fullWork.works.some((work) => work.poems.length > 1);
}

function processBookPoemAndLineWork(
  fullWork: HypotacticParsedJson
): ProcessedWork2 {
  const pages: ProcessedWork2["pages"] = [];
  const navTreeRoot: NavTreeNode = {
    id: [],
    children: [],
  };
  const info = extractInfo(fullWork);
  const title = info.title;
  const unpluralizedTitle = title.slice(
    0,
    title.endsWith("s") ? -1 : title.length
  );
  const rows: ProcessedWork2["rows"] = [];
  for (const work of fullWork.works) {
    assertEqual(title, work.title);
    const bookId = checkPresent(
      safeParseInt(work.poems[0].title.substring(title.length).trim())
    ).toString();
    const poemNavChildren: NavTreeNode[] = [];
    navTreeRoot.children.push({ id: [bookId], children: poemNavChildren });
    for (const poem of work.poems) {
      assert(poem.title.startsWith(unpluralizedTitle));
      assertEqual(
        bookId,
        checkPresent(
          safeParseInt(poem.title.substring(title.length).trim())
        ).toString()
      );
      const poemNumber = poem.poemNumber.trim();
      assert(poemNumber.length > 0);
      const poemId = [bookId, poemNumber];
      poemNavChildren.push({ id: poemId, children: [] });
      const pageStart = rows.length;
      rows.push(...processPoemContent(poem.content, poemId));
      pages.push({ id: poemId, rows: [pageStart, rows.length] });
    }
  }
  return {
    info,
    textParts: ["book", "poem", "line"],
    rows,
    pages,
    navTree: navTreeRoot,
  };
}

function isPoemAndLineWork(work: HypotacticParsedJson): boolean {
  if (work.works.length !== 1) {
    return false;
  }
  const poems = work.works[0].poems;
  if (poems.length < 2) {
    return false;
  }
  for (const poem of poems) {
    if (poem.title !== work.works[0].title) {
      return false;
    }
  }
  return true;
}

function processPoemAndLineWork(
  fullWork: HypotacticParsedJson
): ProcessedWork2 {
  assertEqual(fullWork.works.length, 1);
  const pages: ProcessedWork2["pages"] = [];
  const navTreeRoot: NavTreeNode = {
    id: [],
    children: [],
  };
  const info = extractInfo(fullWork);
  const title = info.title;
  const rows: ProcessedWork2["rows"] = [];
  const work = fullWork.works[0];
  assertEqual(title, work.title);

  for (const poem of work.poems) {
    const poemId = poem.poemNumber.trim();
    navTreeRoot.children.push({ id: [poemId], children: [] });
    const pageStart = rows.length;
    rows.push(...processPoemContent(poem.content, [poemId], info.workId));
    pages.push({ id: [poemId], rows: [pageStart, rows.length] });
  }

  return {
    info,
    textParts: ["poem", "line"],
    rows,
    pages,
    navTree: navTreeRoot,
  };
}

function isOnlyLinesWork(fullWork: HypotacticParsedJson): boolean {
  return fullWork.works.flatMap((work) => work.poems).length === 1;
}

function processOnlyLinesWork(fullWork: HypotacticParsedJson): ProcessedWork2 {
  const pages: ProcessedWork2["pages"] = [];
  const navTreeRoot: NavTreeNode = {
    id: ["1"],
    children: [],
  };
  const info = extractInfo(fullWork);
  const poems = fullWork.works.flatMap((work) => work.poems);
  assertEqual(poems.length, 1);
  const poem = poems[0];
  const rows: ProcessedWork2["rows"] = [];

  const pageStart = rows.length;
  rows.push(...processPoemContent(poem.content, ["1"]));
  pages.push({ id: ["1"], rows: [pageStart, rows.length] });

  return {
    info,
    textParts: ["poem", "line"],
    rows,
    pages,
    navTree: navTreeRoot,
  };
}

function processBookAndLineWork(
  fullWork: HypotacticParsedJson
): ProcessedWork2 {
  const pages: ProcessedWork2["pages"] = [];
  const navTreeRoot: NavTreeNode = {
    id: [],
    children: [],
  };
  const info = extractInfo(fullWork);
  const title = info.title;
  const unpluralizedTitle = title.slice(
    0,
    title.endsWith("s") ? -1 : title.length
  );
  const rows: ProcessedWork2["rows"] = [];
  for (const work of fullWork.works) {
    assertEqual(title, work.title);
    for (const poem of work.poems) {
      assert(poem.title.startsWith(unpluralizedTitle));
      const bookId = checkPresent(
        safeParseInt(poem.title.substring(title.length).trim())
      ).toString();
      navTreeRoot.children.push({ id: [bookId], children: [] });
      const pageStart = rows.length;
      rows.push(...processPoemContent(poem.content, [bookId]));
      pages.push({ id: [bookId], rows: [pageStart, rows.length] });
    }
  }
  return {
    info,
    textParts: ["book", "line"],
    rows,
    pages,
    navTree: navTreeRoot,
  };
}

function isSupportedWork(author: string, title: string): boolean {
  for (const [supportedAuthor, supportedTitle] of SUPPORTED_WORKS) {
    if (author === supportedAuthor && title === supportedTitle) {
      return true;
    }
  }
  return false;
}

function isUnsupportedWork(author: string, title: string): boolean {
  for (const [unsupportedAuthor, unsupportedTitle] of UNSUPPORTED_WORKS) {
    if (author === unsupportedAuthor && title === unsupportedTitle) {
      return true;
    }
  }
  return false;
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
      if (!isSupportedWork(author, title)) {
        assert(isUnsupportedWork(author, title));
        continue;
      }
      if (isOnlyLinesWork(work)) {
        processedWorks.push(processOnlyLinesWork(work));
        continue;
      }
      if (isPoemAndLineWork(work)) {
        processedWorks.push(processPoemAndLineWork(work));
        continue;
      }
      if (hasMultiPoem(work)) {
        processedWorks.push(processBookPoemAndLineWork(work));
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
