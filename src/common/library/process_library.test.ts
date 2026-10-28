import { setupFakeHypotacticData } from "@/common/library/hypotactic_test_helper";
import { LatinWorks } from "@/common/library/library_constants";
import {
  decorateDocumentInfo,
  extractWorkMetadata,
  processLibrary,
  SHORT_TITLE_BY_WORK_ID,
  stripXmlProlog,
  URL_NAME_BY_WORK_ID,
  urlify,
} from "@/common/library/process_library";
import { parseRawXml } from "@/common/xml/xml_utils";
import { replaceEnvVar } from "@/common/test_helpers";
import {
  getV2LibrarySummaries,
  getV2Work,
  resolvePageInWork,
} from "@/web/ui/reader/reader_loader.server";
import fs from "fs";

console.debug = jest.fn();
console.log = jest.fn();

const LIB_DIR = "process_library_test_ts";
const CORPUS_INPUT_DIR = "process_library_corpus_test_ts";
const DBG_PATH =
  "texts/latin/perseus/data/phi0448/phi001/phi0448.phi001.perseus-lat2.xml";

const ORIGINAL_MORCEUS_DATA_ROOT = process.env.MORCEUS_DATA_ROOT;
const FAKE_MORCEUS_DATA_ROOT = "src/morceus/testdata";

function setupFakePhiDir() {
  const testDataRoot = fs.mkdtempSync("phi-testdata-");
  replaceEnvVar("PHI_JSON_ROOT", testDataRoot);

  afterAll(() => {
    try {
      fs.rmSync(testDataRoot, { recursive: true, force: true });
    } catch (error) {
      console.error("Error cleaning up test data:", error);
    }
  });
}

setupFakeHypotacticData();
setupFakePhiDir();

beforeAll(() => {
  process.env.MORCEUS_DATA_ROOT = FAKE_MORCEUS_DATA_ROOT;
  if (!fs.existsSync(LIB_DIR)) {
    fs.mkdirSync(LIB_DIR, { recursive: true });
  }
});

afterAll(() => {
  try {
    fs.rmSync(LIB_DIR, { recursive: true, force: true });
    fs.rmSync(CORPUS_INPUT_DIR, { recursive: true, force: true });
  } catch {}
  process.env.MORCEUS_DATA_ROOT = ORIGINAL_MORCEUS_DATA_ROOT;
});

describe("Library Processing", () => {
  test("stores works and pages in SQLite that load by id", async () => {
    await processLibrary({
      outputDir: LIB_DIR,
      corpusInputDir: CORPUS_INPUT_DIR,
      works: [DBG_PATH],
    });
    const result = await getV2Work("phi0448.phi001.perseus-lat2", LIB_DIR);
    expect(result?.author).toBe("Julius Caesar");
    expect(result?.tocHtml).toContain("reader-toc-item");
    const { page } = resolvePageInWork(result!, "1.1");
    expect(page).toBe(result!.pages[0]);
    expect(page.singleHtml).toContain("Gallia est omnis divisa");
  });

  test("indexes works by author and name slug", async () => {
    await processLibrary({
      outputDir: LIB_DIR,
      corpusInputDir: CORPUS_INPUT_DIR,
      works: [DBG_PATH],
    });
    const dbg = await getV2Work("caesar/de_bello_gallico", LIB_DIR);
    expect(dbg?.id).toBe("phi0448.phi001.perseus-lat2");
  });

  test("returns sorted work summaries", async () => {
    await processLibrary({
      outputDir: LIB_DIR,
      corpusInputDir: CORPUS_INPUT_DIR,
      works: [DBG_PATH],
    });
    const result = await getV2LibrarySummaries(LIB_DIR);

    expect(result.map((s) => s.id)).toEqual([
      "hypotactic_Eclogues_Calpurnius Siculus",
      "hypotactic_Odes_Horace",
      "phi0448.phi001.perseus-lat2",
      "hypotactic_Heroides_Ovid",
      "hypotactic_Metamorphoses_Ovid",
    ]);
  });
});

describe("stripXmlProlog", () => {
  const ROOT = `<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body>Gallia</body></text></TEI>`;
  // The prologs found in canonical-latinLit, verbatim.
  const P4_DOCTYPE = `<!DOCTYPE TEI.2 PUBLIC "-//TEI P4//DTD Main DTD Driver File//EN" "http://www.tei-c.org/Guidelines/DTD/tei2.dtd" [
<!ENTITY % TEI.XML "INCLUDE">
<!ENTITY % PersProse PUBLIC "-//Perseus P4//DTD Perseus Prose//EN" "http://www.perseus.tufts.edu/DTD/1.0/PersProse.dtd" >
%PersProse;
]>`;
  const P4_DOCTYPE_TIGHT = `<!DOCTYPE TEI.2 PUBLIC "-//TEI P4//DTD Main DTD Driver File//EN" "http://www.tei-c.org/Guidelines/DTD/tei2.dtd"[
<!ENTITY % TEI.XML "INCLUDE">
<!ENTITY % PersProse PUBLIC "-//Perseus P4//DTD Perseus Prose//EN" "http://www.perseus.tufts.edu/DTD/1.0/PersProse.dtd">
%PersProse;
]>`;
  const XML_MODEL = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-model href="http://www.stoa.org/epidoc/schema/latest/tei-epidoc.rng"
  schematypens="http://relaxng.org/ns/structure/1.0"?>
<?xml-model href="http://www.stoa.org/epidoc/schema/latest/tei-epidoc.rng"
  schematypens="http://purl.oclc.org/dsdl/schematron"?>`;

  it.each([
    ["no prolog", ""],
    ["an XML declaration", `<?xml version='1.0' encoding='UTF-8'?>\n`],
    ["xml-model instructions", `${XML_MODEL}\n`],
    [
      "xml-model instructions and a comment",
      `${XML_MODEL}\n<!-- https://epidoc.stoa.org/schema/latest/tei-epidoc.rng -->\n`,
    ],
    ["a P4 DOCTYPE with an internal subset", `${P4_DOCTYPE}\n`],
    ["a P4 DOCTYPE with no space before its subset", `${P4_DOCTYPE_TIGHT}\n`],
    [
      "a declaration and a P4 DOCTYPE",
      `<?xml version="1.0"?>\n${P4_DOCTYPE}\n`,
    ],
    ["a byte order mark", `\uFEFF<?xml version="1.0"?>\n`],
    ["a DOCTYPE without a subset", `<!DOCTYPE TEI SYSTEM "tei.dtd">\n`],
    [
      "a subset with a comment and a quoted ]>",
      `<!DOCTYPE TEI [ <!-- ]> --> <!ENTITY x "]>"> ]>\n`,
    ],
  ])("removes %s", (_, prolog) => {
    const stripped = stripXmlProlog(prolog + ROOT);

    expect(stripped).toBe(ROOT);
    expect(parseRawXml(stripped).name).toBe("TEI");
  });

  it("leaves the body alone", () => {
    const body = `<TEI><text><!-- c --><?pi x?><body>a</body></text></TEI>`;
    expect(stripXmlProlog(`<?xml version="1.0"?>${body}`)).toBe(body);
  });

  it("throws on an unterminated DOCTYPE", () => {
    expect(() => stripXmlProlog(`<!DOCTYPE TEI [ <!ENTITY x "y">`)).toThrow();
  });
});

/**
 * Phase 2B works whose slugs and short titles are pinned before `@runner`
 * adds them to `LatinWorks`. Drop each id once it is onboarded.
 */
const PINNED_PHASE_2B_WORKS = new Set<string>([
  "stoa0045.stoa016.perseus-lat2",
]);

describe("pinned slugs", () => {
  it("pin only onboarded (or Phase 2B) works", () => {
    const onboarded = new Set<string>(Object.values(LatinWorks));
    for (const id of [
      ...URL_NAME_BY_WORK_ID.keys(),
      ...SHORT_TITLE_BY_WORK_ID.keys(),
    ]) {
      expect(onboarded.has(id) || PINNED_PHASE_2B_WORKS.has(id)).toBe(true);
    }
  });

  it("pin distinct slugs within an author", () => {
    // Jerome's and Sidonius's letters may share `epistulae`.
    const byAuthor = new Map<string, string[]>();
    for (const [id, slug] of URL_NAME_BY_WORK_ID) {
      const author = id.split(".")[0];
      byAuthor.set(author, [...(byAuthor.get(author) ?? []), slug]);
    }
    for (const slugs of byAuthor.values()) {
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });
});

describe("urlify", () => {
  const NONE = new Map<string, string>();

  it("lower-cases and joins words with underscores", () => {
    expect(urlify("De Bello Gallico", NONE)).toBe("de_bello_gallico");
  });

  it("collapses whitespace, including line breaks", () => {
    expect(urlify(" Gratiarum  Actio\n                    Ad ", NONE)).toBe(
      "gratiarum_actio_ad"
    );
  });

  it("drops punctuation and collapses the underscores it leaves", () => {
    expect(urlify("Firmus Saturninus, Proculus et Bonosus", NONE)).toBe(
      "firmus_saturninus_proculus_et_bonosus"
    );
    expect(urlify("Quomodo Trinitas (De Trinitate)", NONE)).toBe(
      "quomodo_trinitas_de_trinitate"
    );
    expect(urlify("Epistulae. Selections.", NONE)).toBe("epistulae_selections");
    expect(urlify("Res Rustica, Books I-IX", NONE)).toBe(
      "res_rustica_books_i-ix"
    );
  });

  it("removes accents rather than letters", () => {
    expect(urlify("Ōrātiō Prō Caeliō", NONE)).toBe("oratio_pro_caelio");
  });

  it("uses a custom entry verbatim", () => {
    const customs = new Map([["Pro A. Caecina", "pro_a._caecina"]]);
    expect(urlify("Pro A. Caecina", customs)).toBe("pro_a._caecina");
  });

  it("rejects input with nothing to slug", () => {
    expect(() => urlify(" ., ", NONE)).toThrow(/Empty URL slug/);
  });
});

/**
 * The reader URL (`urlAuthor/urlName`) of every onboarded work, from the
 * author and title its source gives. Existing URLs must never move: if one of
 * these fails, pin the old slug in `URL_NAME_BY_WORK_ID` or
 * `AUTHOR_TO_URL_LOOKUP` rather than editing this table. The only intended
 * move so far is Seneca the Younger's Perseus works, from
 * `seneca,_lucius_annaeus` to `seneca_minor` in Phase 2B (the old URLs
 * redirect).
 */
const ONBOARDED_SLUGS: [string, string, string, string][] = [
  [
    "phi0978.phi001.perseus-lat2",
    "Pliny the Elder",
    "Naturalis Historia",
    "pliny_the_elder/naturalis_historia",
  ],
  [
    "phi1212.phi002.perseus-lat1",
    "Apuleius",
    "Metamorphoses",
    "apuleius/metamorphoses",
  ],
  [
    "phi0914.phi001.perseus-lat2",
    "Titus Livius (Livy)",
    "Ab urbe condita",
    "livy/ab_urbe_condita",
  ],
  [
    "phi0448.phi001.perseus-lat2",
    "Julius Caesar",
    "De bello Gallico",
    "caesar/de_bello_gallico",
  ],
  [
    "phi0448.phi002.perseus-lat2",
    "Julius Caesar",
    "De Bello Civili",
    "caesar/de_bello_civili",
  ],
  [
    "phi0474.phi001.perseus-lat2",
    "M. Tullius Cicero",
    "Pro P. Quinctio",
    "cicero/pro_quinctio",
  ],
  [
    "phi0474.phi003.perseus-lat2",
    "M. Tullius Cicero",
    "Pro Q. Roscio Comoedo",
    "cicero/quintus_roscius",
  ],
  [
    "phi0474.phi004.perseus-lat2",
    "M. Tullius Cicero",
    "Divinatio in Q. Caecilium",
    "cicero/divinatio_in_q._caecilium",
  ],
  [
    "phi0474.phi007.perseus-lat2",
    "M. Tullius Cicero",
    "Pro M. Fonteio",
    "cicero/pro_fonteio",
  ],
  [
    "phi0474.phi008.perseus-lat2",
    "M. Tullius Cicero",
    "Pro A. Caecina",
    "cicero/pro_a._caecina",
  ],
  [
    "phi0474.phi011.perseus-lat2",
    "M. Tullius Cicero",
    "De Lege Agraria",
    "cicero/de_lege_agraria",
  ],
  [
    "phi0474.phi012.perseus-lat2",
    "M. Tullius Cicero",
    "Pro C. Rabirio Perduellionis Reo Ad Quirites",
    "cicero/pro_rabirio_perduellionis_reo",
  ],
  [
    "phi0474.phi013.perseus-lat2",
    "M. Tullius Cicero",
    "In L. Catilinam",
    "cicero/in_catilinam",
  ],
  [
    "phi0474.phi015.perseus-lat2",
    "M. Tullius Cicero",
    "Pro P. Sulla",
    "cicero/pro_p._sulla",
  ],
  [
    "phi0474.phi016.perseus-lat2",
    "M. Tullius Cicero",
    "Pro Archia Poeta",
    "cicero/pro_archia_poeta",
  ],
  [
    "phi0474.phi017.perseus-lat2",
    "M. Tullius Cicero",
    "Pro L. Flacco",
    "cicero/pro_l._flacco",
  ],
  [
    "phi0474.phi018.perseus-lat2",
    "M. Tullius Cicero",
    "Cum Populo Gratias Egit",
    "cicero/cum_populo_gratias_egi",
  ],
  [
    "phi0474.phi019.perseus-lat2",
    "M. Tullius Cicero",
    "Cum Senatui Gratias Egit",
    "cicero/cum_senatui_gratias_egit",
  ],
  [
    "phi0474.phi020.perseus-lat2",
    "M. Tullius Cicero",
    "De Domo Sua Ad Pontifices",
    "cicero/de_domo_sua",
  ],
  [
    "phi0474.phi021.perseus-lat2",
    "M. Tullius Cicero",
    "De Haruspicum Responso in P. Clodium in Senatu Habita",
    "cicero/de_haruspicum_responso",
  ],
  [
    "phi0474.phi022.perseus-lat2",
    "M. Tullius Cicero",
    "Pro P. Sestio",
    "cicero/pro_p._sestio",
  ],
  [
    "phi0474.phi023.perseus-lat2",
    "M. Tullius Cicero",
    "In P. Vatinium Testem Interrogatio",
    "cicero/in_p_vatinium",
  ],
  [
    "phi0474.phi024.perseus-lat2",
    "M. Tullius Cicero",
    "Pro M. Caelio",
    "cicero/pro_m._caelio",
  ],
  [
    "phi0474.phi025.perseus-lat2",
    "M. Tullius Cicero",
    "De Provinciis Consularibus In Senatu",
    "cicero/de_provinciis_consularibus",
  ],
  [
    "phi0474.phi026.perseus-lat2",
    "M. Tullius Cicero",
    "Pro L. Cornelio Balbo",
    "cicero/pro_balbo",
  ],
  [
    "phi0474.phi028.perseus-lat2",
    "M. Tullius Cicero",
    "Pro Cn. Plancio",
    "cicero/pro_cn._plancio",
  ],
  [
    "phi0474.phi029.perseus-lat2",
    "M. Tullius Cicero",
    "Pro M. Scauro",
    "cicero/pro_m._scauro",
  ],
  [
    "phi0474.phi030.perseus-lat2",
    "M. Tullius Cicero",
    "Pro C. Rabirio Postumo",
    "cicero/pro_rabirio_postumo",
  ],
  [
    "phi0474.phi031.perseus-lat2",
    "M. Tullius Cicero",
    "Pro T. Annio Milone",
    "cicero/pro_t._annio_milone",
  ],
  [
    "phi0474.phi032.perseus-lat2",
    "M. Tullius Cicero",
    "Pro M. Marcello",
    "cicero/pro_m._marcello",
  ],
  [
    "phi0474.phi033.perseus-lat2",
    "M. Tullius Cicero",
    "Pro Q. Ligario",
    "cicero/pro_q._ligario",
  ],
  [
    "phi0474.phi034.perseus-lat2",
    "M. Tullius Cicero",
    "Pro Rege Deiotaro Ad. C. Caesarem",
    "cicero/pro_rege_deiotaro",
  ],
  [
    "phi0474.phi035.perseus-lat2",
    "M. Tullius Cicero",
    "Philippicae",
    "cicero/philippicae",
  ],
  [
    "phi0474.phi036.perseus-lat2",
    "M. Tullius Cicero",
    "De Inventione",
    "cicero/de_inventione",
  ],
  [
    "phi0474.phi037.perseus-lat2",
    "M. Tullius Cicero",
    "De Oratore",
    "cicero/de_oratore",
  ],
  [
    "phi0474.phi038.perseus-lat2",
    "M. Tullius Cicero",
    "Partitiones Oratoriae",
    "cicero/de_partitione_oratoria",
  ],
  [
    "phi0474.phi039.perseus-lat2",
    "M. Tullius Cicero",
    "Brutus",
    "cicero/brutus",
  ],
  [
    "phi0474.phi040.perseus-lat2",
    "M. Tullius Cicero",
    "Orator",
    "cicero/orator",
  ],
  [
    "phi0474.phi041.perseus-lat2",
    "M. Tullius Cicero",
    "De Optimo Genere Oratorum",
    "cicero/de_optimo_genere_oratorum",
  ],
  [
    "phi0474.phi043.perseus-lat2",
    "M. Tullius Cicero",
    "De Re Publica",
    "cicero/de_republica",
  ],
  [
    "phi0474.phi046.perseus-lat2",
    "M. Tullius Cicero",
    "Lucullus",
    "cicero/lucullus",
  ],
  [
    "phi0474.phi048.perseus-lat2",
    "M. Tullius Cicero",
    "de Finibus Bonorum et Malorum",
    "cicero/de_finibus_bonorum_et_malorum",
  ],
  [
    "phi0474.phi051.perseus-lat2",
    "M. Tullius Cicero",
    "Cato Maior De Senectute",
    "cicero/de_senectute",
  ],
  [
    "phi0474.phi052.perseus-lat2",
    "M. Tullius Cicero",
    "Laelius De Amicitia",
    "cicero/laelius_de_amicitia",
  ],
  [
    "phi0474.phi054.perseus-lat2",
    "M. Tullius Cicero",
    "De Fato",
    "cicero/de_fato",
  ],
  [
    "phi0474.phi055.perseus-lat2",
    "M. Tullius Cicero",
    "De Officiis",
    "cicero/de_officiis",
  ],
  [
    "phi0474.phi072.perseus-lat2",
    "M. Tullius Cicero",
    "Timaeus",
    "cicero/timaeus",
  ],
  [
    "phi0975.phi001.perseus-lat2",
    "Phaedrus",
    "Fabulae Aesopiae",
    "phaedrus/fabulae_aesopiae",
  ],
  [
    "phi0472.phi001.perseus-lat2",
    "C. Valerius Catullus",
    "Carmina",
    "catullus/carmina",
  ],
  ["phi0959.phi001.perseus-lat2", "P. Ovidius Naso", "Amores", "ovid/amores"],
  [
    "phi0959.phi002.perseus-lat2",
    "P. Ovidius Naso",
    "Epistulae",
    "ovid/epistulae",
  ],
  [
    "phi0959.phi003.perseus-lat2",
    "P. Ovidius Naso",
    "Medicamina faciei femineae",
    "ovid/medicamina",
  ],
  [
    "phi0959.phi004.perseus-lat2",
    "P. Ovidius Naso",
    "Ars Amatoria",
    "ovid/ars_amatoria",
  ],
  [
    "phi1351.phi001.perseus-lat2",
    "Cornelius Tacitus",
    "Vita Agricolae",
    "tacitus/agricola",
  ],
  [
    "phi1351.phi002.perseus-lat1",
    "Cornelius Tacitus",
    "de Origine et Situ Germanorum Liber",
    "tacitus/germania",
  ],
  [
    "phi1351.phi003.perseus-lat1",
    "Cornelius Tacitus",
    "Dialogus de Oratoribus",
    "tacitus/dialogus_de_oratoribus",
  ],
  ["phi1276.phi001.perseus-lat2", "Juvenal", "Saturae", "juvenal/saturae"],
  [
    "phi0631.phi001.perseus-lat4",
    "Sallust",
    "The Catilinarian Conspiracy",
    "sallust/catalina1",
  ],
  [
    "phi0631.phi002.perseus-lat4",
    "Sallust",
    "The Jugurthine War",
    "sallust/the_jugurthine_war",
  ],
  [
    "phi0550.phi001.perseus-lat1",
    "Lucretius",
    "De Rerum Natura",
    "lucretius/de_rerum_natura",
  ],
  [
    "phi0588.abo001.perseus-lat2",
    "Cornelius Nepos",
    "Miltiades",
    "cornelius_nepos/miltiades",
  ],
  [
    "phi0588.abo002.perseus-lat2",
    "Cornelius Nepos",
    "Themistocles",
    "cornelius_nepos/themistocles",
  ],
  [
    "phi0588.abo003.perseus-lat2",
    "Cornelius Nepos",
    "Aristides",
    "cornelius_nepos/aristides",
  ],
  [
    "phi0588.abo004.perseus-lat2",
    "Cornelius Nepos",
    "Pausanias",
    "cornelius_nepos/pausanias",
  ],
  [
    "phi0588.abo005.perseus-lat2",
    "Cornelius Nepos",
    "Cimon",
    "cornelius_nepos/cimon",
  ],
  [
    "phi0588.abo006.perseus-lat2",
    "Cornelius Nepos",
    "Lysander",
    "cornelius_nepos/lysander",
  ],
  [
    "phi0588.abo007.perseus-lat2",
    "Cornelius Nepos",
    "Alcibiades",
    "cornelius_nepos/alcibiades",
  ],
  [
    "phi0588.abo008.perseus-lat2",
    "Cornelius Nepos",
    "Thrasybulus",
    "cornelius_nepos/thrasybulus",
  ],
  [
    "phi0588.abo009.perseus-lat2",
    "Cornelius Nepos",
    "Conon",
    "cornelius_nepos/conon",
  ],
  [
    "phi0588.abo010.perseus-lat2",
    "Cornelius Nepos",
    "Dion",
    "cornelius_nepos/dion",
  ],
  [
    "phi0588.abo011.perseus-lat2",
    "Cornelius Nepos",
    "Iphicrates",
    "cornelius_nepos/iphicrates",
  ],
  [
    "phi0588.abo012.perseus-lat2",
    "Cornelius Nepos",
    "Chabrias",
    "cornelius_nepos/chabrias",
  ],
  [
    "phi0588.abo013.perseus-lat2",
    "Cornelius Nepos",
    "Timotheus",
    "cornelius_nepos/timotheus",
  ],
  [
    "phi0588.abo014.perseus-lat2",
    "Cornelius Nepos",
    "Datames",
    "cornelius_nepos/datames",
  ],
  [
    "phi0588.abo015.perseus-lat2",
    "Cornelius Nepos",
    "Epaminondas",
    "cornelius_nepos/epaminondas",
  ],
  [
    "phi0588.abo016.perseus-lat2",
    "Cornelius Nepos",
    "Pelopidas",
    "cornelius_nepos/pelopidas",
  ],
  [
    "phi0588.abo017.perseus-lat2",
    "Cornelius Nepos",
    "Agesilaus",
    "cornelius_nepos/agesilaus",
  ],
  [
    "phi0588.abo018.perseus-lat2",
    "Cornelius Nepos",
    "Eumenes",
    "cornelius_nepos/eumenes",
  ],
  [
    "phi0588.abo019.perseus-lat2",
    "Cornelius Nepos",
    "Phocion",
    "cornelius_nepos/phocion",
  ],
  [
    "phi0588.abo020.perseus-lat2",
    "Cornelius Nepos",
    "Timoleon",
    "cornelius_nepos/timoleon",
  ],
  [
    "phi0588.abo021.perseus-lat2",
    "Cornelius Nepos",
    "De Regibus",
    "cornelius_nepos/de_regibus",
  ],
  [
    "phi0972.phi001.perseus-lat2",
    "Petronius",
    "Satyricon",
    "petronius/satyricon",
  ],
  [
    "stoa0023.stoa001.perseus-lat2",
    "Ammianus Marcellinus",
    "Res Gestae",
    "ammianus_marcellinus/res_gestae",
  ],
  ["phi0660.phi001.perseus-lat2", "Tibullus", "Elegiae", "tibullus/elegiae"],
  [
    "phi0660.phi003.perseus-lat2",
    "Sulpicia",
    "Carmina Omnia",
    "sulpicia/carmina_omnia",
  ],
  [
    "stoa0238.stoa001.perseus-lat2",
    "Prudentius",
    "Peristephanon Liber",
    "prudentius/peristephanon_liber",
  ],
  [
    "stoa0203.stoa001.perseus-lat2",
    "Minucius Felix",
    "Octavius",
    "minucius_felix/octavius",
  ],
  [
    "phi0860.phi001.perseus-lat2",
    "Curtius Rufus, Quintus",
    "Historiae Alexandri Magni",
    "curtius_rufus,_quintus/historiae_alexandri_magni",
  ],
  [
    "phi1014.phi001.perseus-lat1",
    "Seneca the Elder",
    "Controversiae",
    "seneca_the_elder/controversiae",
  ],
  [
    "phi1014.phi004.perseus-lat1",
    "Seneca the Elder",
    "Fragmenta",
    "seneca_the_elder/fragmenta",
  ],
  [
    "phi1017.phi011.perseus-lat2",
    "Seneca, Lucius Annaeus",
    "Apocolocyntosis",
    "seneca_minor/apocolocyntosis",
  ],
  [
    "phi1017.phi014.perseus-lat2",
    "Seneca, Lucius Annaeus",
    "De Clementia",
    "seneca_minor/de_clementia",
  ],
  [
    "phi1038.phi001.perseus-lat1",
    "Valerius Maximus",
    "Facta et Dicta Memorabilia",
    "valerius_maximus/facta_et_dicta_memorabilia",
  ],
  [
    "phi1242.phi001.perseus-lat1",
    "Florus, Lucius Annaeus",
    "Epitome Rerum Romanorum",
    "florus,_lucius_annaeus/epitome_rerum_romanorum",
  ],
  [
    "phi1318.phi001.perseus-lat1",
    "Pliny the Younger",
    "Letters",
    "pliny_the_younger/letters",
  ],
  [
    "phi1351.phi004.perseus-lat2",
    "Cornelius Tacitus",
    "Historiae",
    "tacitus/historiae",
  ],
  [
    "stoa0255.stoa004.perseus-lat2",
    "Seneca, Lucius Annaeus",
    "De Brevitate Vitae",
    "seneca_minor/de_brevitate_vitae",
  ],
  [
    "stoa0275.stoa027.perseus-lat2",
    "Tertullian",
    "De Spectaculis",
    "tertullian/de_spectaculis",
  ],
  [
    "stoa0276.stoa002.opp-lat1",
    "Tertullian",
    "Ad Uxorem",
    "tertullian/ad_uxorem",
  ],
  [
    "phi0426.phi001.perseus-lat1",
    "Pseudo-Caesar",
    "De Bello Africo",
    "pseudo_caesar/de_bello_africo",
  ],
  [
    "phi0428.phi001.perseus-lat1",
    "Pseudo-Caesar",
    "De Bello Alexandrino",
    "pseudo_caesar/de_bello_alexandrino",
  ],
  [
    "phi0430.phi001.perseus-lat1",
    "Pseudo-Caesar",
    "De Bello Hispaniensi",
    "pseudo_caesar/de_bello_hispaniensi",
  ],
  [
    "phi0474.phi006.perseus-lat2",
    "M. Tullius Cicero",
    "Pro M. Tullio",
    "cicero/pro_tullio",
  ],
  [
    "phi0474.phi009.perseus-lat2",
    "M. Tullius Cicero",
    "De Imperio Cn. Pompei Ad Quirites",
    "cicero/de_imperio_cn_pompei",
  ],
  [
    "phi0474.phi010.perseus-lat2",
    "M. Tullius Cicero",
    "Pro A. Cluentio",
    "cicero/pro_cluentio",
  ],
  [
    "phi0474.phi014.perseus-lat2",
    "M. Tullius Cicero",
    "Pro L. Murena",
    "cicero/pro_murena",
  ],
  [
    "phi0474.phi050.perseus-lat2",
    "M. Tullius Cicero",
    "De Natura Deorum",
    "cicero/de_natura_deorum",
  ],
  [
    "phi0474.phi053.perseus-lat3",
    "M. Tullius Cicero",
    "De Divinatione",
    "cicero/de_divinatione",
  ],
  [
    "phi0620.phi001.perseus-lat3",
    "Sextus Propertius",
    "Elegiae",
    "propertius/elegiae",
  ],
  [
    "phi0959.phi009.perseus-lat2",
    "P. Ovidius Naso",
    "Ex Ponto",
    "ovid/ex_ponto",
  ],
  [
    "phi1035.phi001.perseus-lat2",
    "Valerius Flaccus",
    "Argonautica",
    "valerius_flaccus/argonautica",
  ],
  [
    "phi1056.phi001.perseus-lat2",
    "Vitruvius Pollio",
    "De Architectura",
    "vitruvius/de_architectura",
  ],
  ["phi1212.phi001.perseus-lat1", "Apuleius", "Apologia", "apuleius/apologia"],
  ["phi1212.phi003.perseus-lat2", "Apuleius", "Florida", "apuleius/florida"],
  [
    "phi1254.phi001.perseus-lat2",
    "Aulus Gellius",
    "Noctes Atticae",
    "gellius/noctes_atticae",
  ],
  [
    "phi1294.phi002.perseus-lat2",
    "Martial",
    "Epigrammata",
    "martial/epigrammata",
  ],
  [
    "stoa0275.stoa009.perseus-lat2",
    "Tertullian",
    "Apologeticum",
    "tertullian/apologeticum",
  ],
  [
    "phi-json-lat1017.016",
    "L. Annaeus Seneca iunior",
    "Naturales Quaestiones",
    "seneca_minor/naturales_quaestiones",
  ],
  [
    "phi-json-lat1348.001",
    "C. Suetonius Tranquillus",
    "De Vita Caesarum",
    "suetonius/de_vita_caesarum",
  ],
  [
    "hypotactic_Eclogues_Calpurnius Siculus",
    "Calpurnius Siculus",
    "Eclogues",
    "calpurnius_siculus/eclogues",
  ],
  ["hypotactic_Aratea_Cicero", "M. Tullius Cicero", "Aratea", "cicero/aratea"],
  ["hypotactic_Aratea_Germanicus", "Germanicus", "Aratea", "germanicus/aratea"],
  [
    "hypotactic_Cynegetica_Grattius",
    "Grattius",
    "Cynegetica",
    "grattius/cynegetica",
  ],
  ["hypotactic_Odes_Horace", "Horace", "Odes", "horace/odes"],
  ["hypotactic_Epodes_Horace", "Horace", "Epodes", "horace/epodes"],
  ["hypotactic_Sermones_Horace", "Horace", "Sermones", "horace/sermones"],
  ["hypotactic_Epistulae_Horace", "Horace", "Epistulae", "horace/epistulae"],
  [
    "hypotactic_Ars Poetica_Horace",
    "Horace",
    "Ars Poetica",
    "horace/ars_poetica",
  ],
  [
    "hypotactic_Bellum Civile_Lucan",
    "Lucan",
    "Bellum Civile",
    "lucan/bellum_civile",
  ],
  [
    "hypotactic_De Spectaculis_Martial",
    "Martial",
    "De Spectaculis",
    "martial/de_spectaculis",
  ],
  [
    "hypotactic_Metamorphoses_Ovid",
    "P. Ovidius Naso",
    "Metamorphoses",
    "ovid/metamorphoses",
  ],
  [
    "hypotactic_Remedia Amoris_Ovid",
    "P. Ovidius Naso",
    "Remedia Amoris",
    "ovid/remedia_amoris",
  ],
  ["hypotactic_Tristia_Ovid", "P. Ovidius Naso", "Tristia", "ovid/tristia"],
  ["hypotactic_Fasti_Ovid", "P. Ovidius Naso", "Fasti", "ovid/fasti"],
  ["hypotactic_Ibis_Ovid", "P. Ovidius Naso", "Ibis", "ovid/ibis"],
  ["hypotactic_Heroides_Ovid", "P. Ovidius Naso", "Heroides", "ovid/heroides"],
  ["hypotactic_Satires_Persius", "Persius", "Satires", "persius/satires"],
  [
    "hypotactic_Bellum Civile_Petronius",
    "Petronius",
    "Bellum Civile",
    "petronius/bellum_civile",
  ],
  ["hypotactic_Achilleid_Statius", "Statius", "Achilleid", "statius/achilleid"],
  ["hypotactic_Thebaid_Statius", "Statius", "Thebaid", "statius/thebaid"],
  ["hypotactic_Silvae_Statius", "Statius", "Silvae", "statius/silvae"],
  ["hypotactic_Aeneid_Vergil", "Vergil", "Aeneid", "vergil/aeneid"],
  ["hypotactic_Georgics_Vergil", "Vergil", "Georgics", "vergil/georgics"],
  ["hypotactic_Eclogues_Vergil", "Vergil", "Eclogues", "vergil/eclogues"],
];

describe("onboarded work slugs", () => {
  it.each(ONBOARDED_SLUGS)("%s keeps its URL", (id, author, title, slug) => {
    const info = decorateDocumentInfo({
      workId: id,
      author,
      title,
      attribution: "perseus",
    });
    const metadata = extractWorkMetadata(id, info);
    expect(`${metadata.urlAuthor}/${metadata.urlName}`).toBe(slug);
  });

  it("cover distinct URLs", () => {
    const slugs = ONBOARDED_SLUGS.map((row) => row[3]);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("Phase 2B work metadata", () => {
  it.each([
    [
      "stoa0045.stoa014.perseus-lat2",
      "Ausonius, Decimus Magnus",
      "Ausonii Burdigalensis Vasatis Gratiarum Actio Ad Grati Angratianum Imperatorem Pro Consulatu",
      "Gratiarum Actio",
      "ausonius/gratiarum_actio",
    ],
    [
      "stoa0058.stoa025.perseus-lat1",
      "Boethius",
      "Quomodo Trinitas Unus Deus Ac Non Tres Dii (De Trinitate)",
      "De Trinitate",
      "boethius/de_trinitate",
    ],
    [
      "stoa0162.stoa004.perseus-lat2",
      "Jerome, Saint",
      "Epistulae. Selections.",
      "Epistulae",
      "jerome/epistulae",
    ],
    [
      "phi0845.phi002.perseus-lat3",
      "Columella",
      "Res Rustica, Books I-IX",
      "Res Rustica",
      "columella/res_rustica",
    ],
    [
      "phi1017.phi001.perseus-lat2",
      "Seneca, Lucius Annaeus",
      "De Ira",
      "De Ira",
      "seneca_minor/de_ira",
    ],
    [
      "phi2331.phi029.perseus-lat2",
      "Scriptores Historiae Augustae",
      "Firmus Saturninus, Proculus et Bonosus",
      "Firmus Saturninus, Proculus et Bonosus",
      "historia_augusta/firmus_saturninus_proculus_et_bonosus",
    ],
    [
      "phi0478.phi003.perseus-lat2",
      "Q. Tullius Cicero",
      "Commentariolum Petitionis",
      "Commentariolum Petitionis",
      "quintus_cicero/commentariolum_petitionis",
    ],
  ])("%s", (id, author, title, name, slug) => {
    const info = decorateDocumentInfo({
      workId: id,
      author,
      title,
      attribution: "perseus",
    });
    const metadata = extractWorkMetadata(id, info);
    expect(metadata.name).toBe(name);
    expect(`${metadata.urlAuthor}/${metadata.urlName}`).toBe(slug);
  });
});
