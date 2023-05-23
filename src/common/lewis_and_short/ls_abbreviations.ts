import { readFileSync } from "fs";

import { assert, assertEqual } from "@/common/assert";
import { parseEntries, XmlNode } from "@/common/lewis_and_short/xml_node";
import { AbbreviationTrie, TrieNode } from "./ls_styling";

const POET_LAT_REL =
  "Poetarum Latinorum Hostii, Laevii, C. Licinii Calvi, C. Helvii Cinnae, C. Valgii Rufi, Domitii Marsi Aliorumque Vitae Et Carminum Reliquiae";
const ROM_LIT = "Romanische Literaturen";
const LIT_GESCH = "Geschichte der Römischen Literatur";

function parseListItem(root: XmlNode, onUl: (ulNode: XmlNode) => any) {
  assertEqual(root.name, "li");
  let i = 0;
  const keys: string[] = [];
  while (i < root.children.length) {
    const currentNode = XmlNode.assertIsNode(root.children[i], "b");
    keys.push(XmlNode.getSoleText(currentNode));
    i += 1;
    const nextNode = root.children[i];
    const hasOtherKey = typeof nextNode === "string" && nextNode === " or ";
    if (!hasOtherKey) {
      break;
    }
    i += 1;
  }
  let expanded = "";
  while (i < root.children.length) {
    const currentNode = root.children[i];
    if (typeof currentNode === "string") {
      expanded += currentNode;
    } else if (currentNode.name === "ul") {
      onUl(currentNode);
    } else {
      expanded += XmlNode.getSoleText(currentNode);
    }
    i += 1;
  }

  return new Map<string, string>(
    keys.map((key) => [
      key.trim().replace(/(^,)|(,$)/g, ""),
      expanded.trim().replace(/(^,)|(,$)/g, ""),
    ])
  );
}

export interface LsAuthorAbbreviation {
  key: string;
  expanded: string;
  works: Map<string, string>;
}

export function parseAuthorAbbreviations(
  path: string = "texts/latin/lewisAndShort/ls_abbreviations.html"
): LsAuthorAbbreviation[] {
  const xmlContents = readFileSync(path, "utf8");
  const result = parseEntries([xmlContents])[0];
  const entries: LsAuthorAbbreviation[] = [];
  for (const author of result.children) {
    if (typeof author === "string") {
      assert(author.trim() === "");
      continue;
    }
    const works = new Map<string, string>();
    const authorResults = parseListItem(author, (worksList) => {
      for (const work of worksList.children) {
        if (typeof work === "string") {
          assert(work.trim() === "");
          continue;
        }
        parseListItem(work, (_) => {
          throw new Error("This should never happen");
        }).forEach((value, key) => {
          works.set(key, value);
        });
      }
    });

    authorResults.forEach((expanded, key) => {
      entries.push({
        key: key,
        expanded: expanded,
        works: works,
      });
    });
  }
  return entries;
}

export const SCHOLAR_ABBREVIATIONS = new Set<string>(["Rib.", "Schneid."]);

export const NUMBER_ABBREVIATIONS = new Map<string, string>([
  ["sing.", "singular"],
  ["plur.", "plural"],
]);

export const MOOD_ABBREVIATIONS = new Map<string, string>([
  ["Part.", "Participle"],
]);

export const CASE_ABBREVIATIONS = new Map<string, string>([
  ["nom.", "nominative"],
  ["acc.", "accusative"],
  ["dat.", "dative"],
  ["gen.", "genitive"],
  ["abl.", "ablative"],
  ["voc.", "vocative"],
]);

export const LBL_ABBREVIATIONS = new Map<string, Map<string, string>>([
  ["sense", new Map<string, string>([["dim.", "diminutive"]])],
  ["entryFree", new Map<string, string>([["dim.", "diminutive"]])],
  ["etym", new Map<string, string>([["dim.", "diminutive"]])],
  ["xr", new Map<string, string>([["v.", "see"]])],
]);

export const GEN_ABBREVIATIONS = new Map<string, string>([
  ["f.", "feminine"],
  ["m.", "masculine"],
  ["n.", "neuter"],
  ["com.", "common gender"],
  ["comm.", "common gender"],
]);

export const POS_ABBREVIATIONS = new Map<string, string>([
  ["prep.", "preposition"],
  ["interj.", "interjection"],
  ["adj.", "adjective"],
  ["v. n.", "verb (active only)"],
  ["v. a.", "verb (active and passive)"],
  [
    "v. a. and n.",
    "verb (depending on sense: active only, or active and passive)",
  ],
  ["v. freq. a.", `verb (frequentative; active and passive forms)`],
  [
    "v. freq. a. and n.",
    `verb (frequentative; depending on sense: active only, or active and passive)`,
  ],
  ["adv.", "adverb"],
  ["P. a.", "participal adjective"],
  ["v. dep.", "verb [deponent]"],
  ["Adj.", "Adjective"],
  ["Subst.", "Substantive"],
  ["adv. num.", "adverb [numeral]"],
  ["num. adj.", "adjective [numeral]"],
  ["pron. adj.", "adjective [pronoun]"],
]);

export const USG_ABBREVIATIONS = new Map<string, string>([
  ["poet.", "poetically"],
  ["Transf.", "Transferred"],
  ["Lit.", "Literally"],
  ["Absol.", "Absolutely [without case or adjunct]"],
  ["Trop.", "Tropical [tropical or figurative sense]"],
  ["Polit. t. t.", "Political [technical term]"],
  ["Meton.", "By Metonymy"],
  ["Poet.", "Poetically"],
  ["Medic. t. t.", "Medical [technical term]"],
  ["Milit. t. t.", "Military [technical term]"],
  ["Mercant. t. t.", "Mercantile [technical term]"],
]);

export const USG_TRIE = AbbreviationTrie.forMap(USG_ABBREVIATIONS);

export const EDGE_CASE_HOVERS = AbbreviationTrie.forMap(
  new Map<string, string>([
    ["Gesch. Rom. Lit.", LIT_GESCH],
    ["Lit. Gesch.", LIT_GESCH],
    ["Gesch. d. Röm. Lit.", LIT_GESCH],
    ["Bähr, Röm. Lit.", LIT_GESCH],
    ["Röm. Lit. Gesch.", LIT_GESCH],
    ["Poet. Lat.", POET_LAT_REL],
    ["Poët. Lat.", POET_LAT_REL],
    ["Poët. Latin.", POET_LAT_REL],
    ["Poët. Lat. Rel.", POET_LAT_REL],
    ["Röm. Lit.", ROM_LIT],
    ["Rom. Lit.", ROM_LIT],
    ["Roem. Lit.", ROM_LIT],
    ["Rö. Lit.", ROM_LIT],
  ])
);

export const GENERIC_HOVERS = AbbreviationTrie.forMap(
  new Map<string, string>([
    ["acc.", "accusative or according."],
    ["adj.", "adjective, -ly."],
    ["adv.", "adverb, -ial, -ially; or adversus."],
    ["ad loc.", "ad locum (comment on this passage)"],
    ["a. h. l.", "ad hunc locum (comment on this passage). "],
    ["ad h. l.", "ad hunc locum (comment on this passage). "],
    ["ad h.l.", "ad hunc locum (comment on this passage). "],
    ["al.", "alii or alia, others or other."],
    ["class.", "classic(al)."],
    ["com.", "commonly, comicus, comic, or in comedy."],
    ["comp.", "compare or comparative."],
    ["conj.", "conjunction, conjunctive, or conjugation."],
    ["constr.", "constructed, contruction; or: construed"],
    ["e. g.", "exempli gratia."],
    ["ed.", "editio or editor."],
    ["etc.", "et cetera (and so on)."],
    ["ext.", "externa."],
    ["extr.", "extremo (at the end)."],
    ["fig.", "figure, -ative, -atively."],
    ["fin.", "at the end."],
    ["finit.", "finite (opposite to infinitive)."],
    ["freq.", "frequent(ly), or: frequentative"],
    ["fr.", "from, or: fragmenta, or: frequentative, or: frequent(ly)"],
    ["gen.", "genitive or general."],
    ["gr.", "grammar, -ian, -atical, grammatici."],
    ["gram.", "grammar, -ian, -atical, grammatici."],
    ["hist.", "history, -ian(s); near `inf`: historical infinitive"],
    ["h.l.", "hic locus (this passage)."],
    ["h. l.", "hic locus (this passage)."],
    ["ib.", "at the same place / citation"],
    ["i. e.", "id est (that is, namely)"],
    ["i.e.", "id est (that is, namely)"],
    ["i.q.", "idem quod (the same as)."],
    ["i. q.", "idem quod (the same as)."],
    ["id.", "the same author"],
    ["interrog.", "interrogative, -tion."],
    [
      "l. c.",
      "loco citato, in the place already cited above (in this same entry).",
    ],
    [
      "l. l.",
      "loco laudato, in the place already cited above (in this same entry).",
    ],
    [
      "l.l.",
      "loco laudato, in the place already cited above (in this same entry).",
    ],
    [
      "leg.",
      "usually: short for legit, legunt, etc... usually used " +
        "for a different interpretation; sometimes: legal",
    ],
    ["masc.", "masculine."],
    ["math.", "mathematics, -ical."],
    ["med.", "medio (in the middle)."],
    ["medic.", "medical or medicine."],
    ["metaph.", "metaphor, metaphorical, -ly."],
    ["obj.", "object, objective, -ly."],
    ["Obj.", "object, objective, -ly."],
    ["object.", "object, objective, -ly."],
    ["Object.", "object, objective, -ly."],
    ["opp.", "opposed to, opposite, -tion."],
    ["part.", "participle (or rarely, particle)"],
    ["pass.", "passive, -ly, or passage."],
    ["Pass.", "passive, -ly, or passage."],
    ["pers.", "person; sometimes: personal, (ly)."],
    ["philos.", "philosophy, -ical, -ically, -opher."],
    ["Philos.", "philosophy, -ical, -ically, -opher."],
    [
      "pregn.",
      "pregnant, -ly. (Obsolete, = unresistingly; openly; hence, clearly, evidently )",
    ],
    [
      "Pregn.",
      "pregnant, -ly. (Obsolete, = unresistingly; openly; hence, clearly, evidently )",
    ],
    ["prop.", "proper, -ly, in a proper sense."],
    ["prov.", "proverb, or proverbial(ly)."],
    ["proverb.", "proverb, or proverbial(ly)."],
    ["q. v.", "quod videas. (look it up in that entry)"],
    ["rel.", "relative or reliquiae."],
    ["rhet.", "rhetoric, -al; in rhetoric."],
    ["s. h. v.", "sub hac voce. (in this entry)"],
    ["signif.", "signifies, -cation."],
    ["sq.", "sequens (the following);"],
    ["sqq.", "sequentes (and the following)."],
    ["subj.", "subjunctive; or subject, subjective(ly)."],
    ["subject.", "subject, subjective(ly)."],
    ["subst.", "substantive(ly)."],
    ["sup.", "superlative or supine."],
    ["Sup.", "superlative or supine."],
    ["tab.", "tabula (table, plate)."],
    ["temp.", "tense or temporal."],
    ["trag.", "tragicus, tragic, or in tragedy."],
    ["trans.", "translated, -tion."],
    ["trop.", "in a tropical or figurative sense."],
    ["var. lect.", "varia lectio (different reading)."],
    ["v. h. v.", "vide hanc vocem. (see this entry)"],
    ["v. h. vv.", "vide hanc vocem. (see these entries)"],
  ])
);

// There are listed in the abbreviation table, but never appear in the
// actual dictionary.
// ["a. h. v.", "ad hanc vocem. (at this entry)"]
// ["aug.", "augmentative."],
// ["chh.", "church."]
// ["epic.", "epicene."],
// ["express.", "expression."]
// ["JCtus.", "juris consultus."],
// ["plur. tant.", "used only in the plural."],

// Only appears in tags which are handled already
// ["poet.", "poetical, -ly."],

// Too short to be safe
// ["h.", "hence."],
// ["p.", "page."],
// n. or neutr. neuter.
// ["m.", "masculine."],
// ["l.", "lege (read!) or lectio. (reading) as X instead of Y"],
// ["f.", "feminine."],
// ["c.", "cum (with)."],

// Should be fine for English speakers without, and never highlighted
// ["math.", "mathematics, -ical."],
// ["diff.", "differs or different."], <- could be buggy with Diff., a work.
// ["abbrev.", "abbreviated, -tion."],

export const GENERIC_EXPANSIONS = AbbreviationTrie.forMap(
  new Map<string, string>([
    ["act.", "active, -ly."],
    // ^ Conflicts with the English word `act`?
    ["abl.", "ablative."],
    ["Abl.", "ablative."],
    ["absol.", "absolutely, i. e. without case or adjunct."],
    ["Absol.", "absolutely, i. e. without case or adjunct."],
    ["abstr.", "abstract"],
    ["acc. respect.", "accusative of respect."],
    ["access.", "accessory"],
    ["adjj.", "adjectives."],
    ["agric.", "agricultural"],
    ["agricult.", "agricultural"],
    ["amplif.", "amplificative"],
    ["analog.", "analogous(ly)"],
    // ["antiq.", "antiquities. <- Seems to occur in other ways"],
    ["ap.", "apud (in)"],
    ["appel.", "appellative"],
    // ["append. or app.", "appendix. <- seems to occur in other ways"],
    ["Arab.", "Arabic"],
    ["archit.", "architecture."],
    ["art.", "entry."],
    // ["Aug.", "Augustan."], <- Augustan, Augustus, Augustine... ahhhh
    ["c. c.", "coupled with."],
    ["cf.", "compare"],
    // ["Cod.", "Codex (MS)."], <- What does MS mean?
    ["collat.", "collateral."],
    ["Collat.", "collateral."],
    ["collect.", "collective(ly)"],
    ["comm.", "common."],
    ["commentt.", "commentators."],
    ["Comp.", "Compare."],
    ["compd.", "compound."],
    ["concr.", "concrete(ly)."],
    ["Constr.", "Constructed."],
    // ["contr.", "contracted, contraction, or contrary."],
    // ^ There are issues with something `Aug. contr.` and `Phil. contr.`
    // but maybe we can expand contracted for and contractred from
    ["corresp.", "corresponding."],
    ["dat.", "dative."],
    ["decl.", "declension."],
    ["demonstr.", "demonstrative."],
    ["dem. pron.", "demonstrative pronoun."],
    ["dep.", "deponent."],
    ["Dep.", "deponent."],
    ["deriv.", "derivation."],
    ["Deriv.", "Derived."],
    ["dim.", "diminutive."],
    ["dissyl.", "dissyllabic."],
    ["distr.", "distributive."],
    ["dub.", "doubtful"],
    ["eccl.", "ecclesiastical."],
    ["ellipt.", "elliptical(ly)."],
    ["Ellipt.", "elliptical(ly)."],
    ["elsewh.", "elsewhere."],
    ["epit.", "epitaph."],
    ["equiv.", "equivalent."],
    ["esp.", "especially."],
    ["etym.", "etymology"],
    ["euphon.", "euphonic."],
    ["expl.", "explanation."],
    ["fem.", "feminine."],
    ["foll.", "following."],
    // ["Fr.", "French."], <- May have too much overlap with Q. Fr. by Cic.
    //                        Maybe we can expand this just in <etym>
    ["fragm.", "fragmenta."],
    ["Fragm.", "Fragmenta."],
    ["fut.", "future."],
    ["Fut.", "future."],
    ["In gen.", "In general"],
    ["in gen.", "in general"],
    ["geog.", "geography(ical)."],
    ["Germ.", "German."],
    ["Goth.", "Gothic."],
    ["Gr.", "Greek."],
    ["Heb.", "Hebrew."],
    ["vox hibr.", "hybrid word."],
    ["imper.", "imperative."],
    ["Imper.", "Imperative."],
    ["imperf.", "imperfect."],
    ["Imperf.", "imperfect."],
    ["impers.", "impersonal."],
    ["Impers.", "Impersonal."],
    ["bon. part.", "positive sense."],
    ["mal. part.", "pejorative sense."],
    ["inanim.", "inanimate."],
    // ["inch.", "inchoative, inceptive."], <- All of these occur in the context of verb POS.
    ["indecl.", "indeclinable."],
    ["indef.", "indefinite."],
    ["Indef.", "indefinite."],
    ["indic.", "indicative."],
    ["inf.", "infinitive"],
    ["init.", "at the beginning."],
    ["in.", "at the beginning."],
    ["inscrr.", "inscriptions."],
    ["intens.", "intensive."],
    ["interrog.clause", "interrogative clause"],
    ["interrog.-clause", "interrogative clause"],
    ["intr.", "intransitive"],
    ["Ital.", "Italian"],
    ["jurid.", "juridical"],
    ["kindr.", "kindred"],
    ["lang.", "language."],
    ["Lat.", "Latin."],
    // ["lex.", "lexicon."], <- Most (all?) of the reference here are to actual works
    ["lit.", "literal."],
    ["Lith.", "Lithuanian."],
    ["Metaph.", "Metaphorical."],
    ["meton.", "by metonymy"],
    ["mid.", "medial; in a middle or reflexive sense."],
    ["milit.", "military."],
    ["MS.", "manuscript"],
    ["MSS.", "manuscripts."],
    ["nom. propr.", "proper name"],
    ["naut.", "nautical."],
    ["Naut.", "Nautical."],
    ["neg.", "negative."],
    ["no.", "section."],
    ["nom.", "nominative."],
    // ["Nom.", "nominative."], <- Needs to be disambiguated with some other Nom.
    ["num.", "numeral."],
    ["obj.clause", "object clause"],
    ["obj.-clause", "object clause"],
    ["obj.-gen", "objective genitive"],
    ["obliq.", "oblique."],
    ["om.", "omit."],
    ["onomatop.", "onomatopoeia"],
    ["orat.", "oratio obliqua."],
    ["orig.", "originally."],
    ["O. H. Germ.", "Old High German."],
    ["partit.", "partitive."],
    ["patr.", "patronymic"],
    ["per.", "period."],
    ["perf.", "perfect."],
    ["Perf.", "Perfect."],
    ["perh.", "perhaps"],
    ["pl.", "plural."],
    ["plur.", "plural."],
    ["Plur.", "Plural."],
    ["pleon.", "pleonastically"],
    ["plqpf.", "pluperfect."],
    ["polit.", "political(ly)."],
    ["Polit.", "Political(ly)."],
    ["pos.", "positive."],
    ["Pos.", "Positive."],
    ["posit.", "positive."],
    ["Posit.", "Positive."],
    ["poss.", "possessive."],
    ["praef.", "praefatio."],
    ["praep.", "preposition."],
    ["prep.", "preposition."],
    ["prep.", "prepositions."],
    ["preced.", "preceding."],
    ["prep.", "preposition."],
    ["pres.", "present."],
    ["prob.", "probably."],
    ["prol.", "prologue."],
    ["pron.", "pronoun."],
    ["prooem.", "prooemium (preface)."],
    ["qs.", "quasi"],
    ["rad.", "radical (root)"],
    ["rar.", "rare(ly)."],
    ["ref.", "reference."],
    ["rel. clause", "relative clause"],
    ["rel.-clause", "relative clause"],
    ["rel. pron.", "pronoun."],
    // ["Rom.", "Roman."], <- It's unclear whether this can be safely done as it
    //                        appears in a lot of titles of books, etc..
    ["saep.", "saepe."],
    ["saepis.", "saepissime."],
    ["sc.", "scilicet."],
    ["simp.", "simple"],
    ["Span.", "Spanish"],
    ["specif.", "specifically."],
    ["substt.", "substantives."],
    ["suff.", "suffix."],
    ["syll.", "syllable."],
    ["syn.", "synonym(ous)."],
    ["sync.", "syncopated"],
    ["t. t.", "technical term."],
    // ["term.", "terminus."], <- WTF does this mean
    ["transf.", "transferred."],
    ["trisyl.", "trisyllable(-abic)"],
    ["usu.", "usual(-ly)."],
    // ["v.", "verb, vide, or vox."],
    ["vb.", "verb"],
    ["voc.", "vocative."],
    ["Weich.", "Weichert"],
  ])
);

export namespace LsAuthorAbbreviations {
  export interface LsAuthorData extends LsAuthorAbbreviation {
    worksTrie: TrieNode;
  }

  const authorMap = new Map<string, LsAuthorData[]>();

  function populateMaps() {
    if (authorMap.size === 0) {
      const data = parseAuthorAbbreviations();
      for (const datum of data) {
        if (!authorMap.has(datum.key)) {
          authorMap.set(datum.key, []);
        }
        const root = new TrieNode();
        for (const [key, value] of datum.works.entries()) {
          root.add(key, value);
        }
        const result: LsAuthorData = {
          worksTrie: root,
          key: datum.key,
          expanded: datum.expanded,
          works: datum.works,
        };
        authorMap.get(datum.key)!.push(result);
      }
    }
  }

  export function authors(): Map<string, LsAuthorData[]> {
    populateMaps();
    return authorMap;
  }
}
