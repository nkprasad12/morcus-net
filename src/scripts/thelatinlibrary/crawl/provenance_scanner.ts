import {
  getAttr,
  isElement,
  normalizeSpace,
  parseBody,
  textOf,
  type HtmlElement,
  type HtmlNode,
} from "@/scripts/thelatinlibrary/html";

export interface ProvenanceScanResult {
  provenance: "noStatement" | "statementFound";
  provenanceClassification: "none" | "pre1930" | "post1930_or_copyright";
  provenanceStatements: string[];
  statedEdition: string | null;
  excluded: boolean;
  exclusionReason?: string;
}

const EDITION_SOURCE_PATTERN =
  /\b(?:edidit|ediderunt|ex\s+recensione|recensuit|recognovit|edited\s+by|edition|transcribed\s+by|prepared\s+by|source\s*:|text\s+from|taken\s+from|from\s+the\s+edition|teubner|loeb|oxonii|clarendon|migne|patrologia|csel|mgh|monumenta\s+germaniae|berlin\s*:|leipzig\s*:|lipsiae|mommsen|krueger|mueller|halm|kempf|divjak)\b/i;

const COPYRIGHT_PERMISSION_PATTERN =
  /(?:©|\b(?:copyright|all\s+rights\s+reserved|permission|by\s+permission|reprinted\s+with)\b)/i;

const POST_1930_YEAR_PATTERN = /\b(19[3-9]\d|20[0-2]\d)\b/;

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
 * Known post-1930 or copyrighted works identified in the stage-4 audit
 * (`verified_audit_v2.json`), keyed by normalized relative path under `raw/`.
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

interface CuratedProvenanceRule {
  pattern: RegExp;
  classification: "MODERN" | "PRE_CUTOFF";
  edition: string;
  year: number | null;
  evidence: string;
}

const CURATED_PROVENANCE_RULES: readonly CuratedProvenanceRule[] = [
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

/**
 * Decodes raw HTML bytes as UTF-8 unless `<meta charset>` specifies
 * ISO-8859-1 / windows-1252, falling back to windows-1252 on invalid UTF-8.
 */
export function decodeHtmlBytes(bytes: Buffer | Uint8Array): string {
  const head = Buffer.from(
    bytes.buffer,
    bytes.byteOffset,
    Math.min(bytes.byteLength, 1024)
  ).toString("latin1");
  if (/charset\s*=\s*["']?(?:iso-8859-1|windows-1252)/i.test(head)) {
    return new TextDecoder("windows-1252").decode(bytes);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/**
 * Known pre-1930 editions for pilot works whose pages do not carry an explicit
 * inline edition banner.
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

/**
 * Recursively collects all elements under `root` matching `pred` in document order.
 */
export function collectElements(
  root: HtmlElement,
  pred: (el: HtmlElement) => boolean
): HtmlElement[] {
  const out: HtmlElement[] = [];
  const walk = (node: HtmlNode) => {
    if (!isElement(node)) {
      return;
    }
    if (pred(node)) {
      out.push(node);
    }
    for (const child of node.childNodes) {
      walk(child);
    }
  };
  walk(root);
  return out;
}

/**
 * Extracts `bodyText`, `paragraphsText`, `title`, and internal links from raw HTML
 * using `parseBody` from `src/scripts/thelatinlibrary/html.ts`.
 */
export function extractRawPageText(rawHtml: string): {
  bodyText: string;
  paragraphsText: string[];
  title?: string;
  links: string[];
} {
  const body = parseBody(rawHtml);
  const bodyText = textOf(body);
  const paragraphsText = collectElements(
    body,
    (el) => el.tagName === "p" || el.tagName === "div"
  )
    .map((el) => textOf(el))
    .filter((t) => t.length > 0);

  const headingEl = collectElements(
    body,
    (el) =>
      el.tagName === "h1" ||
      (el.tagName === "p" &&
        (getAttr(el, "class") ?? "").split(/\s+/).includes("pagehead"))
  )[0];
  const title = headingEl ? textOf(headingEl) || undefined : undefined;

  const links = collectElements(body, (el) => el.tagName === "a")
    .map((el) => getAttr(el, "href"))
    .filter((href): href is string => href !== undefined && href.length > 0);

  return { bodyText, paragraphsText, title, links };
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
 * Scans a Latin Library page for edition, provenance, and copyright/post-1930
 * statements (Decision #20).
 */
export function scanPageProvenance(
  pagePath: string,
  bodyText: string,
  paragraphsText: readonly string[]
): ProvenanceScanResult {
  const normPath = normalizePagePath(pagePath);
  const knownPost1930Reason = KNOWN_POST_1930_PAGES[normPath];
  const curatedRule = CURATED_PROVENANCE_RULES.find((r) =>
    r.pattern.test(normPath)
  );

  const fullMatchedParagraphs: string[] = [];
  const matchedStatements: string[] = [];
  const seen = new Set<string>();

  const addCandidate = (raw: string) => {
    const cleaned = normalizeSpace(raw);
    if (!cleaned || isBoilerplateNav(cleaned)) {
      return;
    }
    fullMatchedParagraphs.push(cleaned);
    const clipped =
      cleaned.length > 600 ? cleaned.slice(0, 597) + "..." : cleaned;
    if (!seen.has(clipped)) {
      seen.add(clipped);
      matchedStatements.push(clipped);
    }
  };

  for (const para of paragraphsText) {
    if (
      EDITION_SOURCE_PATTERN.test(para) ||
      COPYRIGHT_PERMISSION_PATTERN.test(para)
    ) {
      addCandidate(para);
    }
  }

  if (matchedStatements.length === 0 && bodyText.trim().length > 0) {
    for (const pattern of [
      EDITION_SOURCE_PATTERN,
      COPYRIGHT_PERMISSION_PATTERN,
    ]) {
      const m = pattern.exec(bodyText);
      if (m !== null) {
        const start = Math.max(0, m.index - 80);
        const end = Math.min(bodyText.length, m.index + 240);
        addCandidate(bodyText.slice(start, end));
      }
    }
  }

  const knownEdition = lookupKnownEdition(normPath);

  if (curatedRule?.classification === "PRE_CUTOFF") {
    return {
      provenance:
        matchedStatements.length > 0 ? "statementFound" : "noStatement",
      provenanceClassification: "pre1930",
      provenanceStatements:
        matchedStatements.length > 0
          ? matchedStatements
          : [curatedRule.evidence],
      statedEdition: curatedRule.edition,
      excluded: false,
    };
  }

  if (curatedRule?.classification === "MODERN") {
    return {
      provenance: "statementFound",
      provenanceClassification: "post1930_or_copyright",
      provenanceStatements:
        matchedStatements.length > 0
          ? matchedStatements
          : [curatedRule.evidence],
      statedEdition: null,
      excluded: true,
      exclusionReason: curatedRule.evidence,
    };
  }

  // Check full unclipped paragraphs for copyright or post-1930 years
  let hasCopyright = false;
  let post1930Year: string | null = null;
  for (const stmt of fullMatchedParagraphs) {
    if (COPYRIGHT_PERMISSION_PATTERN.test(stmt)) {
      hasCopyright = true;
    }
    const yearMatch = POST_1930_YEAR_PATTERN.exec(stmt);
    if (yearMatch !== null && post1930Year === null) {
      post1930Year = yearMatch[1];
    }
  }

  if (
    knownPost1930Reason !== undefined ||
    hasCopyright ||
    post1930Year !== null
  ) {
    const reasons: string[] = [];
    if (knownPost1930Reason !== undefined) {
      reasons.push(knownPost1930Reason);
    }
    if (hasCopyright) {
      reasons.push("Copyright or permission notice detected");
    }
    if (post1930Year !== null) {
      reasons.push(
        `Post-1930 publication/edition year (${post1930Year}) detected`
      );
    }
    return {
      provenance:
        matchedStatements.length > 0 ? "statementFound" : "noStatement",
      provenanceClassification: "post1930_or_copyright",
      provenanceStatements: matchedStatements,
      statedEdition: knownEdition,
      excluded: true,
      exclusionReason: reasons.join("; "),
    };
  }

  if (matchedStatements.length > 0) {
    const shortBanner =
      matchedStatements[0].length <= 250 ? matchedStatements[0] : null;
    return {
      provenance: "statementFound",
      provenanceClassification: "pre1930",
      provenanceStatements: matchedStatements,
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
