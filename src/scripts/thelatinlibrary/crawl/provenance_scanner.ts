import { parse } from "parse5";
import {
  createParse5BodyParser,
  decodeLatinLibraryHtmlBytes,
  extractText,
  findElements,
  getAttr,
  hasClass,
  isElement,
  isText,
  normalizeSpace,
  parseHtmlToMinimalBody,
  sniffDeclaredCharset,
  type MinimalChildNode,
  type MinimalElementNode,
} from "@/common/thelatinlibrary";

export interface ProvenanceScanResult {
  provenance: "noStatement" | "statementFound";
  provenanceClassification: "none" | "pre1930" | "post1930_or_copyright";
  provenanceStatements: string[];
  statedEdition: string | null;
  excluded: boolean;
  exclusionReason?: string;
}

/**
 * Editions published in or before this year are treated as public domain
 * (US copyright runs 95 years from publication, so 1930 editions became public
 * domain on 2026-01-01). Any edition, translation or copyright year after it
 * excludes the page. Used both by the heuristic scan and to check the curated
 * rules below, so the two can't disagree.
 */
export const PUBLIC_DOMAIN_CUTOFF_YEAR = 1930;

const EDITION_SOURCE_PATTERN =
  /\b(?:edidit|ediderunt|ex\s+recensione|recensuit|recognovit|edited\s+by|edition|transcribed\s+by|prepared\s+by|source\s*:|text\s+from|taken\s+from|from\s+the\s+edition|teubner|loeb|oxonii|clarendon|migne|patrologia|csel|mgh|monumenta\s+germaniae|berlin\s*:|leipzig\s*:|lipsiae|mommsen|krueger|mueller|halm|kempf|divjak)\b/gi;

const COPYRIGHT_PERMISSION_PATTERN =
  /(?:©|\b(?:copyright|all\s+rights\s+reserved|permission|by\s+permission|reprinted\s+with)\b)/gi;

/** An Arabic or Roman-numeral year (e.g. `1887`, `MDCCCLXXXVII`). */
const EDITION_YEAR_PATTERN = /\b(?:1[5-9]\d\d|20\d\d|M[DCLXVI]{3,})\b/;

/** Four-digit years a modern edition note could plausibly name. */
const YEAR_PATTERN = /\b(1[5-9]\d\d|20\d\d)\b/g;

/**
 * How far before and after an edition or copyright match a year still counts
 * as that statement's year. Years further away are usually line numbers,
 * dates in the text itself, or an unrelated note.
 */
const YEAR_WINDOW_BEFORE = 40;
const YEAR_WINDOW_AFTER = 120;

/**
 * A year that is the first number within 50 characters after one of these
 * describes the digital transcription, not the edition, e.g. `"Transcribed by
 * Roger Pearse, 2002"` after `"Text edited by F. Oehler, 1851."`.
 */
const TRANSCRIPTION_YEAR_CONTEXT =
  /\b(?:transcribed|scanned|typed|keyed|submitted|proof-?read|revised|encoded|digiti[sz]ed|html|chapter\s+divisions)\b[^0-9]{0,50}$/i;

const BOILERPLATE_NAV_STRINGS = new Set([
  "the latin library",
  "the classics page",
  "neo-latin",
  "medieval latin",
  "christian latin",
  "ius romanum",
  "the bible",
  "miscellaneous",
  "indices",
]);

/**
 * Known post-1930 or copyrighted works identified by the coverage audit
 * (`audit/verified_audit_v2.json`), keyed by normalized relative path under
 * `raw/`.
 */
export const KNOWN_POST_1930_PAGES: Readonly<Record<string, string>> = {
  "augustine/epist.firmus.html":
    "Augustine Epistula 1A* / 2* Divjak (first published 1981; post-1930 edition)",
  "augustine/epistula.shtml":
    "Augustine Epistula 1A* / 2* Divjak (first published 1981; post-1930 edition)",
  "augustine/epistula.html":
    "Augustine Epistula 1A* / 2* Divjak (first published 1981; post-1930 edition)",
  "jfkhonor.html":
    "1963 Free University of Berlin diploma for J. F. Kennedy (post-1930)",
  "declaratio.html":
    "1948 Universal Declaration of Human Rights Latin translation (post-1930)",
  "ency.fides.html":
    "1998 Pope John Paul II encyclical Fides et Ratio (post-1930)",
  "bill.rights.html":
    "Modern Neo-Latin translation of the U.S. Bill of Rights (post-1930)",
  "alice/alice1.html":
    "1964 Clive Harcourt Carruthers Latin translation of Alice in Wonderland (post-1930)",
  "alice/alice2.html":
    "1964 Clive Harcourt Carruthers Latin translation of Alice in Wonderland (post-1930)",
  "alice/alice3.html":
    "1964 Clive Harcourt Carruthers Latin translation of Alice in Wonderland (post-1930)",
  "alice/alice4.html":
    "1964 Clive Harcourt Carruthers Latin translation of Alice in Wonderland (post-1930)",
  "alice/alice5.html":
    "1964 Clive Harcourt Carruthers Latin translation of Alice in Wonderland (post-1930)",
  "alice/alice6.html":
    "1964 Clive Harcourt Carruthers Latin translation of Alice in Wonderland (post-1930)",
};

export interface CuratedProvenanceRule {
  pattern: RegExp;
  classification: "MODERN" | "PRE_CUTOFF";
  edition: string;
  year: number | null;
  evidence: string;
}

export const CURATED_PROVENANCE_RULES: readonly CuratedProvenanceRule[] = [
  {
    pattern: /^albertanus\/albertanus[1-4]\.s?html$/i,
    classification: "MODERN",
    edition: "Sharon L. Hiltz (Romino)",
    year: 1980,
    evidence:
      "This text copyright © 1980 Sharon Lynne Hiltz and copyright © 2000 Sharon Hiltz Romino",
  },
  {
    pattern: /^albertanus\/albertanus\.sermo\d\.s?html$/i,
    classification: "MODERN",
    edition: "Gregory W. Ahlquist",
    year: 1997,
    evidence:
      "Latin edition and English translation Copyright © 1997, 2000 Gregory Wayne Ahlquist",
  },
  {
    pattern: /^augustine\/conf\d+\.s?html$/i,
    classification: "MODERN",
    edition: "J. J. O'Donnell, Oxford",
    year: 1992,
    evidence:
      "Submitted by James J. O'Donnell (Univ. of Pennsylvania) from his new edition",
  },
  {
    pattern: /^apuleius\/apuleius\.apol\.s?html$/i,
    classification: "MODERN",
    edition: "V. Hunink, Amsterdam (Gieben)",
    year: 1997,
    evidence:
      "Pro se de magia (Apologia), edited with a commentary by Vincent Hunink, Amsterdam 1997",
  },
  {
    pattern: /^histapoll\.s?html$/i,
    classification: "MODERN",
    edition: "F. P. Waiblinger, München",
    year: 1994,
    evidence:
      "Herausgegeben und übersetzt von Franz Peter Waiblinger. München 1994, with permission",
  },
  {
    pattern: /^perp\.s?html$/i,
    classification: "MODERN",
    edition: "H. Musurillo, The Acts of the Christian Martyrs, Oxford",
    year: 1972,
    evidence:
      "This text is taken from The Acts of the Christian Martyrs, ed. H. Musurillo. Oxford 1972",
  },
  {
    pattern: /^jerome\/vitapauli\.s?html$/i,
    classification: "MODERN",
    edition: "V. Hunink (after Degórski 1987), Leuven",
    year: 2002,
    evidence:
      "Latin text from: Hieronymus, Vita Pauli, Vincent Hunink, Leuven 2002",
  },
  {
    pattern: /^bible\/prologi\.s?html$/i,
    classification: "MODERN",
    edition:
      "R. Weber, Biblia Sacra iuxta Vulgatam versionem, Stuttgart, 3rd ed.",
    year: 1983,
    evidence:
      "From R. Weber, Biblia Sacra iuxta Vulgatam versionem, Stuttgart, 3rd edition (1983)",
  },
  {
    pattern: /^mirabilia\.s?html$/i,
    classification: "MODERN",
    edition: "C. D'Onofrio, Visitiamo Roma mille anni fa, Roma",
    year: 1988,
    evidence:
      "© Cesare D'Onofrio, Visitiamo Roma mille anni fa. La città dei Mirabilia (Roma 1988)",
  },
  {
    pattern: /^(?:fletcher|milton\.quintnov)\.s?html$/i,
    classification: "MODERN",
    edition: "D. F. Sutton, Neo-Latin texts (Philological Museum)",
    year: 1999,
    evidence:
      "submitted by Dana F. Sutton (University of California, Irvine), from his Neo-Latin collection",
  },
  {
    pattern: /^boskovic\.s?html$/i,
    classification: "MODERN",
    edition: "N. Jovanović (from Carmina recentiorum poetarum VII)",
    year: 1999,
    evidence: "Hanc editionem anno 1999 Neven Jovanovic curavit",
  },
  {
    pattern: /^tertullian\/tertullian\.carne\.s?html$/i,
    classification: "MODERN",
    edition: "E. Evans",
    year: 1956,
    evidence:
      "Text edited by Ernest Evans (1956). Transcribed by Roger Pearse (2002)",
  },
  {
    pattern: /^tertullian\/tertullian\.marcionem\d\.s?html$/i,
    classification: "MODERN",
    edition: "E. Evans, Oxford",
    year: 1972,
    evidence: "Edited by Ernest Evans, 1972. Transcribed by Roger Pearse, 2002",
  },
  {
    pattern: /^tertullian\/tertullian\.herm\.s?html$/i,
    classification: "MODERN",
    edition: "J. H. Waszink",
    year: 1956,
    evidence: "Text edited by J.H. Waszink, 1956",
  },
  {
    pattern: /^tertullian\/tertullian\.anima\.s?html$/i,
    classification: "MODERN",
    edition: "J. H. Waszink",
    year: 1947,
    evidence: "Text edited by J.H. Waszink (1947 / CCSL 1954)",
  },
  {
    pattern: /^tertullian\/tertullian\.fuga\.s?html$/i,
    classification: "MODERN",
    edition: "V. Bulhart",
    year: 1957,
    evidence: "Text edited by V. Bulhart (1957)",
  },
  {
    pattern: /^tertullian\/tertullian\.virginibus\.s?html$/i,
    classification: "MODERN",
    edition: "V. Bulhart",
    year: 1957,
    evidence: "Text and apparatus edited by V. Bulhart, 1957",
  },
  {
    pattern: /^tertullian\/tertullian\.cultu[12]\.s?html$/i,
    classification: "MODERN",
    edition: "M. Turcan",
    year: 1971,
    evidence: "Text edited by Marie Turcan (1971)",
  },
  {
    pattern: /^tertullian\/tertullian\.patientia\.s?html$/i,
    classification: "MODERN",
    edition: "J.-C. Fredouille (Sources Chrétiennes)",
    year: 1984,
    evidence: "Text edited by Jean-Claude Fredouille (SC 310, 1984)",
  },
  {
    pattern: /^tertullian\/tertullian\.pudicitia\.s?html$/i,
    classification: "MODERN",
    edition: "C. Munier",
    year: 1993,
    evidence: "Text edited by Charles Munier (1993)",
  },
  {
    pattern: /^tertullian\/tertullian\.iudaeos\.s?html$/i,
    classification: "MODERN",
    edition: "H. Tränkle",
    year: 1964,
    evidence: "Edited by H. Tränkle, 1964",
  },
  {
    pattern: /^tertullian\/tertullian\.(?:oratione|scapulam)\.s?html$/i,
    classification: "MODERN",
    edition: "E. Dekkers (CCSL)",
    year: 1954,
    evidence: "Edited by Dom. E. Dekkers, 1954",
  },
  {
    pattern: /^tertullian\/tertullian\.paen\.s?html$/i,
    classification: "MODERN",
    edition: "J. G. Ph. Borleffs",
    year: 1957,
    evidence: "Text edited J.G.Ph. Borleffs, 1957",
  },
  {
    pattern: /^tertullian\/tertullian\.pallio\.s?html$/i,
    classification: "MODERN",
    edition: "A. Gerlo (CCSL)",
    year: 1954,
    evidence: "Text edited by A. Gerlo, 1954",
  },
  {
    pattern: /^tertullian\/tertullian\.praescrip\.s?html$/i,
    classification: "MODERN",
    edition: "R. F. Refoulé (Sources Chrétiennes)",
    year: 1957,
    evidence: "Edited by R.F. Refoulé, Sources Chrétiennes, 1957",
  },
  {
    pattern: /^tertullian\/tertullian\.castitatis\.s?html$/i,
    classification: "MODERN",
    edition: "C. Moreschini (SC 319)",
    year: 1985,
    evidence: "Text edited by Claudio Moreschini, SC319, Paris: Cerf, 1985",
  },
  {
    pattern: /^tertullian\/tertullian\.corona\.s?html$/i,
    classification: "MODERN",
    edition: "J. Fontaine (PUF)",
    year: 1966,
    evidence:
      "Latin text from Jacques Fontaine's version for Presses Universitaires de France (1966)",
  },
  {
    pattern: /^tertullian\/tertullian\.(?:monog|resurrectione)\.s?html$/i,
    classification: "MODERN",
    edition: "Unstated; scanned by R. Pearse 2003 alongside CCSL texts",
    year: null,
    evidence:
      "Scanned by Roger Pearse, Ipswich, 2003 (companion scans are CCSL 1954 texts)",
  },
  {
    pattern: /^tertullian\/tertullian\.(?:idololatria|scorpiace)\.s?html$/i,
    classification: "PRE_CUTOFF",
    edition: "A. Reifferscheid & G. Wissowa (CSEL 20, 1890)",
    year: 1890,
    evidence:
      "Latin text from the edition of A. Reifferscheid, G. Wissowa, 1890",
  },
  {
    pattern: /^tertullian\/tertullian\.(?:gentium|haereses)\.s?html$/i,
    classification: "PRE_CUTOFF",
    edition: "F. Oehler (1851)",
    year: 1851,
    evidence: "Text edited by F. Oehler, 1851",
  },
  {
    pattern: /^solinus\d?a?\.s?html$/i,
    classification: "PRE_CUTOFF",
    edition: "T. Mommsen, Berlin (1864)",
    year: 1864,
    evidence:
      "Prepared and proof-read by John White from T.H. Mommsen's edition, Bernolini, 1864",
  },
  {
    pattern: /^iordanes2\.s?html$/i,
    classification: "PRE_CUTOFF",
    edition: "T. Mommsen (MGH AA 5.1, 1882)",
    year: 1882,
    evidence: "(ed. Mommsen, 1882)",
  },
  {
    pattern: /^histbrit\.s?html$/i,
    classification: "PRE_CUTOFF",
    edition: "T. Mommsen (MGH, 1898)",
    year: 1898,
    evidence: "edited by Theodore Mommsen",
  },
  {
    pattern: /^xanten\.s?html$/i,
    classification: "PRE_CUTOFF",
    edition: "B. von Simson (MGH SRG, 1909)",
    year: 1909,
    evidence: "Berolini ... anni 1909",
  },
  {
    pattern: /^magnacarta\.s?html$/i,
    classification: "PRE_CUTOFF",
    edition: "C. Bémont, Chartes des libertés anglaises, Paris (1892)",
    year: 1892,
    evidence:
      "Transcribed from Charles Bémont, Chartes des libertés anglaises (1100-1305), Paris, 1892",
  },
  {
    pattern: /^dante\/ep\.s?html$/i,
    classification: "PRE_CUTOFF",
    edition: "E. Pistelli (Società Dantesca Italiana, 1921)",
    year: 1921,
    evidence:
      "Secondo il testo curato da Ermenegildo Pistelli per l'edizione della Società Dantesca Italiana, 1921",
  },
  {
    pattern: /^vegius\.s?html$/i,
    classification: "PRE_CUTOFF",
    edition: "A. C. Brinton, Stanford (1930, from editio princeps 1471)",
    year: 1930,
    evidence:
      "From the editio princeps (Venice, 1471), edited by Brinton (1930)",
  },
  {
    pattern: /^thomasedessa\.s?html$/i,
    classification: "PRE_CUTOFF",
    edition: "S. J. Carr (1898)",
    year: 1898,
    evidence: "Latin translation published 1898 by Simon Joseph Carr",
  },
];

const UTF16_LABELS = new Set(["utf-16", "utf-16le", "utf-16be"]);

function hasByteOrderMark(bytes: Uint8Array): boolean {
  return (
    (bytes[0] === 0xff && bytes[1] === 0xfe) ||
    (bytes[0] === 0xfe && bytes[1] === 0xff) ||
    (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
  );
}

/**
 * Decodes the raw bytes of a Latin Library page with the shared page layer's
 * decoder, honouring the charset from the HTTP `Content-Type` header recorded
 * by the crawler. The header is used only when the page itself declares no
 * `<meta charset>` (the page's own declaration is more specific than a
 * server-wide default); UTF-8 and UTF-16 are left to the shared decoder, which
 * handles byte-order marks and invalid UTF-8.
 */
export function decodeRawPageBytes(
  bytes: Uint8Array,
  httpCharset?: string
): string {
  const label = httpCharset?.trim().toLowerCase();
  if (
    label !== undefined &&
    label.length > 0 &&
    !label.startsWith("utf-8") &&
    !UTF16_LABELS.has(label) &&
    !hasByteOrderMark(bytes) &&
    sniffDeclaredCharset(bytes) === undefined
  ) {
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      // Unknown label: fall through to the shared decoder.
    }
  }
  return decodeLatinLibraryHtmlBytes(bytes);
}

/**
 * Known pre-1930 editions for onboarded works whose pages do not carry an
 * explicit inline edition banner.
 */
export function lookupKnownEdition(pagePath: string): string | null {
  const norm = normalizePagePath(pagePath);
  if (/^justinian\/digest\d+\.s?html$/i.test(norm)) {
    return "Mommsen-Krueger (Digesta Iustiniani Augusti, Berlin, 1870)";
  }
  if (norm === "justin/prologi.html") {
    return "Ruehl / Jeep (Teubner, Leipzig, 1886)";
  }
  return null;
}

export function normalizePagePath(pagePath: string): string {
  return pagePath.replace(/^\/+/, "").replace(/^raw\//, "");
}

const parse5BodyParser = createParse5BodyParser(parse);

/** Elements whose start and end separate text blocks. */
const BLOCK_BOUNDARY_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "body",
  "caption",
  "center",
  "dd",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

const INVISIBLE_TAGS = new Set(["script", "style", "noscript", "template"]);

/**
 * Whether `el` is a verse line number such as
 * `<span style="font-size: 80%;">1930</span>` (Seneca, *Hercules Oetaeus*):
 * an inline element whose only visible text is a short number.
 */
function isLineNumberElement(el: MinimalElementNode): boolean {
  if (BLOCK_BOUNDARY_TAGS.has(el.tagName) || el.tagName === "a") {
    return false;
  }
  return /^\[?\d{1,4}\]?$/.test(extractText(el));
}

/**
 * Splits `body` into leaf text blocks: maximal runs of inline content between
 * block boundaries, so a wrapper `<div>` never repeats its children's text and
 * loose text directly under `<body>` still forms its own block. Verse line
 * numbers are dropped.
 */
export function collectLeafBlocks(body: MinimalElementNode): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  const flush = () => {
    const text = normalizeSpace(current.join(""));
    if (text.length > 0) blocks.push(text);
    current = [];
  };
  const walk = (node: MinimalChildNode) => {
    if (isText(node)) {
      current.push(node.value);
      return;
    }
    if (!isElement(node) || INVISIBLE_TAGS.has(node.tagName)) return;
    if (node.tagName === "br") {
      current.push(" ");
      return;
    }
    if (isLineNumberElement(node)) return;
    const boundary = BLOCK_BOUNDARY_TAGS.has(node.tagName);
    if (boundary) flush();
    for (const child of node.childNodes) walk(child);
    if (boundary) flush();
  };
  walk(body);
  flush();
  return blocks;
}

export interface ExtractedRawPage {
  /** All visible text in `<body>`. */
  bodyText: string;
  /** Leaf text blocks in document order (see `collectLeafBlocks`). */
  blocks: string[];
  /** Page heading (`<h1>` or `p.pagehead`), if any. */
  title?: string;
  /** Every non-empty `<a href>` in document order. */
  links: string[];
}

/**
 * Extracts body text, leaf blocks, title and links from a decoded page, using
 * the shared page layer's DOM (parsed with parse5).
 */
export function extractRawPageText(rawHtml: string): ExtractedRawPage {
  const { body } = parseHtmlToMinimalBody(rawHtml, parse5BodyParser);
  const bodyText = extractText(body);
  const blocks = collectLeafBlocks(body);

  const headingEl = findElements(
    body,
    (el) =>
      el.tagName === "h1" || (el.tagName === "p" && hasClass(el, "pagehead"))
  )[0];
  const title = headingEl ? extractText(headingEl) || undefined : undefined;

  const links = findElements(body, (el) => el.tagName === "a")
    .map((el) => getAttr(el, "href"))
    .filter((href): href is string => href !== undefined && href.length > 0);

  return { bodyText, blocks, title, links };
}

function isBoilerplateNav(text: string): boolean {
  const lower = normalizeSpace(text).toLowerCase();
  if (BOILERPLATE_NAV_STRINGS.has(lower)) {
    return true;
  }
  const parts = lower
    .split(/[|•·-]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((p) => BOILERPLATE_NAV_STRINGS.has(p));
}

/**
 * Years after `PUBLIC_DOMAIN_CUTOFF_YEAR` that sit within the window around
 * an edition or copyright match in `block`, skipping transcription years.
 */
function postCutoffYearsNearStatements(block: string): number[] {
  const years: number[] = [];
  for (const pattern of [
    EDITION_SOURCE_PATTERN,
    COPYRIGHT_PERMISSION_PATTERN,
  ]) {
    for (const match of block.matchAll(pattern)) {
      const start = Math.max(0, match.index - YEAR_WINDOW_BEFORE);
      const end = Math.min(
        block.length,
        match.index + match[0].length + YEAR_WINDOW_AFTER
      );
      const window = block.slice(start, end);
      for (const y of window.matchAll(YEAR_PATTERN)) {
        const year = Number(y[1]);
        if (year <= PUBLIC_DOMAIN_CUTOFF_YEAR) continue;
        const before = block.slice(0, start + y.index);
        if (TRANSCRIPTION_YEAR_CONTEXT.test(before)) continue;
        if (!years.includes(year)) years.push(year);
      }
    }
  }
  return years;
}

/**
 * Whether a short statement reads as an edition banner: it names a year or an
 * edition keyword other than the Latin verbs `edidit` / `ediderunt`, which
 * also occur in ordinary text (`"Venus ... risus edidit"`).
 */
function looksLikeEditionBanner(statement: string): boolean {
  if (EDITION_YEAR_PATTERN.test(statement)) return true;
  return matches(
    EDITION_SOURCE_PATTERN,
    statement.replace(/\b(?:edidit|ediderunt)\b/gi, " ")
  );
}

/** Whether `text` matches `pattern` (a global regex) anywhere. */
function matches(pattern: RegExp, text: string): boolean {
  pattern.lastIndex = 0;
  const found = pattern.test(text);
  pattern.lastIndex = 0;
  return found;
}

/**
 * Scans a Latin Library page's leaf text blocks for edition, provenance, and
 * copyright statements, and decides whether the page must be excluded.
 *
 * Curated per-path rules (researched by hand) win over the heuristic. The
 * heuristic excludes a page when a block has a copyright or permission notice,
 * or when a year after `PUBLIC_DOMAIN_CUTOFF_YEAR` appears close to an edition
 * or copyright match in the same block.
 */
export function scanPageProvenance(
  pagePath: string,
  blocks: readonly string[]
): ProvenanceScanResult {
  const normPath = normalizePagePath(pagePath);
  const knownPost1930Reason = KNOWN_POST_1930_PAGES[normPath];
  const curatedRule = CURATED_PROVENANCE_RULES.find((r) =>
    r.pattern.test(normPath)
  );

  const statementBlocks: string[] = [];
  const statements: string[] = [];
  for (const raw of blocks) {
    const block = normalizeSpace(raw);
    if (!block || isBoilerplateNav(block)) continue;
    if (
      !matches(EDITION_SOURCE_PATTERN, block) &&
      !matches(COPYRIGHT_PERMISSION_PATTERN, block)
    ) {
      continue;
    }
    statementBlocks.push(block);
    const clipped = block.length > 600 ? block.slice(0, 597) + "..." : block;
    if (!statements.includes(clipped)) statements.push(clipped);
  }

  const knownEdition = lookupKnownEdition(normPath);

  if (curatedRule?.classification === "PRE_CUTOFF") {
    return {
      provenance: statements.length > 0 ? "statementFound" : "noStatement",
      provenanceClassification: "pre1930",
      provenanceStatements:
        statements.length > 0 ? statements : [curatedRule.evidence],
      statedEdition: curatedRule.edition,
      excluded: false,
    };
  }

  if (curatedRule?.classification === "MODERN") {
    return {
      provenance: "statementFound",
      provenanceClassification: "post1930_or_copyright",
      provenanceStatements:
        statements.length > 0 ? statements : [curatedRule.evidence],
      statedEdition: null,
      excluded: true,
      exclusionReason: curatedRule.evidence,
    };
  }

  const hasCopyright = statementBlocks.some((b) =>
    matches(COPYRIGHT_PERMISSION_PATTERN, b)
  );
  const postCutoffYears = statementBlocks.flatMap(
    postCutoffYearsNearStatements
  );

  if (
    knownPost1930Reason !== undefined ||
    hasCopyright ||
    postCutoffYears.length > 0
  ) {
    const reasons: string[] = [];
    if (knownPost1930Reason !== undefined) {
      reasons.push(knownPost1930Reason);
    }
    if (hasCopyright) {
      reasons.push("Copyright or permission notice detected");
    }
    if (postCutoffYears.length > 0) {
      reasons.push(
        `Post-${PUBLIC_DOMAIN_CUTOFF_YEAR} publication/edition year (${postCutoffYears[0]}) detected`
      );
    }
    return {
      provenance: statements.length > 0 ? "statementFound" : "noStatement",
      provenanceClassification: "post1930_or_copyright",
      provenanceStatements: statements,
      statedEdition: knownEdition,
      excluded: true,
      exclusionReason: reasons.join("; "),
    };
  }

  if (statements.length > 0) {
    const shortBanner =
      statements[0].length <= 250 && looksLikeEditionBanner(statements[0])
        ? statements[0]
        : null;
    return {
      provenance: "statementFound",
      provenanceClassification: "pre1930",
      provenanceStatements: statements,
      statedEdition: knownEdition ?? shortBanner,
      excluded: false,
    };
  }

  return {
    provenance: "noStatement",
    provenanceClassification: "none",
    provenanceStatements: [],
    statedEdition: knownEdition,
    excluded: false,
  };
}
