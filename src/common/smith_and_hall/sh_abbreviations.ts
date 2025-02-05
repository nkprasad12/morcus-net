import {
  AbbreviationData,
  AbbreviationTrie,
  ExpansionData,
  GenericExpansion,
  GenericTrieNode,
  MatchContext,
  areExpansionsDisjoint,
  findExpansions,
} from "@/common/abbreviations/abbreviations";
import { SH_AUTHORS_PROCESSED } from "@/common/smith_and_hall/sh_authors_processed";
import { assert } from "@/common/assert";
import { XmlChild, XmlNode } from "@/common/xml/xml_node";
import { arrayMap } from "@/common/data_structures/collect_map";

const CITATION_CHARS = /^[A-Za-z0-9., ]$/;
const CITATION_TRIMS = /^[A-Za-z ]$/;

export interface AuthorData extends MatchContext {
  abbreviations: string[];
  expansions: string;
  date?: string;
  works?: [string[], string][];
}

const SH_EXPANDABLE_HOVERS: AbbreviationData[] = [
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
  // ["Fr.", "French."],
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
  ["usu.", "usual(ly)."],
];

const SH_COMBINED_EXPANSIONS = AbbreviationTrie.from(
  [...GENERIC_SH_HOVERS, ...SH_EXPANDABLE_HOVERS],
  []
);

const SH_AUTHOR_TRIE: GenericTrieNode<AuthorData> = GenericTrieNode.withValues(
  SH_AUTHORS_PROCESSED.flatMap((data) =>
    data.abbreviations.map((abbreviation): [string, AuthorData] => [
      abbreviation,
      data,
    ])
  )
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

function hoverSpan(mainText: string, hoverText: string): XmlNode {
  return new XmlNode(
    "span",
    [
      ["class", "lsHover"],
      ["title", hoverText],
    ],
    [mainText]
  );
}

interface ShCitation {
  /** The start index of the citation in the raw string. */
  i: number;
  /** The length of the citation in the raw string. */
  len: number;
  /** The length of the author portion in the raw string. */
  authLen: number;
  /** The possible authors associated with this citation. */
  authorDatas: AuthorData[];
}

function findCitations(
  input: string,
  authorMatches: GenericExpansion<AuthorData>[]
) {
  // Sort them by start index because we want to make sure that something like
  // Cic. Quint. isn't parsed as Cicero Quintilian, etc...
  authorMatches.sort((a, b) => a[0] - b[0]);
  let lastConsumed = -1;
  const n = input.length;
  const results: ShCitation[] = [];
  for (const match of authorMatches) {
    if (lastConsumed >= match[0]) {
      continue;
    }
    // Pick up any "citation-esque" characters after the author.
    lastConsumed = match[0] + match[1];
    while (lastConsumed < n && CITATION_CHARS.test(input[lastConsumed])) {
      lastConsumed += 1;
    }
    lastConsumed = lastConsumed - 1;
    // Trim any regular words at the end of the citation.
    for (; lastConsumed >= match[0] + match[1]; lastConsumed--) {
      if (!CITATION_TRIMS.test(input[lastConsumed])) {
        break;
      }
    }
    if (input.substring(match[0], lastConsumed + 1).endsWith(" Fig.")) {
      // console.log(
      //   "Trimmed fig " + input.substring(match[0], lastConsumed + 1 - match[0])
      // );
      lastConsumed -= 5;
    }
    // Similarly, figure out something for `in X` where it's an author cited by another ancient author.
    //

    // TODO: Fix this to ensure that long strings of words aren't automatically included.
    // e.g. all of:
    // Cic. De Oratore. 2, 2, 5, omnia ... bene ei sunt dicenda, qui hoc se posse profitetur,
    // ends up tagged as part of the quote. and similarly:
    // Cic. When a number of words are connected, the latter mode is usually preferred unless special emphasis is needed.
    results.push({
      i: match[0],
      len: lastConsumed + 1 - match[0],
      authLen: match[1],
      authorDatas: match[2],
    });
  }
  return results;
}

export const unmatched = arrayMap<AuthorData, string>();

function matchedWorks(
  citation: string,
  authors: AuthorData[]
): [string, string, AuthorData][] {
  if (citation.trim().length === 0) {
    return [];
  }
  const matches: [string, string, AuthorData][] = [];
  for (const author of authors) {
    for (const [workAbbrs, workName] of author.works || []) {
      for (const workAbbr of workAbbrs) {
        if (citation.includes(workAbbr)) {
          matches.push([workAbbr, workName, author]);
        }
      }
    }
  }
  if (matches.length === 0 && !/^[ ]*[0-9,.]+/.test(citation)) {
    unmatched.add(authors[0], citation);
  }
  const longest = Math.max(...matches.map((match) => match[0].length));
  return matches.filter((match) => match[0].length === longest);
}

function attachWorkExpansion(
  citation: string,
  matches: [string, string, AuthorData][]
): XmlChild[] {
  if (citation.length === 0) {
    return [];
  }
  if (matches.length !== 1) {
    return [citation];
  }
  const [abbreviation, expansion, _] = matches[0];
  const i = citation.indexOf(abbreviation);
  assert(i !== -1);
  return [
    citation.substring(0, i),
    new XmlNode(
      "span",
      [
        ["class", "lsHover"],
        ["title", expansion],
      ],
      [abbreviation]
    ),
    citation.substring(i + abbreviation.length),
  ].filter((x) => typeof x !== "string" || x.length > 0);
}

export function markupCitations(input: string): XmlChild[] {
  // TODO: Handle `id.`.
  const matches = findExpansions(input, SH_AUTHOR_TRIE);
  const citations = findCitations(input, matches);
  citations.sort((a, b) => b.i - a.i);
  const result: XmlChild[] = [input];
  for (const citation of citations) {
    const firstChunk = XmlNode.assertIsString(result[0]);
    const i = citation.i;
    const length = citation.len;
    const afterAuthorText = firstChunk.substring(
      i + citation.authLen,
      i + length
    );

    const works = matchedWorks(afterAuthorText, citation.authorDatas);
    const possibleAuthors =
      works.length === 0 ? citation.authorDatas : works.map((work) => work[2]);
    const hover = possibleAuthors
      .flatMap(
        (data) =>
          data.expansions + (data.date === undefined ? "" : ` ${data.date}`)
      )
      .join("; or ");

    result.splice(
      0,
      1,
      ...[
        firstChunk.substring(0, i),
        new XmlNode(
          "span",
          [["class", "lsBibl"]],
          [
            new XmlNode(
              "span",
              [
                ["class", "lsHover lsAuthor"],
                ["title", hover],
              ],
              [firstChunk.substring(i, i + citation.authLen)]
            ),
            ...attachWorkExpansion(afterAuthorText, works),
          ]
        ),
        firstChunk.substring(i + length),
      ].filter((x) => typeof x !== "string" || x.length > 0)
    );
  }
  return result;
}

export function expandShAbbreviationsIn(input: string): XmlChild[] {
  const expansions = findExpansions(input, SH_COMBINED_EXPANSIONS);
  assert(areExpansionsDisjoint(expansions), input);
  expansions.sort((a, b) => b[0] - a[0]);

  const result: XmlChild[] = [input];
  for (const [i, length, data] of expansions) {
    const best = findBestExpansions(data);
    assert(best[0].replace !== true);
    const mainText = best[0].original;
    const hoverText = best.map((d) => d.expansion).join("; OR ");

    const firstChunk = XmlNode.assertIsString(result[0]);
    result.splice(
      0,
      1,
      firstChunk.substring(0, i),
      hoverSpan(mainText, hoverText),
      firstChunk.substring(i + length)
    );
  }
  return result.flatMap((child) =>
    typeof child === "string" ? markupCitations(child) : child
  );
}
