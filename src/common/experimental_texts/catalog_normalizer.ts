/**
 * Normalizes the `author` and `title` of Experimental Texts catalog entries at build
 * time, for both Patrologia Latina (`catalog_builder.ts`) and The Latin
 * Library (`latin_library_catalog.ts`).
 *
 * The upstream metadata spells one author many ways (`Augustinus`,
 * `Augustine, Saint`; `Isidorus Hispalensis`, `Isidorus Hispaliensis`,
 * `Isidore of Seville`), prefixes popes and saints with honorifics (`SS`,
 * `St.`), has typos and broken names (`Anomynus`, `withof7`,
 * `Boethius. Severinus`), and gives many titles in OCR'd ALL CAPS. This pass:
 *
 * 1. maps every spelling of an author to one display name, matching the
 *    curated `/library` where the author is in both;
 * 2. folds the anonymous and collective authors into `Anonymous / Incertus`
 *    and `Auctores Varii`, moving any qualifier (`Anonymous (Roman Law)`)
 *    into the title so no attribution context is lost;
 * 3. keeps the original spelling and the known Latin / English names of an
 *    author in `authorAliases`, so search still finds `Hieronymus` under
 *    `Jerome`;
 * 4. Title-Cases ALL-CAPS titles (keeping Roman numerals), fixes known OCR
 *    typos, and collapses `Title / TITLE AND MORE` pairs.
 *
 * Every function here is idempotent: normalizing a normalized entry is a
 * no-op.
 */

import type { ExperimentalTextCatalogEntry } from "@/common/experimental_texts/catalog_types";

/** The single display name for every anonymous or uncertain author. */
export const ANONYMOUS_AUTHOR = "Anonymous / Incertus";

/** The single display name for collective (multi-author) works. */
export const COLLECTIVE_AUTHOR = "Auctores Varii";

const EN_NUMERIC_COLLATOR = new Intl.Collator("en", { numeric: true });

interface AuthorRule {
  /** The display name. */
  readonly author: string;
  /**
   * Attribution context that would be lost by the rename (e.g. the
   * `Cyprianus Gallus` in `Pseudo-Tertullian (Cyprianus Gallus)`); appended
   * to the title as ` (<qualifier>)` unless the title already mentions it.
   */
  readonly titleQualifier?: string;
}

/**
 * Exact author spellings (after honorific prefixes are stripped) and the
 * display name each maps to.
 */
const AUTHOR_RULES: Readonly<Record<string, AuthorRule | string>> = {
  // Collective and anonymous authors.
  "AA VV": COLLECTIVE_AUTHOR,
  "AA VV (Auctores Varii)": COLLECTIVE_AUTHOR,
  "Anonymous / Various": COLLECTIVE_AUTHOR,
  Anonymous: ANONYMOUS_AUTHOR,
  Anonymus: ANONYMOUS_AUTHOR,
  Anomynus: ANONYMOUS_AUTHOR,
  Incertus: ANONYMOUS_AUTHOR,
  "Auctor Incertus": ANONYMOUS_AUTHOR,
  "Incertus, Augustinus? Hieronymus?": {
    author: ANONYMOUS_AUTHOR,
    titleQualifier: "Augustinus? Hieronymus?",
  },
  "(S. Benedictus Discipulus?)": {
    author: "Marcus Cassinensis",
    titleQualifier: "attr. S. Benedicti Discipulus",
  },
  "Anonymus Neveleti (Gualterus Anglicus)":
    "Gualterus Anglicus (Anonymus Neveleti)",

  // One author across Patrologia Latina, The Latin Library and `/library`.
  Augustinus: "Augustine",
  "Augustine, Saint": "Augustine",
  "Augustinus (pseudo)": "Pseudo-Augustinus",
  Hieronymus: "Jerome",
  "Jerome, Saint (Eusebius Hieronymus)": "Jerome",
  "Pseudo-Hieronymus / Auctor incertus (Hieronymus Stridonensis?)":
    "Pseudo-Hieronymus",
  Ambrosius: "Ambrosius Mediolanensis (Saint Ambrose)",
  "Ambrose, Saint (Ambrosius Mediolanensis)":
    "Ambrosius Mediolanensis (Saint Ambrose)",
  Tertullianus: "Tertullian",
  "Pseudo-Tertullian (Cyprianus Gallus)": {
    author: "Pseudo-Tertullian",
    titleQualifier: "Cyprianus Gallus",
  },
  "Pseudo-Tertullian (Pseudo-Cyprian)": {
    author: "Pseudo-Tertullian",
    titleQualifier: "Pseudo-Cyprian",
  },
  "Isidorus Hispalensis": "Isidorus Hispalensis (Isidore of Seville)",
  "Isidorus Hispaliensis": "Isidorus Hispalensis (Isidore of Seville)",
  "Isidore of Seville": "Isidorus Hispalensis (Isidore of Seville)",
  "Boethius. Severinus": "Boethius",
  "Gregorius I Magnus": "Gregorius I Magnus (Gregory the Great)",
  "Gregorius I (Gregory the Great)": "Gregorius I Magnus (Gregory the Great)",
  "Gregorius Turonensis Episcopus": "Gregorius Turonensis (Gregory of Tours)",
  "Gregory of Tours": "Gregorius Turonensis (Gregory of Tours)",
  "Hilarius Pictaviensis": "Hilarius Pictaviensis (Hilary of Poitiers)",
  "Cassiodorus Vivariensis Abbas": "Cassiodorus",
  "Leo I. Magnus": "Leo I Magnus (Leo the Great)",
  "Pope Leo I (Leo the Great)": "Leo I Magnus (Leo the Great)",
  "Lactantius (Lucius Caecilius Firmianus Lactantius)": "Lactantius",
  "Lactantius (attrib.)": { author: "Lactantius", titleQualifier: "attrib." },
  Orosius: "Paulus Orosius",
  "Sedulius (Coelius Sedulius)": "Coelius Sedulius",
  "Venantius Fortunatus Episcopus": "Venantius Fortunatus",
  Alcuinus: "Alcuinus (Alcuin of York)",
  "Alcuin of York (and Fredugis)": "Alcuinus (Alcuin of York)",
  'Antonius "attributed"/Paulinus of Nola': {
    author: "Paulinus of Nola",
    titleQualifier: "attr. Antonius",
  },
  "Eucherius Lugdonensis Episcopus": "Eucherius of Lyon",
  "Martinus Dumiensis Episcopus Bracarensis":
    "Martin of Braga (Martinus Bracarensis)",
  "Commodianus Gazaeus": "Commodianus",

  // Authors also in the curated `/library`, under its names.
  "Apicius (M. Gavius Apicius)": "Apicius",
  "Ausonius Decius": "Decimus Magnus Ausonius",
  "Pseudo-Ausonius (Decimus Magnus Ausonius, attr.)": "Pseudo-Ausonius",
  "T. Calpurnius Siculus": "Calpurnius Siculus",
  "M. Porcius Cato (Cato the Elder)": "Marcus Porcius Cato (Cato the Elder)",
  "L. Iunius Moderatus Columella": "Columella",
  "Claudius Caesar Germanicus": "Germanicus",
  "Iustinianus (Corpus Iuris Civilis)": "Justinian",
  "Justinianus Imperator": "Justinian",
  "L. Annaeus Seneca (Seneca the Younger)": "Seneca the Younger",
  "L. Annaeus Seneca Maior (Seneca the Elder)": "Seneca the Elder",
  "Lucan (M. Annaeus Lucanus)": "Lucan",
  "Martial (M. Valerius Martialis)": "Martial",
  "Petronius Arbiter": "Petronius",
  "C. Plinius Secundus (Pliny the Elder)": "Pliny the Elder",
  "C. Plinius Caecilius Secundus (Pliny the Younger)": "Pliny the Younger",
  "Aurelius Prudentius": "Prudentius",
  "C. Sallustius Crispus (Sallust)": "Sallust",
  "Scriptores Historiae Augustae (Aelius Lampridius)":
    "Scriptores Historiae Augustae",
  "Sidonius Apollinaris Episcopus": "Sidonius Apollinaris",

  // Broken or inverted names.
  withof7: "Johann Philipp Lorenz Withof",
  "Tamaius De Vargas. Thomas": "Thomas Tamaius de Vargas",
  "Joannis Marianaeus / Martianaeus, Johannes, 1647-1717?":
    "Johannes Martianaeus",
  "D. Joannis Marianaeus / Martianaeus, Johannes, 1647-1717?":
    "Johannes Martianaeus",
  "Pontius / Pontius Diaconus": "Pontius Diaconus",
  "Prosperus Conversus / Prosper Ex Manichaeo Conversus": "Prosperus Conversus",
};

/**
 * Other names an author is known and searched by, keyed by display name.
 * Only names not already a substring of the display name need listing.
 */
const AUTHOR_ALIASES: Readonly<Record<string, readonly string[]>> = {
  Augustine: ["Augustinus", "Aurelius Augustinus"],
  "Pseudo-Augustinus": ["Augustine"],
  Jerome: ["Hieronymus", "Eusebius Hieronymus"],
  "Pseudo-Hieronymus": ["Jerome"],
  Justinian: ["Iustinianus", "Justinianus"],
  "Pliny the Elder": ["Plinius", "Plinius Secundus"],
  "Pliny the Younger": ["Plinius", "Plinius Caecilius Secundus"],
  Sallust: ["Sallustius", "Sallustius Crispus"],
  "Pseudo-Sallust (C. Sallustius Crispus, attr.)": ["Sallust"],
  Lucan: ["Lucanus", "Annaeus Lucanus"],
  Martial: ["Martialis", "Valerius Martialis"],
  "Seneca the Younger": ["Annaeus Seneca", "Seneca Minor"],
  "Seneca the Elder": ["Annaeus Seneca", "Seneca Maior"],
  [ANONYMOUS_AUTHOR]: ["Anonymus", "Anonymous", "Auctor Incertus"],
  [COLLECTIVE_AUTHOR]: ["Various", "AA VV"],
  Tertullian: ["Tertullianus"],
  "Pseudo-Tertullian": ["Tertullianus"],
  "Ambrosius Mediolanensis (Saint Ambrose)": ["Ambrose of Milan"],
  "Isidorus Hispalensis (Isidore of Seville)": ["Isidorus Hispaliensis"],
  "Gregorius I Magnus (Gregory the Great)": ["Pope Gregory I"],
  "Leo I Magnus (Leo the Great)": ["Pope Leo I"],
  "Hilarius (Pope)": ["Hilarus"],
  Boethius: ["Severinus Boethius", "Boetius"],
  Prudentius: ["Aurelius Prudentius Clemens"],
  Columella: ["Iunius Moderatus Columella"],
  Apicius: ["Gavius Apicius"],
  Petronius: ["Petronius Arbiter"],
  "Decimus Magnus Ausonius": ["Ausonius"],
  "Calpurnius Siculus": ["Titus Calpurnius Siculus"],
  "Marcus Porcius Cato (Cato the Elder)": ["Cato Maior"],
};

/** Honorific prefixes stripped from every author: `St.`, `Sanctus`. */
const HONORIFIC_PREFIX = /^(?:St\.|Sanctus)\s+/;

/** Papal prefix `SS X` (Sanctissimus): mapped to `X (Pope)` unless overridden. */
const PAPAL_PREFIX = /^SS\s+(.+)$/;

/** `Anonymous (Roman Law)`, `Anonymus (Liber Pontificalis)`... */
const QUALIFIED_ANONYMOUS = /^Anonym(?:ous|us)\s*\((.+)\)$/;

export interface NormalizedExperimentalTextAuthor {
  /** The display name. */
  readonly author: string;
  /** Attribution context to carry into the title, if any. */
  readonly titleQualifier?: string;
  /** Other names to match in search: the original spelling and known aliases. */
  readonly aliases: readonly string[];
}

function collapseSpaces(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function lookupAuthorRule(name: string): AuthorRule | undefined {
  const rule = AUTHOR_RULES[name];
  if (rule === undefined) return undefined;
  return typeof rule === "string" ? { author: rule } : rule;
}

function resolveAuthorRule(rawAuthor: string): AuthorRule {
  const exact = lookupAuthorRule(rawAuthor);
  if (exact) return exact;
  const qualified = QUALIFIED_ANONYMOUS.exec(rawAuthor);
  if (qualified) {
    return { author: ANONYMOUS_AUTHOR, titleQualifier: qualified[1].trim() };
  }
  const papal = PAPAL_PREFIX.exec(rawAuthor);
  if (papal) {
    const rest = papal[1].trim();
    const restRule = lookupAuthorRule(rest);
    if (restRule) return restRule;
    const base = rest.replace(/\[([^\]]+)\]/g, "($1)");
    return { author: `${base} (Pope)` };
  }
  const stripped = rawAuthor.replace(HONORIFIC_PREFIX, "");
  if (stripped !== rawAuthor) {
    return resolveAuthorRule(stripped);
  }
  // `Miltiades [Melchiades]` -> `Miltiades (Melchiades)`.
  return { author: rawAuthor.replace(/\[([^\]]+)\]/g, "($1)") };
}

/**
 * The `candidates` worth searching for besides `author`: each once, and none
 * already contained in `author` or in an earlier alias.
 */
function uniqueAliases(
  author: string,
  candidates: readonly string[]
): string[] {
  const out: string[] = [];
  for (const candidate of candidates) {
    const alias = collapseSpaces(candidate);
    if (!alias) continue;
    const lower = alias.toLowerCase();
    if (author.toLowerCase().includes(lower)) continue;
    if (out.some((existing) => existing.toLowerCase().includes(lower))) {
      continue;
    }
    out.push(alias);
  }
  return out;
}

/**
 * Normalizes an upstream author string to its display name, with any title
 * qualifier and search aliases (see the module comment). The upstream
 * spelling is an alias unless only an honorific prefix was dropped.
 */
export function normalizeExperimentalTextAuthor(
  rawAuthor: string
): NormalizedExperimentalTextAuthor {
  const cleaned = collapseSpaces(rawAuthor);
  const rule = resolveAuthorRule(cleaned);
  const keepRaw =
    rule.author !== cleaned &&
    rule.author !== cleaned.replace(HONORIFIC_PREFIX, "");
  const aliases = uniqueAliases(rule.author, [
    ...(keepRaw ? [cleaned] : []),
    ...(AUTHOR_ALIASES[rule.author] ?? []),
  ]);
  return {
    author: rule.author,
    ...(rule.titleQualifier ? { titleQualifier: rule.titleQualifier } : {}),
    aliases,
  };
}

// ---------------------------------------------------------------------------
// Titles
// ---------------------------------------------------------------------------

/** Whole raw titles replaced outright (broken beyond the generic fixes). */
const TITLE_OVERRIDES: Readonly<Record<string, string>> = {
  "JOHANN PHILIPP LORENZ WITHOF DE SCIENTARIUM, IN ANIMI CORPORIQUE ENERVANDO ROBORE, DAMNOSA EFFICACIA":
    "De Scientiarum, in Animi Corporique Enervando Robore, Damnosa Efficacia",
};

/** OCR typos in the upstream ALL-CAPS titles, fixed before casing. */
const TITLE_OCR_FIXES: readonly (readonly [RegExp, string])[] = [
  [/\bGRGORII\b/g, "GREGORII"],
  [/\s*>\s*AUCTOUE\b/g, ", AUCTORE"],
  [/\bAUCTOUE\b/g, "AUCTORE"],
  [/\bEPISTOLX\b/g, "EPISTOLA"],
  [/\bAPENDIX\b/g, "APPENDIX"],
  [/\bDB ESSENTIA\b/g, "DE ESSENTIA"],
  [/\bCURREPTIUNE\b/g, "CORREPTIONE"],
  [/\bBELLOVACENSSEM\b/g, "BELLOVACENSEM"],
  [/([A-Za-z])\.\.(?=\s)/g, "$1."],
];

/** Source citations stripped from PL titles: `Vita Operaque [Ex Fabric Biblioth]`. */
const TITLE_CITATIONS = /\s*\[(?:Ex )?Fabric Biblioth\]/g;

/**
 * Greek capitals that look like Latin ones, as OCR mixes them into Latin
 * words (`EVODIUΜ`, `ΝΟΤITIΑ`).
 */
const GREEK_HOMOGLYPHS: Readonly<Record<string, string>> = {
  Α: "A",
  Β: "B",
  Ε: "E",
  Ζ: "Z",
  Η: "H",
  Ι: "I",
  Κ: "K",
  Μ: "M",
  Ν: "N",
  Ο: "O",
  Ρ: "P",
  Τ: "T",
  Υ: "Y",
  Χ: "X",
};

const LETTER_RUN = /[\p{L}\p{M}]+/gu;
const HAS_LATIN = /[A-Za-zÀ-ÿÆæŒœ]/;
const HAS_GREEK = /[\u0370-\u03ff\u1f00-\u1fff]/;
const HAS_LOWER = /\p{Ll}/u;
const HAS_UPPER = /\p{Lu}/u;

/** Roman numerals, including the `IIII` / `VIIII` forms PL titles use. */
const ROMAN_NUMERAL =
  /^(?=[MDCLXVI])M{0,4}(?:CM|CD|D?C{0,4})(?:XC|XL|L?X{0,4})(?:IX|IV|V?I{0,4})$/;

/** Replaces Greek homoglyphs inside words that are otherwise Latin. */
function fixGreekHomoglyphs(title: string): string {
  return title.replace(LETTER_RUN, (run) =>
    HAS_LATIN.test(run) && HAS_GREEK.test(run)
      ? Array.from(run, (ch) => GREEK_HOMOGLYPHS[ch] ?? ch).join("")
      : run
  );
}

/** A Latin-script word in capitals that isn't a Roman numeral. */
function isCapsWord(run: string): boolean {
  return (
    run.length >= 2 &&
    HAS_LATIN.test(run) &&
    !HAS_GREEK.test(run) &&
    !HAS_LOWER.test(run) &&
    !ROMAN_NUMERAL.test(run)
  );
}

/**
 * Whether a title segment is set in ALL CAPS: it has more capitalized words
 * (Roman numerals and Greek aside) than words with lowercase letters, so
 * `NORMA VIVENDI (Appendix XV)` is, and `Oratio de Iure (CIL XIII 1668)`
 * isn't.
 */
export function isAllCapsTitleSegment(segment: string): boolean {
  const runs = segment.match(LETTER_RUN) ?? [];
  let caps = 0;
  let lower = 0;
  for (const run of runs) {
    if (isCapsWord(run)) caps++;
    else if (HAS_LOWER.test(run)) lower++;
  }
  return caps > 0 && caps > lower;
}

/** Title-Cases the capitalized words of a segment, keeping Roman numerals. */
function titleCaseSegment(segment: string): string {
  return segment.replace(LETTER_RUN, (run) => {
    if (
      !HAS_LATIN.test(run) ||
      HAS_GREEK.test(run) ||
      HAS_LOWER.test(run) ||
      !HAS_UPPER.test(run) ||
      ROMAN_NUMERAL.test(run)
    ) {
      return run;
    }
    const [first, ...rest] = Array.from(run);
    return first + rest.join("").toLowerCase();
  });
}

/** Splits `A / B` (a slash with a space on at least one side). */
function splitTitleSegments(title: string): string[] {
  return title.split(/\s+\/\s*|\s*\/\s+/).map((s) => s.trim());
}

/**
 * Normalizes a work title: known OCR fixes, `((ADMONITIO))` -> `Admonitio`,
 * ALL-CAPS segments Title-Cased, and a `Title / TITLE AND MORE` pair
 * collapsed to its more complete half.
 */
export function normalizeExperimentalTextTitle(rawTitle: string): string {
  let title = collapseSpaces(rawTitle);
  const override = TITLE_OVERRIDES[title];
  if (override !== undefined) return override;

  const doubleParens = /^\(\(([\s\S]+)\)\)$/.exec(title);
  if (doubleParens) title = doubleParens[1].trim();
  title = title.replace(TITLE_CITATIONS, "");
  title = fixGreekHomoglyphs(title);
  for (const [pattern, replacement] of TITLE_OCR_FIXES) {
    title = title.replace(pattern, replacement);
  }

  let segments = splitTitleSegments(title)
    .filter((s) => s.length > 0)
    .map((s) => (isAllCapsTitleSegment(s) ? titleCaseSegment(s) : s));

  if (segments.length === 2) {
    const [first, second] = segments.map((s) => s.toLowerCase());
    if (second.startsWith(first)) segments = [segments[1]];
    else if (first.startsWith(second)) segments = [segments[0]];
  }
  return collapseSpaces(segments.join(" / "));
}

/** Appends ` (<qualifier>)` to `title` unless it already mentions it. */
function appendQualifier(title: string, qualifier: string | undefined): string {
  if (!qualifier) return title;
  if (title.toLowerCase().includes(qualifier.toLowerCase())) return title;
  return `${title} (${qualifier})`;
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

/**
 * Normalizes one entry's `author`, `title` and `authorAliases` (merging any
 * aliases it already has).
 */
export function normalizeExperimentalTextCatalogEntry(
  entry: ExperimentalTextCatalogEntry
): ExperimentalTextCatalogEntry {
  const normalized = normalizeExperimentalTextAuthor(entry.author);
  const title = appendQualifier(
    normalizeExperimentalTextTitle(entry.title),
    normalized.titleQualifier
  );
  const aliases = uniqueAliases(normalized.author, [
    ...(entry.authorAliases ?? []),
    ...normalized.aliases,
  ]);
  // `aliases` includes any the entry had, so it is only empty if they were.
  return {
    ...entry,
    author: normalized.author,
    title,
    ...(aliases.length > 0 ? { authorAliases: aliases } : {}),
  };
}

/**
 * Tells apart works of one author that share a title (`Admonitio` six times
 * in PL 23) with their volume (`[PL 23]`), and a counter where the volume is
 * shared too (`[PL 23 #1]`). Entries without a volume label are left as is.
 */
export function disambiguateDuplicateTitles(
  entries: readonly ExperimentalTextCatalogEntry[]
): ExperimentalTextCatalogEntry[] {
  const groups = new Map<string, number[]>();
  entries.forEach((entry, i) => {
    const key = `${entry.author}\u0000${entry.title.toLowerCase()}`;
    const group = groups.get(key);
    if (group) group.push(i);
    else groups.set(key, [i]);
  });

  const out = [...entries];
  for (const indices of groups.values()) {
    if (indices.length < 2) continue;
    const labelled = indices.filter((i) => entries[i].volumeLabel);
    const byVolume = new Map<string, number[]>();
    for (const i of labelled) {
      const volume = entries[i].volumeLabel ?? "";
      const group = byVolume.get(volume);
      if (group) group.push(i);
      else byVolume.set(volume, [i]);
    }
    for (const [volume, sameVolume] of byVolume) {
      const sorted = [...sameVolume].sort((a, b) =>
        EN_NUMERIC_COLLATOR.compare(entries[a].id, entries[b].id)
      );
      sorted.forEach((i, n) => {
        const suffix =
          sorted.length > 1 ? `[${volume} #${n + 1}]` : `[${volume}]`;
        out[i] = { ...entries[i], title: `${entries[i].title} ${suffix}` };
      });
    }
  }
  return out;
}

/**
 * Normalizes every entry (see `normalizeExperimentalTextCatalogEntry`), then tells
 * apart same-titled works of one author (see `disambiguateDuplicateTitles`).
 */
export function normalizeExperimentalTextCatalogEntries(
  entries: readonly ExperimentalTextCatalogEntry[]
): ExperimentalTextCatalogEntry[] {
  return disambiguateDuplicateTitles(
    entries.map((entry) => normalizeExperimentalTextCatalogEntry(entry))
  );
}
