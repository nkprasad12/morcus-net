import { readFileSync } from "fs";

import { assert, assertEqual } from "@/common/assert";
import { XmlNode } from "@/common/xml/xml_node";
import {
  AbbreviationTrieOld,
  StringTrie,
} from "@/common/abbreviations/abbreviations";
import { parseXmlStrings } from "@/common/xml/xml_utils";
import { arrayMap } from "@/common/data_structures/collect_map";

const UNKNOWN_REF_WORK = "morcus.net note: Reference work, unclear which.";
const POET_LAT_REL =
  "Poetarum Latinorum Hostii, Laevii, C. Licinii Calvi, C. Helvii Cinnae, C. Valgii Rufi, Domitii Marsi Aliorumque Vitae Et Carminum Reliquiae";
const ROM_LIT = "Romanische Literaturen";
const LIT_GESCH = "Geschichte der Römischen Literatur";
const VEN_FORT_GERM =
  "vita Sancti Germani by Venantius Honorius Clementianus Fortunatus";

function capitalizeFirst(input: string): string {
  return input[0].toUpperCase() + input.slice(1);
}

function getPlural(input: [string, string]): [string, string] {
  assert(input[0].endsWith("."));
  assert(input[1].endsWith("."));
  return [
    input[0].slice(0, -1) + input[0].slice(-2, -1) + ".",
    input[1].slice(0, -1) + "s.",
  ];
}

export type Relaxers = "Case" | "Plural" | "All";

export function relaxedAbbrev(
  input: [string, string],
  relaxMode: Relaxers
): [string, string][] {
  const relaxCase = ["Case", "All"].includes(relaxMode);
  const plural = ["Plural", "All"].includes(relaxMode);
  const results = [input];
  if (relaxCase) {
    results.push([capitalizeFirst(input[0]), capitalizeFirst(input[1])]);
  }
  if (plural) {
    results.push(...results.map(getPlural));
  }
  return results;
}

function parseListItem(root: XmlNode, onUl: (ulNode: XmlNode) => unknown) {
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
  const result = parseXmlStrings([xmlContents])[0];
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
  ["v.", "verb"],
  ["v. impers.", "verb [impersonal]"],
  ["v. inch.", "verb [inchoative]"],
  ["v. inch. impers.", "verb [inchoative; impersonal]"],
  ["v. impers. inch.", "verb [inchoative; impersonal]"],
  ["v. inch. n. impers.", "verb [inchoative; impersonal; intransitive]"],
  ["v. n. impers.", "verb [impersonal; intransitive]"],
  ["v. inch. dep.", "verb [inchoative; deponent]"],
  ["v. inch. n.", "verb [inchoative; intransitive]"],
  ["v. inch. a.", "verb [inchoative; transitive]"],
  ["v. n. inch.", "verb [inchoative; intransitive]"],
  ["v. a. intens.", "verb [intensive; transitive]"],
  ["v. intens. a.", "verb [intensive; transitive]"],
  ["v. intens.", "verb [intensive]"],
  ["v. intens. n.", "verb [intensive; intransitive]"],
  ["v. n.", "verb [intransitive]"],
  ["v. a.", "verb [transitive]"],
  ["v. a. and n.", "verb [depending on sense: intransitive, or transitive]"],
  ["v. n. and a.", "verb [depending on sense: intransitive, or transitive]"],
  ["v. freq. dep.", "verb [frequentative; deponent]"],
  ["v. freq. a. dep.", "verb [frequentative; deponent]"],
  ["v. freq. n.", "verb [frequentative; intransitive]"],
  ["v. n. freq.", "verb [frequentative; intransitive]"],
  ["v. freq.", "verb [frequentative]"],
  ["v. a. freq.", `verb [frequentative; transitive]`],
  ["v. freq. a.", `verb [frequentative; transitive]`],
  [
    "v. freq. a. and n.",
    `verb [frequentative; depending on sense: intransitive, or transitive]`,
  ],
  ["adv.", "adverb"],
  ["P. a.", "participal adjective"],
  ["v. dep.", "verb [deponent]"],
  ["v. n. dep.", "verb [deponent]"],
  ["v. dep. inch. n.", "verb [deponent; inchoative]"],
  ["v. dep. n.", "verb [deponent; intransitive]"],
  ["v. a. dep.", "verb [deponent; transitive]"],
  ["v. dep. a.", "verb [deponent; transitive]"],
  ["v. dep. freq.", "verb [deponent; frequentative]"],
  ["v. dep. a. freq.", "verb [deponent; frequentative]"],
  ["v. freq. dep. n.", "verb [deponent; frequentative]"],
  ["v. freq. dep. a.", "verb [deponent; frequentative]"],
  ["v. dep. freq. a.", "verb [deponent; frequentative]"],
  [
    "v. dep. n. and a.",
    "verb [deponent, depending on sense: intransitive, or transitive]",
  ],
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

export const USG_TRIE = AbbreviationTrieOld.forMap(USG_ABBREVIATIONS);

export const EDGE_CASE_HOVERS = AbbreviationTrieOld.forMap(
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
    ["Mann. Germ.", UNKNOWN_REF_WORK],
    ["Ukert, Germ.", UNKNOWN_REF_WORK],
    ["Ven. Fort. v. Germ.", VEN_FORT_GERM],
    ["Ven. Fort. Vit. Germ.", VEN_FORT_GERM],
    ["Ven. Vit. S. Germ.", VEN_FORT_GERM],
    ["Ven. et Germ.", VEN_FORT_GERM],
    ["Ven. Vit. Germ.", VEN_FORT_GERM],
  ])
);

export const GENERIC_HOVERS = AbbreviationTrieOld.forMap(
  new Map<string, string>([
    ["absol.", "absolutely, i. e. without case or adjunct."],
    ["acc.", "accusative or according."],
    ["act.", "active, -ly."],
    // ^ Conflicts with the English word `act`?
    ["adj.", "adjective, -ly."],
    ["adv.", "adverb, -ial, -ially; or adversus."],
    ["ad loc.", "ad locum (comment on this passage)"],
    ["a. h. l.", "ad hunc locum (comment on this passage). "],
    ["ad h. l.", "ad hunc locum (comment on this passage). "],
    ["ad h.l.", "ad hunc locum (comment on this passage). "],
    ["al.", "alii or alia, others or other."],
    ["analog.", "analogous(ly)"],
    ["class.", "classic(al)."],
    ["collect.", "collective(ly)"],
    ["com.", "commonly, comicus, comic, or in comedy."],
    ["comp.", "compare or comparative."],
    ["Comp.", "Compare or Comparative."],
    ["concr.", "concrete(ly)."],
    ["Concr.", "Concrete(ly)."],
    ["conj.", "conjunction, conjunctive, or conjugation."],
    ["constr.", "constructed, contruction; or: construed"],
    ...relaxedAbbrev(["deriv.", "derived or derivation."], "All"),
    ["e. g.", "exempli gratia."],
    ["ed.", "editio or editor."],
    ["ellipt.", "elliptical(ly)."],
    ["Ellipt.", "elliptical(ly)."],
    ["etc.", "et cetera (and so on)."],
    ["ext.", "externa."],
    ["extr.", "extremo (at the end)."],
    ["fig.", "figure, -ative, -atively."],
    ["fin.", "at the end."],
    ["finit.", "finite (opposite to infinitive)."],
    ["freq.", "frequent(ly), or: frequentative"],
    ["fr.", "from, or: fragmenta, or: frequentative, or: frequent(ly)"],
    ["geog.", "geography(ical)."],
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
    ["polit.", "political(ly)."],
    ["Polit.", "Political(ly)."],
    [
      "pregn.",
      "pregnant, -ly. (Obsolete, = unresistingly; openly; hence, clearly, evidently )",
    ],
    [
      "Pregn.",
      "pregnant, -ly. (Obsolete, = unresistingly; openly; hence, clearly, evidently )",
    ],
    ...relaxedAbbrev(
      [
        "praegn.",
        "pregnant, -ly. (Obsolete, = unresistingly; openly; hence, clearly, evidently )",
      ],
      "Case"
    ),
    ["prop.", "proper, -ly, in a proper sense."],
    ["prov.", "proverb, or proverbial(ly)."],
    ["proverb.", "proverb, or proverbial(ly)."],
    ["q. v.", "quod videas. (look it up in that entry)"],
    ["rar.", "rare(ly)."],
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
    ["syn.", "synonym, synonymous (with)."],
    ["tab.", "tabula (table, plate)."],
    ["temp.", "tense or temporal."],
    ["trag.", "tragicus, tragic, or in tragedy."],
    ["trans.", "translated, -tion."],
    ["trisyl.", "trisyllable(-abic)"],
    ["trop.", "in a tropical or figurative sense."],
    ["usu.", "usual(ly)."],
    ["var. lect.", "varia lectio (different reading)."],
    ["v. h. v.", "vide hanc vocem. (see this entry)"],
    ["v. h. vv.", "vide hanc vocem. (see these entries)"],
    ["abl.", "ablative."],
    ["Abl.", "ablative."],
    ["Absol.", "absolutely, i. e. without case or adjunct."],
    ["abstr.", "abstract"],
    ["acc. respect.", "accusative of respect."],
    ["access.", "accessory"],
    ["adjj.", "adjectives."],
    ...relaxedAbbrev(["advv.", "adverbs."], "Case"),
    ["agric.", "agricultural"],
    ["agricult.", "agricultural"],
    ["amplif.", "amplificative"],
    // ["antiq.", "antiquities. <- Seems to occur in other ways"],
    ["ap.", "in"],
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
    ["Collat.", "Collateral."],
    ...relaxedAbbrev(["colloq.", "colloquial."], "Case"),
    ["comm.", "common."],
    ["commentt.", "commentators."],
    ["compd.", "compound."],
    ["compp.", "comparatives."],
    ["comp. clause", "comparative clause"],
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
    ["dim.", "diminutive."],
    ["dissyl.", "dissyllabic."],
    ["distr.", "distributive."],
    ["dub.", "doubtful"],
    ["eccl.", "ecclesiastical."],
    ["elsewh.", "elsewhere."],
    ["epit.", "epitaph."],
    ["equiv.", "equivalent."],
    ["esp.", "especially."],
    ["etym.", "etymology"],
    ["euphon.", "euphonic."],
    ["exs.", "examples."],
    ["expl.", "explanation."],
    ["fem.", "feminine."],
    ["foll.", "following."],
    // ["Fr.", "French."], <- May have too much overlap with Q. Fr. by Cic.
    //                        Maybe we can expand this just in <etym>
    ["fragm.", "fragmenta."],
    ["Fragm.", "Fragmenta."],
    ["fut.", "future."],
    ["Fut.", "future."],
    ["in concr.", "in concrete"],
    ["In concr.", "in concrete"],
    ["In gen.", "In general"],
    ["in gen.", "in general"],
    ["Germ.", "German."],
    ["Goth.", "Gothic."],
    ["Gr.", "Greek."],
    ["Heb.", "Hebrew."],
    ["vox hibr.", "hybrid word."],
    ["imper.", "imperative."],
    ["Imper.", "Imperative."],
    ...relaxedAbbrev(["imperf.", "imperfect."], "Case"),
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
    ["masc.", "masculine."],
    ["Masc.", "Masculine."],
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
    ...relaxedAbbrev(["object-inf.", "objective infinitive."], "All"),
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
    ...relaxedAbbrev(["subject-inf.", "subject infinitive."], "All"),
    ["substt.", "substantives."],
    ["superll.", "superlatives."],
    ["suff.", "suffix."],
    ["syll.", "syllable."],
    ["sync.", "syncopated"],
    ["t. t.", "technical term."],
    // ["term.", "terminus."], <- WTF does this mean
    ["transf.", "transferred."],
    // ["v.", "verb, vide, or vox."],
    ["vb.", "verb"],
    ["voc.", "vocative."],
    ["Weich.", "Weichert"],
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

export namespace LsAuthorAbbreviations {
  export interface LsAuthorData extends LsAuthorAbbreviation {
    worksTrie: StringTrie;
  }

  const authorMap = arrayMap<string, LsAuthorData>();

  function populateMaps() {
    if (authorMap.map.size === 0) {
      const data = parseAuthorAbbreviations();
      for (const datum of data) {
        const root = new StringTrie();
        for (const [key, value] of datum.works.entries()) {
          root.add(key, value);
        }
        const result: LsAuthorData = {
          worksTrie: root,
          key: datum.key,
          expanded: datum.expanded,
          works: datum.works,
        };
        authorMap.add(datum.key, result);
      }
    }
  }

  export function authors(): Map<string, LsAuthorData[]> {
    populateMaps();
    return authorMap.map;
  }
}
