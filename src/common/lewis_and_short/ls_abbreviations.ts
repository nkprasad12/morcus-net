import { readFileSync } from "fs";

import { assert, assertEqual } from "@/common/assert";
import { parseEntries, XmlNode } from "@/common/lewis_and_short/ls_parser";
import { AbbreviationTrie, TrieNode } from "./ls_styling";

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
  ["xr", new Map<string, string>([["v.", "look [at entry]"]])],
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
  ["v. n.", "verb [active forms only]"],
  ["v. a.", "verb [active and passive forms]"],
  ["v. freq. a.", `verb [frequentative, active and passive forms]`],
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

export const GENERIC_HOVERS = AbbreviationTrie.forMap(
  new Map<string, string>([
    ["ib.", "at the same place / citation"],
    ["id.", "the same author"],
  ])
);

export const GENERIC_EXPANSIONS = AbbreviationTrie.forMap(
  new Map<string, string>([
    // a. or act.,      active, -ly.
    // abbrev.,      abbreviated, -tion.
    //abl.,      ablative.
    // absol. or abs.,      absolute, -ly, i. e. without case or adjunct.
    ["abstr.", "abstract"],
    // acc.,      accusative or according.
    ["access.", "accessory"],
    // adj.,      adjective, -ly.
    // ad loc. or ad h. l.,      ad locum or ad hunc locum. (comment on this passage)
    // adv.,      adverb, -ial, -ially; or adversus.
    ["agric.", "agricultural"],
    ["agricult.", "agricultural"],
    // a. h. v.,      ad hanc vocem. (at this entry)
    // al.,      alii or alia, others or other.
    ["amplif.", "amplificative"],
    // analog.,      analogous, -ly.
    // antiq.,      antiquities. <- Seems to occur in other ways
    ["ap.", "apud (in)"],
    ["appel.", "appellative"],
    // append. or app.,      appendix. <- seems to occur in other ways
    ["Arab.", "Arabic"],
    // archit.,      architecture, -tural.
    // art.,      article.
    // aug.,      augmentative.
    // Aug.,      Augustan.
    // c.,      cum (with).
    // c. c.,      coupled with.
    ["cf.", "compare"],
    // chh.,      church.
    // class.,      classic, -al.
    // Cod.,      Codex (MS).
    // collat.,      collateral.
    // collect.,      collective, -ly.
    // com.,      commonly, comicus, comic, or in comedy.
    // comm. or c.,      common gender.
    // commentt.,      commentators.
    // comp.,      compare or comparative.
    // compd.,      compound.
    // concr.,      concrete.
    // conj.,      conjunction, conjunctive, or conjugation.
    // constr.,      construed, -ction.
    // contr.,      contracted, contraction, or contrary.
    // corresp.,      corresponding.
    // dat.,      dative.
    // decl.,      declension.
    // demonstr. or dem., demonstrative.
    // dep.,      deponent.
    // deriv.,      derived, -ative, -ation.
    // diff.,      differs or different.
    // dim.,      diminutive.
    // dissyl.,      dissyllable, -abic.
    // distr.,      distributive.
    ["dub.", "doubtful"],
    // eccl.,      ecclesiastical.
    // ed.,      editio or editor.
    // e. g.,      exempli gratiâ.
    // ellipt.,      elliptical, -ly.
    // elsewh.,      elsewhere.
    // epic.,      epicene.
    // epit.,      epitaph.
    // equiv.,      equivalent.
    // esp.,      especially.
    // etc.,      et cetera.
    ["etym.", "etymology"],
    // etym. etymology, -ical.
    // euphon.,      euphonic, -ny.
    // ex., exs.,      example, examples.
    // expl.,      explanation, explained.
    // express.,      expression.
    // ext.,      externa.
    // extr.,      extremo (at the end).
    // f. or fem.,      feminine.
    // fig.,      figure, -ative, -atively.
    // fin. or ad fin.,      at the end.
    // finit.,      finite (opp. to infinitive).
    // foll.,      following.
    // Fr.,      French.
    // fr.,      from.
    // fragm.,      frgm.,      or fr.,      fragmenta.
    // freq. or fr.,      frequentative or frequent, -ly.
    // fut.,      future.
    ["In gen.", "In general"],
    ["in gen.", "in general"],
    // gen.,      genitive or general.
    // geog.,      geography, -ical.
    // Germ.,      German.
    // Goth.,      Gothic.
    // Gr. Greek.
    // gr. or gram.,      grammar, -ian, -atical, grammatici.
    // h.,      hence.
    // h.l.,      hic locus (this passage).
    // h.v., h. vv.,      this word, these words.
    // Heb.,      Hebrew.
    // hibr.,      hybrid.
    // hist.,      history, -ian.
    // i. e.,      id est (that is, namely)
    // i. q.,      idem quod (the same as).
    // imper.,      imperative.
    // imperf.,      imperfect.
    // impers.,      impersonal, -ly.
    // in bon. part.,      in bonam partem. (positive)
    // in mal. part.,      in malam partem. (pejorative)
    // inanim.,      inanimate.
    // inch.,      inchoative, inceptive.
    // indecl.,      indeclinable.
    // indef.,      indefinite.
    // indic.,      indicative.
    ["inf.", "infinitive"],
    // init., in.,      or ad init.,      at the beginning.
    // inscrr.,      inscriptions.
    // intens.,      intensive.
    // interrog.,      interrogative, -tion.
    ["intr.", "intransitive"],
    ["Ital.", "Italian"],
    // JCtus.,      juris consultus.
    ["jurid.", "juridical"],
    ["kindr.", "kindred"],
    // l. c. or l. l.,      loco citato or laudato, in the place already cited above (in this same entry).
    // l.,      lege or lectio. (read! (X instead of Y); reading)
    // lang.,      language.
    // Lat.,      Latin.
    // leg.,      legit, legunt. (he/she reads; they read)
    // lex.,      lexicon.
    // lit.,      literal, in a literal sense.
    // Lith.,      Lithuanian.
    // m. or masc.,      masculine.
    // math.,      mathematics, -ical.
    // med.,      medio (in the middle).
    // medic.,      medical or medicine.
    // metaph.,      metaphorical, -ly.
    ["meton.", "by metonymy"],
    // mid. or med.,      medial; in a middle or reflexive sense.
    // milit.,      military, in military affairs.
    // MS.,      manuscript; MSS. manuscripts.
    // n. pr. or nom. propr.,      nomen proprium (proper name)
    // n. or neutr. neuter.
    // naut.,      nautical.
    // neg.,      negative, -ly.
    // no.,      numero.
    // nom.,      nominative.
    // num. or numer.,      numeral.
    // obj. or object.,      object, objective, -ly.
    // obl.,      oblique.
    // om.,      omit.
    // ["onomat.",      "onomatopoeia"],
    // opp.,      opposed to, opposite, -tion.
    // orig.,      originally.
    // p.,      page.
    // part.,      participle.
    // partit.,      partitive.
    // pass.,      passive, -ly, or passage.
    ["patr.", "patronymic"],
    // per.,      period.
    // perf.,      perfect.
    ["perh.", "perhaps"],
    // pers.,      personal, -ly.
    // philos.,      philosophy, -ical, -ically, -opher.
    // pl. or plur.,      plural.
    ["pleon.", "pleonastically"],
    // plqpf.,      plusquamperfectum.
    // plur. tant.,      used only in the plural.
    // poet.,      poetical, -ly.
    // polit.,      political, -ly.
    // posit. or pos.,      positive.
    // poss.,      possessive.
    // praef.,      praefatio.
    // praep.,      preposition.
    // preced.,      preceding.
    // pregn.,      pregnant, -ly.
    // prep.,      preposition.
    // pres.,      present.
    // prob.,      probably.
    // prol.,      prologus.
    // pron.,      pronoun.
    // prooem.,      prooemium.
    // prop.,      proper, -ly, in a proper sense.
    // prov. or proverb.,      proverbial, -ly.
    // q. v.,      quod videas. (look it up in that entry)
    ["qs.", "quasi"],
    // rad.,      radical or root.
    // rar.,      rare, -ly.
    // ref.,      refer, -ence.
    // rel.,      relative or reliquiae.
    // respect.,      respectūs.
    // rhet.,      rhetoric, -al; in rhetoric.
    // Rom.,      Roman.
    // s. h. v.,      sub hac voce. (in this entry)
    // saep.,      saepe.
    // saepis.,      saepissime.
    // sc.,      scilicet.
    // signif.,      signifies, -cation.
    // ["simp.",      "simple"],
    // ["Span.",      "Spanish"],
    // specif.,      specifically.
    // sq.,      sequens;
    // sqq.,      sequentes (and the following).
    // subj.,      subjunctive.
    // subject. or subj.,      subject, subjective. -ly.
    // subst.,      substantive, -ly.
    // suff.,      suffix.
    // sup.,      superlative or supine.
    // syll.,      syllable.
    // syn.,      synonym, -ymous.
    ["sync.", "syncopated"],
    // t. t.,      technical term.
    // tab.,      tabula (table, plate).
    // temp. tense or temporal.
    // term.,      terminus.
    // trag.,      tragicus, tragic, or in tragedy.
    // trans.,      translated, -tion.
    // transf.,      transferred.
    // trisyl.,      trisyllable, -abic.
    // trop.,      in a tropical or figurative sense.
    // usu.,      usual, -ly.
    // usu.,      usual, -ly.
    // v. h. v.,      vide hanc vocem. (see this entry)
    // v.,      verb, vide, or vox.
    // var. lect.,      varia lectio (different reading).
    ["vb.", "verb"],
    // voc.,      vocative.
  ])
);

export namespace LsAuthorAbbreviations {
  const authorMap = new Map<string, string>();
  const worksMap = new Map<string, Map<string, string>>();
  const worksTrieMap = new Map<string, TrieNode>();

  function populateMaps() {
    if (authorMap.size === 0) {
      const data = parseAuthorAbbreviations();
      for (const datum of data) {
        authorMap.set(datum.key, datum.expanded);
        worksMap.set(datum.key, datum.works);
        const root = new TrieNode();
        for (const [key, value] of datum.works.entries()) {
          root.add(key, value);
        }
        worksTrieMap.set(datum.key, root);
      }
    }
  }

  export function authors(): Map<string, string> {
    populateMaps();
    return authorMap;
  }

  export function works(): Map<string, Map<string, string>> {
    populateMaps();
    return worksMap;
  }

  export function worksTrie(): Map<string, TrieNode> {
    populateMaps();
    return worksTrieMap;
  }
}
