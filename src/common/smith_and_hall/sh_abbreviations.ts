import {
  AbbreviationData,
  AbbreviationTrie,
  ExpansionData,
  areExpansionsDisjoint,
  findExpansions,
} from "@/common/abbreviations/abbreviations";
import { assert } from "@/common/assert";

const SH_EXPANSIONS: AbbreviationData[] = [
  ["v.", { expansion: "see", postfix: " <f>" }],
  ["abstr.", "abstract."],
  ["Acta Syn. Dord.", "Acta Synodi Dordrechtensis."],
  ["Ai.", "Ainsworth."],
  ["Ains.", "Ainsworth."],
  ["al.", "other(s)"],
  ["al. leg.", "others read."],
  ["ap.", "in"],
  ["anat.", "anatomical."],
  ["ant.", "antiquities."],
  // "app." can also stand for apparently, but it is also used to abbreviate appono...
  ["appy.", "apparently."],
  ["appel.", "appellative."],
  ["bot.", "botanical."],
  ["Bau.", "Bauer."],
  ["Blumen.", "Blumenbach."],
  ["Calv. Inst.", "Calvin Institutio Chr. Religionis."],
  ["card.", "cardinal."],
  ["cf.", "compare."],
  ["col.", "column."],
  ["collat.", "collateral."],
  ["compd.", "compound."],
  ["contr.", "contracted."],
  ["Corp. Conf.", "Corpus Confessionum."],
  ["corresp.", "corresponding."],
  ["Cuv.", "Cuvier."],
  ["dat.", "dative."],
  ["DuC.", "the Lexicon of Ducange."],
  ["Ducang.", "the Lexicon of Ducange."],
  ["decl.", "declension."],
  ["defect.", "defective."],
  ["demonstr.", "demonstrative."],
  ["depend.", "dependent."],
  ["Dict. Ant.", "Dictionary of Greek and Roman Antiquities."],
  ["diff.", "different."],
  ["dim.", "diminutive."],
  ["distr.", "distributive."],
  ["Död.", "Döderlein's Synonyms."],
  ["Döderl.", "Döderlein's Synonyms."],
  ["dub.", "doubtful."],
  ["eccl.", "ecclesiastical."],
  //   ["ed.", "editio."],
  ["Eng.", "English."],
  ["Epith.", "Epithet."],
  ["equiv.", "equivalent."],
  ["esp.", "especially."],
  ["exx.", "examples."],
  ["Fabr.", "Fabricius."],
  ["fem.", "feminine."],
  ["foll.", "following."],
  //   ["fr.", "from. or fragmenta."],
  ["Forcell.", "Forcellini."],
  ["Forc.", "Forcellini."],
  ["Fr.", "French."],
  ["fragm.", "fragmenta."],
  ["frag.", "fragmenta."],
  ["fut.", "future."],
  ["Georg.", "Germ.-Lat. Lexicon of Georges."],
  ["ger.", "gerund."],
  ["Germ.", "German."],
  ["Gr.", "Greek."],
  ["Hab.", "Habicht's Synonyms."],
  ["hypoth.", "hypothetical."],
  ["imper.", "imperative."],
  ["imperat.", "imperative."],
  ["imperf.", "imperfect."],
  ["incep.", "inceptive."],
  ["indecl.", "indeclinable."],
  ["indef.", "indefinite."],
  ["indic.", "indicative."],
  // Not safe, since influence etc are also inf.
  // ["inf.", "infinitive."],
  ["inscrr.", "inscriptions."],
  ["interj.", "interjection."],
  ["interrog.", "interrogative, -tion."],
  ["intrans.", "intransitive."],
  ["irreg.", "irregular."],
  ["ICtus", "juris consultus."],
  ["jurid.", "juridical."],
  ["Kr.", "Kraft's Germ.-Lat. Lexicon."],
  ["lang.", "language."],
  ["Lat.", "Latin."],
  ["L. G.", "Student's Latin Grammar by Dr. Smith and Mr. Hall."],
  //   ["l.", "lege or lectio."],
  //   ["leg., legit, legunt, legal[** .]"],
  ["Linn.", "Linnaeus."],
  ["lit.", "literal."],
  ["l. c.", "loco citato."],
  ["loc. cit.", "loco citato."],
  ["masc.", "masculine."],
  ["Madvig", "Madvig's Latin Grammar."],
  ["Mayne", "Mayne's Expository Lexicon."],
  ["Med. Lat.", "Mediaeval Latin."],
  ["medic.", "medical."],
  ["meton.", "metonymy."],
  ["M. L.", "Modern Latin."],
  ["min.", "minor."],
  ["Mosh.", "Mosheim."],
  ["MS.", "manuscript."],
  ["Mur.", "Muretus."],
  ["Muret.", "Muretus."],
  ["Näg.", "Stilistik of Nägelsbach."],
  ["Nägels.", "Stilistik of Nägelsbach."],
  ["Nägelsb.", "Stilistik of Nägelsbach."],
  ["naut.", "nautical."],
  ["neut.", "neuter."],
  ["nom.", "nominative."],
  ["numer.", "numeral."],
  ["O. E.", "Old English."],
  //   ["obj. or object. objective.[** ,] -ly."],
  ["obs.", "observe."],
  ["ord.", "ordinal."],
  ["part.", "participle."],
  ["partit.", "partitive."],
  ["perf.", "perfect."],
  ["perh.", "perhaps."],
  ["pleon.", "pleonastically."],
  ["plu.", "plural."],
  ["plur.", "plural."],
  ["pos.", "positive."],
  ["praef.", "praefatio."],
  ["preced.", "preceding."],
  ["prep.", "preposition."],
  ["prob.", "probably."],
  ["prol.", "prologus."],
  ["pron.", "pronoun"],
  ["pronom.", "pronominal."],
  ["Quich.", "French-Latin Lex. of Quicherat."],
  ["R and A.", "Riddle and Arnold."],
  ["rel.", "relative."],
  ["Rom.", "Roman."],
  ["Ruhnk.", "Ruhnken."],
  ["Spreng.", "Sprengel."],
  ["sing.", "singular."],
  ["SS.", "Sanctae Scripturae."],
  ["subaud.", "subauditur."],
  ["subst.", "substantive(ly)."],
  ["suff.", "suffix."],
  ["syl.", "syllable."],
  ["syn.", "synonym."],
  ["sync.", "syncopated."],
  ["syncop.", "syncopated."],
  ["t. t.", "technical term."],
  ["term.", "termination."],
  ["theol.", "theological."],
  ["trans.", "transitive."],
  ["transf.", "transferred."],
  ["Tursell.", "Tursellinus."],
  ["usu.", "usually."],
  ["voc.", "vocative."],
  ["Vulg.", "Vulgate."],
  ["Wahl", "Wahl's New Test. Lexicon."],
  ["Wytt.", "Wyttenbach."],
  ["Wyttenb.", "Wyttenbach."],
  ["Zumpt", "Zumpt's Latin Grammar."],
];

const GENERIC_SH_HOVERS: AbbreviationData[] = [
  ["act.", "active(ly)"],
  ["abl.", "ablative"],
  ["abs.", "absolute(ly); without case or adjunct."],
  ["absol.", "absolute(ly); without case or adjunct."],
  ["acc.", "accusative or according"],
  ["adj.", "adjective(ly)"],
  ["adv.,", "adverb., -ial, -ially; or, adversus."],
  ["analog.", "analogous, -ly."],
  ["arch.", "archaic, or architecture, -al"],
  ["archit.", "architecture, -tural."],
  // ["art., article[** .]"], -> Can we have a regular sentence ending with art.?
  ["class.", "classic(al)."],
  ["collect.", "collective, -ly."],
  ["com.", "comic, or in comedy."],
  ["comm.", "common gender."],
  ["comp.", "comparative, or compound."],
  ["conj.", "conjunction, or conjugation."],
  ["constr.", "construed, construction."],
  ["correl.", "correlative, -ively."],
  ["dep.", "deponent. or dependent."],
  ["deriv.", "derived, -ative, -ation."],
  ["disyl.", "disyllable -abic"],
  ["e. g.", "for example."],
  ["ellipt.", "elliptical, -ly."],
  ["Erasm. Coll.", "Erasmi Colloquia. (Ed. Tauch.)"],
  ["etym.", "etymology, -gical."],
  ["euphon.", "euphonic, -ny."],
  ["expr.", "express, expressed."],
  ["extr.", "quite at the end."],
  ["fig.", "figure, -ative, -atively."],
  ["fin.", "at or towards the end."],
  ["ad fin.", "at or towards the end."],
  ["finit.", "finite (opposed to infinitive)."],
  ["freq.", "frequentative or frequent, -ly."],
  ["gen.", "genitive, generally, generic, in gen., in a general sense."],
  ["geog.", "geography, -ical."],
  ["gram.", "grammar, -ian, -atical."],
  ["hist.", "history, -ian."],
  ["i. e.", "id est. (that is)"],
  ["i. q.", "idem quod (the same as)"],
  ["ib.", "ibidem. (in the same place)"],
  ["id.", "idem. (the same)"],
  ["impers.", "impersonal, -ly."],
  ["init.", "at or near the beginning."],
  ["ad init.", "at or near the beginning."],
  ["math.", "mathematics, -ical."],
  ["med.", "medio (in the middle)"],
  ["ad med.", "near the middle."],
  ["met. or metaph.", "metaphorical, -ly."],
  ["milit.", "military, in milltary[** military] affairs."],
  ["neg.", "negative, -ly."],
  ["opp.", "opposed to, opposite, -tion."],
  ["orig.", "origin, original, originally."],
  ["pass.", "passive, -ly or passim."],
  ["pers.", "personal, -ly."],
  ["philos.", "philosophy, -ical, -ically, -opher."],
  ["Phr.", "Phrase, Phrases."],
  ["Phys.", "physical, -ly."],
  ["poet.", "poeta, poetical, -ly."],
  ["prop.", "proper, -ly, in a proper sense."],
  ["proverb.", "proverbial, -ly."],
  ["q. v.", "quod vide, videas (look it up in that entry)"],
  ["rad.", "radical or root."],
  ["rar.", "rare, -ly."],
  ["ref.", "refer, -ence."],
  ["reflect.", "reflective, -tively."],
  ["rhet.", "rhetor., rhetoric, -al; in rhetoric."],
  ["Schleusn.", "Schleusner's New Test. Lex."],
  ["s. v.", "sub voce. (under the specified word)"],
  ["sign.", "signifies, -cation."],
  ["signif.", "signifies, -cation."],
  ["subject.", "subjective, -ly."],
  ["subj.", "subjective, OR subjunctive."],
  ["sup.", "superlative or supine."],
];

const SH_COMBINED_EXPANSIONS = AbbreviationTrie.from(
  GENERIC_SH_HOVERS,
  SH_EXPANSIONS
);

function matchLength(data: ExpansionData): number {
  return (
    (data.prefix || "").length +
    data.expansion.length +
    (data.postfix || "").length
  );
}

function findBestExpansions(allData: ExpansionData[]): ExpansionData[] {
  let bestLength = 0;
  let bestMatches: ExpansionData[] = [];
  for (const data of allData) {
    const currentLength = matchLength(data);
    if (currentLength > bestLength) {
      bestLength = currentLength;
      bestMatches = [data];
    } else if (currentLength === bestLength) {
      bestMatches.push(data);
    }
  }
  return bestMatches;
}

function hoverSpan(mainText: string, hoverText: string): string {
  return `<span class="lsHover" title="${hoverText}">${mainText}</span>`;
}

export function expandShAbbreviationsIn(input: string): string {
  const expansions = findExpansions(input, SH_COMBINED_EXPANSIONS);
  assert(areExpansionsDisjoint(expansions), input);
  expansions.sort((a, b) => b[0] - a[0]);

  let result = input;
  for (const [i, length, data] of expansions) {
    const best = findBestExpansions(data);
    const isExpansion = best.length === 1 && best[0].replace === true;

    const mainText = isExpansion ? best[0].expansion : best[0].original;
    const hoverText = isExpansion
      ? `Originally: ${best[0].original}`
      : best.map((d) => d.expansion).join("; OR ");

    result =
      result.substring(0, i) +
      hoverSpan(mainText, hoverText) +
      result.substring(i + length);
  }
  return result;
}
