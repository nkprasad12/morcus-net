import type { ExperimentalTextCatalogEntry } from "@/common/experimental_texts/catalog_types";
import {
  ANONYMOUS_AUTHOR,
  COLLECTIVE_AUTHOR,
  disambiguateDuplicateTitles,
  isAllCapsTitleSegment,
  normalizeExperimentalTextAuthor,
  normalizeExperimentalTextCatalogEntries,
  normalizeExperimentalTextCatalogEntry,
  normalizeExperimentalTextTitle,
} from "@/common/experimental_texts/catalog_normalizer";

function entry(
  partial: Partial<ExperimentalTextCatalogEntry> & { id: string }
): ExperimentalTextCatalogEntry {
  return {
    source: "patrologia_latina",
    format: "tei",
    author: "Ambrosius",
    title: "De Fide",
    period: "ancient",
    files: ["data/x.xml"],
    sourceUrl: "https://example.com/x.xml",
    license: "CC BY-SA 4.0",
    ...partial,
  };
}

const author = (raw: string) => normalizeExperimentalTextAuthor(raw).author;

describe("normalizeExperimentalTextAuthor", () => {
  it("folds collective and anonymous authors", () => {
    for (const raw of [
      "AA VV",
      "AA VV (Auctores Varii)",
      "Auctores Varii",
      "Anonymous / Various",
    ]) {
      expect(author(raw)).toBe(COLLECTIVE_AUTHOR);
    }
    for (const raw of [
      "Anonymous",
      "Anonymus",
      "Anomynus",
      "Incertus",
      "Auctor Incertus",
      "Incertus, Augustinus? Hieronymus?",
      "Anonymous (Liber Pontificalis)",
      "Anonymous (Roman Law)",
      "Anonymus (Carmina Burana)",
    ]) {
      expect(author(raw)).toBe(ANONYMOUS_AUTHOR);
    }
  });

  it("carries an anonymous author's qualifier into the title", () => {
    expect(
      normalizeExperimentalTextAuthor("Anonymous (Roman Law)")
    ).toMatchObject({
      author: ANONYMOUS_AUTHOR,
      titleQualifier: "Roman Law",
    });
    expect(
      normalizeExperimentalTextAuthor("Incertus, Augustinus? Hieronymus?")
        .titleQualifier
    ).toBe("Augustinus? Hieronymus?");
    expect(
      normalizeExperimentalTextAuthor("Anonymous").titleQualifier
    ).toBeUndefined();
  });

  it("never leaves an author starting with a parenthesis", () => {
    expect(
      normalizeExperimentalTextAuthor("(S. Benedictus Discipulus?)")
    ).toMatchObject({
      author: "Marcus Cassinensis",
      titleQualifier: "attr. S. Benedicti Discipulus",
    });
    expect(author("Anonymus Neveleti (Gualterus Anglicus)")).toBe(
      "Gualterus Anglicus (Anonymus Neveleti)"
    );
  });

  it.each([
    ["Augustinus", "Augustine"],
    ["Augustine, Saint", "Augustine"],
    ["Augustinus (pseudo)", "Pseudo-Augustinus"],
    ["Hieronymus", "Jerome"],
    ["Jerome, Saint (Eusebius Hieronymus)", "Jerome"],
    [
      "Pseudo-Hieronymus / Auctor incertus (Hieronymus Stridonensis?)",
      "Pseudo-Hieronymus",
    ],
    ["Ambrosius", "Ambrosius Mediolanensis (Saint Ambrose)"],
    [
      "Ambrose, Saint (Ambrosius Mediolanensis)",
      "Ambrosius Mediolanensis (Saint Ambrose)",
    ],
    ["Tertullianus", "Tertullian"],
    ["Pseudo-Tertullian (Cyprianus Gallus)", "Pseudo-Tertullian"],
    ["Isidorus Hispalensis", "Isidorus Hispalensis (Isidore of Seville)"],
    ["Isidorus Hispaliensis", "Isidorus Hispalensis (Isidore of Seville)"],
    ["Isidore of Seville", "Isidorus Hispalensis (Isidore of Seville)"],
    ["Boethius. Severinus", "Boethius"],
    ["Boethius", "Boethius"],
    [
      "Boethius of Dacia (Boethius de Dacia)",
      "Boethius of Dacia (Boethius de Dacia)",
    ],
    ["Gregorius I Magnus", "Gregorius I Magnus (Gregory the Great)"],
    ["SS Gregorius I Magnus", "Gregorius I Magnus (Gregory the Great)"],
    [
      "Gregorius I (Gregory the Great)",
      "Gregorius I Magnus (Gregory the Great)",
    ],
    ["Gregory of Tours", "Gregorius Turonensis (Gregory of Tours)"],
    ["Hilarius Pictaviensis", "Hilarius Pictaviensis (Hilary of Poitiers)"],
    ["SS Hilarius", "Hilarius (Pope)"],
    ["Cassiodorus Vivariensis Abbas", "Cassiodorus"],
    ["SS Leo I. Magnus", "Leo I Magnus (Leo the Great)"],
    ["Pope Leo I (Leo the Great)", "Leo I Magnus (Leo the Great)"],
    ["SS Gelasius I", "Gelasius I (Pope)"],
    ["SS Felix IV", "Felix IV (Pope)"],
    ["Lactantius (attrib.)", "Lactantius"],
    ["Orosius", "Paulus Orosius"],
    ["Sedulius (Coelius Sedulius)", "Coelius Sedulius"],
    ["Venantius Fortunatus Episcopus", "Venantius Fortunatus"],
    ["Alcuin of York (and Fredugis)", "Alcuinus (Alcuin of York)"],
    ['Antonius "attributed"/Paulinus of Nola', "Paulinus of Nola"],
    ["Eucherius Lugdonensis Episcopus", "Eucherius of Lyon"],
    [
      "Martinus Dumiensis Episcopus Bracarensis",
      "Martin of Braga (Martinus Bracarensis)",
    ],
    ["Commodianus Gazaeus", "Commodianus"],
    ["Ausonius Decius", "Decimus Magnus Ausonius"],
    ["Iustinianus (Corpus Iuris Civilis)", "Justinian"],
    ["Justinianus Imperator", "Justinian"],
    ["L. Annaeus Seneca (Seneca the Younger)", "Seneca the Younger"],
    ["L. Annaeus Seneca Maior (Seneca the Elder)", "Seneca the Elder"],
    ["C. Plinius Secundus (Pliny the Elder)", "Pliny the Elder"],
    [
      "M. Porcius Cato (Cato the Elder)",
      "Marcus Porcius Cato (Cato the Elder)",
    ],
    ["Sidonius Apollinaris Episcopus", "Sidonius Apollinaris"],
  ])("maps %s to %s", (raw, expected) => {
    expect(author(raw)).toBe(expected);
  });

  it("maps SS popes to X (Pope), strips saint prefixes, preserves praenomen D., and fixes broken names", () => {
    expect(author("SS Damasus I")).toBe("Damasus I (Pope)");
    expect(author("SS Miltiades [Melchiades]")).toBe(
      "Miltiades (Melchiades) (Pope)"
    );
    expect(author("St. Anselm of Canterbury (Anselmus Cantuariensis)")).toBe(
      "Anselm of Canterbury (Anselmus Cantuariensis)"
    );
    expect(author("Sanctus Victricus")).toBe("Victricus");
    expect(author("D. Iunius Iuvenalis")).toBe("D. Iunius Iuvenalis");
    expect(author("withof7")).toBe("Johann Philipp Lorenz Withof");
    expect(author("Tamaius De Vargas. Thomas")).toBe(
      "Thomas Tamaius de Vargas"
    );
    expect(
      author("D. Joannis Marianaeus / Martianaeus, Johannes, 1647-1717?")
    ).toBe("Johannes Martianaeus");
    expect(author("Sanctus Pontius / Pontius Diaconus")).toBe(
      "Pontius Diaconus"
    );
    expect(author("Prosperus Conversus / Prosper Ex Manichaeo Conversus")).toBe(
      "Prosperus Conversus"
    );
  });

  it("keeps the upstream spelling and known aliases for search", () => {
    expect(normalizeExperimentalTextAuthor("Hieronymus").aliases).toEqual([
      "Hieronymus",
      "Eusebius Hieronymus",
    ]);
    expect(normalizeExperimentalTextAuthor("Augustine, Saint").aliases).toEqual(
      ["Augustine, Saint", "Augustinus", "Aurelius Augustinus"]
    );
    expect(
      normalizeExperimentalTextAuthor("C. Plinius Secundus (Pliny the Elder)")
        .aliases
    ).toContain("C. Plinius Secundus (Pliny the Elder)");
    expect(normalizeExperimentalTextAuthor("SS Damasus I").aliases).toEqual([
      "SS Damasus I",
    ]);
    expect(normalizeExperimentalTextAuthor("SS Hilarius").aliases).toEqual([
      "SS Hilarius",
      "Hilarus",
    ]);
    // An alias already in the name, or a dropped saint honorific, isn't repeated.
    expect(normalizeExperimentalTextAuthor("Orosius").aliases).toEqual([]);
    expect(
      normalizeExperimentalTextAuthor("Sanctus Victricus").aliases
    ).toEqual([]);
    expect(normalizeExperimentalTextAuthor("Abbo of Fleury").aliases).toEqual(
      []
    );
  });

  it("is idempotent", () => {
    for (const raw of [
      "Augustinus",
      "Ambrosius",
      "SS Leo I. Magnus",
      "SS Damasus I",
      "SS Hilarius",
      "(S. Benedictus Discipulus?)",
      'Antonius "attributed"/Paulinus of Nola',
      "Anonymous (Roman Law)",
      "AA VV",
      "Isidorus Hispaliensis",
      "Alcuinus",
      "withof7",
    ]) {
      const once = author(raw);
      expect(author(once)).toBe(once);
    }
  });
});

describe("normalizeExperimentalTextTitle", () => {
  it("Title-Cases ALL-CAPS titles, keeping Roman numerals", () => {
    expect(normalizeExperimentalTextTitle("EPISTOLA NUNCUPATORIA")).toBe(
      "Epistola Nuncupatoria"
    );
    expect(
      normalizeExperimentalTextTitle(
        "EPISTOLA III. MAXIMI IMPERATORIS AD SIRICIUM"
      )
    ).toBe("Epistola III. Maximi Imperatoris Ad Siricium");
    expect(normalizeExperimentalTextTitle("NORMA VIVENDI (Appendix XV)")).toBe(
      "Norma Vivendi (Appendix XV)"
    );
    expect(
      normalizeExperimentalTextTitle(
        "VINDICIÆ DIALOGORUM SANCTI GREGORII MAGNI"
      )
    ).toBe("Vindiciæ Dialogorum Sancti Gregorii Magni");
  });

  it("leaves mixed-case titles and abbreviations alone", () => {
    for (const title of [
      "De Civitate Dei (Books I–XXII)",
      "Oratio de Iure Honorum Gallis Dando (Tabula Lugdunensis, CIL XIII 1668)",
      "Expeditio Francisci Draki in Indias Occidentales A.D. MDLXXXV",
      "Kalendarium Anno CCCCIIL Conscriptum",
      "Sententiarum > Libri Tres",
    ]) {
      expect(normalizeExperimentalTextTitle(title)).toBe(title);
    }
  });

  it("fixes known OCR typos", () => {
    expect(
      normalizeExperimentalTextTitle(
        "ARGUMENTUM IN QUATUOR LIBROS DIALOGORUM SANCTI GRGORII MAGNI"
      )
    ).toBe("Argumentum In Quatuor Libros Dialogorum Sancti Gregorii Magni");
    expect(
      normalizeExperimentalTextTitle(
        "VINDICIÆ DIALOGORUM SANCTI GREGORII MAGNI > AUCTOUE PETRO GUSSANVILLÆO"
      )
    ).toBe(
      "Vindiciæ Dialogorum Sancti Gregorii Magni, Auctore Petro Gussanvillæo"
    );
    expect(
      normalizeExperimentalTextTitle("EPISTOLX VIII. SEU RESCRIPTUM")
    ).toBe("Epistola VIII. Seu Rescriptum");
    expect(
      normalizeExperimentalTextTitle("APENDIX AD EPISTOLAS FELICIS IV.")
    ).toBe("Appendix Ad Epistolas Felicis IV.");
    expect(
      normalizeExperimentalTextTitle(
        "FERRANDI DIACONI EPISTOLA AD EGYPPIUM.. DB ESSENTIA TRINITATIS"
      )
    ).toBe("Ferrandi Diaconi Epistola Ad Egyppium. De Essentia Trinitatis");
    expect(
      normalizeExperimentalTextTitle(
        "JOHANN PHILIPP LORENZ WITHOF DE SCIENTARIUM, IN ANIMI CORPORIQUE ENERVANDO ROBORE, DAMNOSA EFFICACIA"
      )
    ).toBe(
      "De Scientiarum, in Animi Corporique Enervando Robore, Damnosa Efficacia"
    );
  });

  it("replaces Greek look-alike capitals inside Latin words", () => {
    expect(
      normalizeExperimentalTextTitle("Vita / ΝΟΤITIΑ HISTORICA IN PROTADI")
    ).toBe("Vita / Notitia Historica In Protadi");
    // Real Greek is left as it is.
    expect(
      normalizeExperimentalTextTitle(
        "VICTORINI DE ΟΜΟΟΥΣΙΩ (homoousio) RECIPIENDO."
      )
    ).toBe("Victorini De ΟΜΟΟΥΣΙΩ (homoousio) Recipiendo.");
  });

  it("collapses a `Title / TITLE AND MORE` pair and strips source citations", () => {
    expect(
      normalizeExperimentalTextTitle(
        "De Miraculis Sancti Stephani Protomartyris / DE MIRACULIS SANCTI STEPHANI PROTOMARTYRIS LIBRI DUO AD EVODIUΜ"
      )
    ).toBe("De Miraculis Sancti Stephani Protomartyris Libri Duo Ad Evodium");
    expect(
      normalizeExperimentalTextTitle(
        "Vita Operaque [Ex Fabric Biblioth] / NOTITIA HISTORICA IN DINOTHUM ABBATEM"
      )
    ).toBe("Vita Operaque / Notitia Historica In Dinothum Abbatem");
    expect(
      normalizeExperimentalTextTitle("Conversionem /SEVERI EPISTOLA")
    ).toBe("Conversionem / Severi Epistola");
  });

  it("strips double parentheses", () => {
    expect(normalizeExperimentalTextTitle("((ADMONITIO))")).toBe("Admonitio");
  });

  it("is idempotent", () => {
    for (const raw of [
      "((ADMONITIO))",
      "De Miraculis / DE MIRACULIS LIBRI DUO",
      "EPISTOLX VIII. SEU RESCRIPTUM",
      "JOHANN PHILIPP LORENZ WITHOF DE SCIENTARIUM, IN ANIMI CORPORIQUE ENERVANDO ROBORE, DAMNOSA EFFICACIA",
    ]) {
      const once = normalizeExperimentalTextTitle(raw);
      expect(normalizeExperimentalTextTitle(once)).toBe(once);
    }
  });
});

describe("isAllCapsTitleSegment", () => {
  it("counts capitalized words against lowercase ones, ignoring numerals", () => {
    expect(isAllCapsTitleSegment("MONITUM IN EPISTOLAM (Ex Constantio)")).toBe(
      true
    );
    expect(isAllCapsTitleSegment("Homiliae XIV In Ezechielem")).toBe(false);
    expect(isAllCapsTitleSegment("Senatus Consultum (CIL I² 581)")).toBe(false);
    expect(isAllCapsTitleSegment("XII")).toBe(false);
  });
});

describe("normalizeExperimentalTextCatalogEntry", () => {
  it("appends a qualifier the title doesn't already mention", () => {
    expect(
      normalizeExperimentalTextCatalogEntry(
        entry({
          id: "ll/twelve-tables",
          author: "Anonymous (Roman Law)",
          title: "Duodecim Tabularum Leges",
        })
      )
    ).toMatchObject({
      author: ANONYMOUS_AUTHOR,
      title: "Duodecim Tabularum Leges (Roman Law)",
      authorAliases: ["Anonymous (Roman Law)", "Anonymus", "Auctor Incertus"],
    });
    expect(
      normalizeExperimentalTextCatalogEntry(
        entry({
          id: "ll/lp",
          author: "Anonymous (Liber Pontificalis)",
          title: "Liber Pontificalis (Popes I–LVI)",
        })
      ).title
    ).toBe("Liber Pontificalis (Popes I–LVI)");
    expect(
      normalizeExperimentalTextCatalogEntry(
        entry({
          id: "ll/genesis",
          author: "Pseudo-Tertullian (Cyprianus Gallus)",
          title: "Carmen de Genesi",
        })
      )
    ).toMatchObject({
      author: "Pseudo-Tertullian",
      title: "Carmen de Genesi (Cyprianus Gallus)",
    });
    expect(
      normalizeExperimentalTextCatalogEntry(
        entry({
          id: "ll/phoenix",
          author: "Lactantius (attrib.)",
          title: "De Ave Phoenice",
        })
      ).title
    ).toBe("De Ave Phoenice (attrib.)");
    expect(
      normalizeExperimentalTextCatalogEntry(
        entry({
          id: "pl/antonius",
          author: 'Antonius "attributed"/Paulinus of Nola',
          title: "Carmen Adversum Gentes",
        })
      )
    ).toMatchObject({
      author: "Paulinus of Nola",
      title: "Carmen Adversum Gentes (attr. Antonius)",
    });
    expect(
      normalizeExperimentalTextCatalogEntry(
        entry({
          id: "pl/marcus",
          author: "(S. Benedictus Discipulus?)",
          title: "Versus in Benedicti Laudem",
        })
      )
    ).toMatchObject({
      author: "Marcus Cassinensis",
      title: "Versus in Benedicti Laudem (attr. S. Benedicti Discipulus)",
    });
  });

  it("is idempotent, keeping the aliases it found", () => {
    const once = normalizeExperimentalTextCatalogEntry(
      entry({ id: "pl/a", author: "Hieronymus", title: "HIERONYMUS DESIDERIO" })
    );
    expect(once).toMatchObject({
      author: "Jerome",
      title: "Hieronymus Desiderio",
      authorAliases: ["Hieronymus", "Eusebius Hieronymus"],
    });
    expect(normalizeExperimentalTextCatalogEntry(once)).toEqual(once);
  });

  it("leaves an already clean entry as it is", () => {
    const clean = entry({ id: "ll/abbo", author: "Abbo of Fleury" });
    expect(normalizeExperimentalTextCatalogEntry(clean)).toEqual(clean);
  });
});

describe("disambiguateDuplicateTitles", () => {
  it("tells apart same-titled works of one author by volume, then counter", () => {
    const entries = normalizeExperimentalTextCatalogEntries([
      entry({
        id: "pl/tmp425",
        author: "Incertus",
        title: "((ADMONITIO))",
        volumeLabel: "PL 23",
      }),
      entry({
        id: "pl/tmp418",
        author: "Incertus",
        title: "((ADMONITIO))",
        volumeLabel: "PL 23",
      }),
      entry({
        id: "pl/a",
        author: "Anonymus",
        title: "Carmen de Laudibus Domini",
        volumeLabel: "PL 6",
      }),
      entry({
        id: "pl/b",
        author: "Incertus",
        title: "Carmen de Laudibus Domini",
        volumeLabel: "PL 61",
      }),
      entry({ id: "pl/c", author: "Incertus", title: "Prolegomena" }),
    ]);
    expect(entries.map((e) => [e.id, e.title])).toEqual([
      ["pl/tmp425", "Admonitio [PL 23 #2]"],
      ["pl/tmp418", "Admonitio [PL 23 #1]"],
      ["pl/a", "Carmen de Laudibus Domini [PL 6]"],
      ["pl/b", "Carmen de Laudibus Domini [PL 61]"],
      ["pl/c", "Prolegomena"],
    ]);
    expect(entries.every((e) => !e.title.includes("tmp"))).toBe(true);
    // Running it again changes nothing.
    expect(disambiguateDuplicateTitles(entries)).toEqual(entries);
  });

  it("leaves duplicates without a volume label alone", () => {
    const entries = [
      entry({ id: "ll/a", author: "X", title: "Carmina" }),
      entry({ id: "ll/b", author: "X", title: "Carmina" }),
    ];
    expect(disambiguateDuplicateTitles(entries)).toEqual(entries);
  });
});
