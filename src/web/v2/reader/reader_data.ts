import { ReaderWork } from "@/web/v2/reader/reader_types";

export const READER_WORKS: Record<string, ReaderWork> = {
  dbg: {
    id: "dbg",
    title: "Commentarii de Bello Gallico",
    englishTitle: "The Gallic War",
    author: "C. Iulius Caesar",
    textParts: ["book", "chapter", "section"],
    paginationDepth: 2,
    editor: "T. Rice Holmes (Clarendon Press, 1914)",
    translator: "W. A. McDevitte and W. S. Bohn (Harper & Brothers, 1869)",
    ctsUrn: "urn:cts:latinLit:phi0448.phi001.perseus-lat2",
    license:
      "Creative Commons Attribution-ShareAlike 4.0 International (CC-BY-SA 4.0)",
    sourceRepo: "https://github.com/PerseusDL/canonical-latinLit",
    pages: [
      {
        id: ["1", "1"],
        title: "Liber I, Caput I",
        sections: [
          {
            id: ["1", "1", "1"],
            latin:
              "Gallia est omnis divisa in partes tres, quarum unam incolunt Belgae, aliam Aquitani, tertiam qui ipsorum lingua Celtae, nostra Galli appellantur.",
            english:
              "All Gaul is divided into three parts, one of which the Belgae inhabit, the Aquitani another, those who in their own language are called Celts, in our Gauls, the third.",
          },
          {
            id: ["1", "1", "2"],
            latin:
              "Hi omnes lingua, institutis, legibus inter se differunt. Gallos ab Aquitanis Garumna flumen, a Belgis Matrona et Sequana dividit.",
            english:
              "All these differ from each other in language, customs and laws. The Garonne river separates the Gauls from the Aquitani; the Marne and the Seine separate them from the Belgae.",
          },
          {
            id: ["1", "1", "3"],
            latin:
              "Horum omnium fortissimi sunt Belgae, propterea quod a cultu atque humanitate provinciae longissime absunt, minimeque ad eos mercatores saepe commeant atque ea quae ad effeminandos animos pertinent important, proximique sunt Germanis, qui trans Rhenum incolunt, quibuscum continenter bellum gerunt.",
            english:
              "Of all these, the Belgae are the bravest, because they are farthest from the civilization and refinement of our Province, and merchants least frequently resort to them, and import those things which tend to effeminate the mind; and they are nearest to the Germans, who dwell beyond the Rhine, with whom they are continually waging war.",
          },
          {
            id: ["1", "1", "4"],
            latin:
              "Qua de causa Helvetii quoque reliquos Gallos virtute praecedunt, quod fere cotidianis proeliis cum Germanis contendunt, cum aut suis finibus eos prohibent aut ipsi in eorum finibus bellum gerunt.",
            english:
              "For which reason the Helvetii also surpass the rest of the Gauls in valor, as they contend with the Germans in almost daily battles, when they either repel them from their own territories, or themselves wage war on their frontiers.",
          },
        ],
      },
      {
        id: ["1", "2"],
        title: "Liber I, Caput II",
        sections: [
          {
            id: ["1", "2", "1"],
            latin:
              "Apud Helvetios longe nobilissimus fuit et ditissimus Orgetorix. Is M. Messala, M. Pisone consulibus regni cupiditate inductus coniurationem nobilitatis fecit et civitati persuasit ut de finibus suis cum omnibus copiis exirent.",
            english:
              "Among the Helvetii, Orgetorix was by far the most distinguished and wealthy. When Marcus Messala and Marcus Piso were consuls, incited by lust for sovereignty, he formed a conspiracy among the nobility, and persuaded the people to go forth from their territories with all their possessions.",
          },
          {
            id: ["1", "2", "2"],
            latin:
              "Perfacile esse, cum virtute omnibus praestarent, totius Galliae imperio potiri. Id hoc facilius iis persuasit, quod undique loci natura Helvetii continentur.",
            english:
              "Saying that it would be very easy, since they excelled all in valor, to acquire the empire of the whole of Gaul. To this he the more easily persuaded them, because the Helvetii are confined on every side by the nature of their situation.",
          },
          {
            id: ["1", "2", "3"],
            latin:
              "Una ex parte flumine Rheno latissimo atque altissimo, qui agrum Helvetium a Germanis dividit; altera ex parte monte Iura altissimo, qui est inter Sequanos et Helvetios; tertia lacu Lemanno et flumine Rhodano, qui provinciam nostram ab Helvetiis dividit.",
            english:
              "On one side by the Rhine, a very broad and deep river, which divides the Helvetian territory from the Germans; on a second side by the Jura, a very high mountain, which is situated between the Sequani and the Helvetii; on a third by Lake Lemannus, and by the river Rhone, which divides our Province from the Helvetii.",
          },
        ],
      },
    ],
  },
  catullus: {
    id: "catullus",
    title: "Carmina",
    englishTitle: "The Poems of Catullus",
    author: "C. Valerius Catullus",
    textParts: ["poem", "line"],
    paginationDepth: 1,
    editor: "Elmer Truesdell Merrill (Ginn & Company, 1893)",
    translator: "Leonard C. Smithers (1894)",
    ctsUrn: "urn:cts:latinLit:phi0472.phi001.perseus-lat2",
    license: "Public Domain",
    sourceRepo: "https://github.com/PerseusDL/canonical-latinLit",
    pages: [
      {
        id: ["5"],
        title: "Carmen V",
        sections: [
          {
            id: ["5", "1"],
            latin: "Vivamus, mea Lesbia, atque amemus,",
            english: "Let us live, my Lesbia, and let us love,",
          },
          {
            id: ["5", "2"],
            latin: "rumoresque senum severiorum",
            english: "and value all the talk of stern old men",
          },
          {
            id: ["5", "3"],
            latin: "omnes unius aestimemus assis!",
            english: "at one farthing's worth!",
          },
          {
            id: ["5", "4"],
            latin: "Soles occidere et redire possunt:",
            english: "Suns may set and rise again:",
          },
          {
            id: ["5", "5"],
            latin: "nobis cum semel occidit brevis lux,",
            english: "for us, when once our brief light has set,",
          },
          {
            id: ["5", "6"],
            latin: "nox est perpetua una dormienda.",
            english: "there is one perpetual night to be slept.",
          },
          {
            id: ["5", "7"],
            latin: "Da mi basia mille, deinde centum,",
            english: "Give me a thousand kisses, then a hundred,",
          },
          {
            id: ["5", "8"],
            latin: "dein mille altera, dein secunda centum,",
            english: "then another thousand, then a second hundred,",
          },
          {
            id: ["5", "9"],
            latin: "deinde usque altera mille, deinde centum.",
            english: "then still another thousand, then a hundred.",
          },
        ],
      },
    ],
  },
  aeneid: {
    id: "aeneid",
    title: "Aeneis",
    englishTitle: "The Aeneid",
    author: "P. Vergilius Maro",
    textParts: ["book", "line"],
    paginationDepth: 1,
    editor: "J. B. Greenough (Ginn & Company, 1900)",
    translator: "Theodore C. Williams (Houghton Mifflin, 1910)",
    ctsUrn: "urn:cts:latinLit:phi0690.phi003.perseus-lat2",
    license: "Public Domain",
    sourceRepo: "https://github.com/PerseusDL/canonical-latinLit",
    pages: [
      {
        id: ["1"],
        title: "Liber I",
        sections: [
          {
            id: ["1", "1"],
            latin: "Arma virumque cano, Troiae qui primus ab oris",
            english:
              "Arms and the man I sing, who first from the coasts of Troy",
          },
          {
            id: ["1", "2"],
            latin: "Italiam, fato profugus, Laviniaque venit",
            english: "to Italy and Lavinian shores, exiled by fate,",
          },
          {
            id: ["1", "3"],
            latin: "litora, multum ille et terris iactatus et alto",
            english: "came tossing much on land and sea",
          },
          {
            id: ["1", "4"],
            latin: "vi superum saevae memorem Iunonis ob iram;",
            english:
              "by force of heavenly powers, through cruel Juno's unforgetting wrath;",
          },
          {
            id: ["1", "5"],
            latin: "multa quoque et bello passus, dum conderet urbem,",
            english:
              "much also in war he suffered, till he could found a city,",
          },
          {
            id: ["1", "6"],
            latin: "inferretque deos Latio, genus unde Latinum,",
            english:
              "and bring his gods to Latium, whence came the Latin race,",
          },
          {
            id: ["1", "7"],
            latin: "Albanique patres, atque altae moenia Romae.",
            english: "the Alban fathers, and the towering walls of Rome.",
          },
        ],
      },
    ],
  },
  amphitruo: {
    id: "amphitruo",
    title: "Amphitruo",
    englishTitle: "Amphitryon",
    author: "T. Maccius Plautus",
    textParts: ["act", "scene", "line"],
    paginationDepth: 2,
    editor: "F. Leo (Weidmann, 1895)",
    translator: "Henry Thomas Riley (G. Bell & Sons, 1912)",
    ctsUrn: "urn:cts:latinLit:phi0119.phi001.perseus-lat2",
    license: "Public Domain",
    sourceRepo: "https://github.com/PerseusDL/canonical-latinLit",
    pages: [
      {
        id: ["1", "1"],
        title: "Actus I, Scaena I",
        sections: [
          {
            id: ["1", "1", "1"],
            latin:
              "Qui me alter est audacior homo aut qui confidentior, iuventutis mores qui sciam, qui hoc noctis solus ambulem?",
            english:
              "What other person is bolder or more audacious than myself, who, knowing the habits of the young men, am walking alone at this time of night?",
          },
          {
            id: ["1", "1", "2"],
            latin:
              "Quid faciam nunc, si tres aut quattuor me in carcerem compingant homines, qui me despolient?",
            english:
              "What should I do now, if three or four people should thrust me into prison and strip me?",
          },
          {
            id: ["1", "1", "3"],
            latin:
              "Nec quisquam sit qui me defendat nec quisquam qui auxilium ferat.",
            english:
              "Nor would there be any one to defend me, nor any one to bring me assistance.",
          },
        ],
      },
    ],
  },
};

export function getReaderWork(id: string): ReaderWork {
  return READER_WORKS[id] || READER_WORKS.dbg;
}

export function getAllReaderWorks(): ReaderWork[] {
  return Object.values(READER_WORKS);
}
