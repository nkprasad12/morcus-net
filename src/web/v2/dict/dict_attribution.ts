/**
 * Attribution and source metadata for Morcus Latin dictionaries.
 * Provides scholarly provenance, digitization sources, and open-access licenses.
 */

export interface DictAttributionInfo {
  sourceText: string;
  sourceUrl?: string;
  licenseText?: string;
  licenseUrl?: string;
  detailsHtml: string;
}

export const DICT_ATTRIBUTIONS: Record<string, DictAttributionInfo> = {
  "L&S": {
    sourceText: "Perseus Digital Library",
    sourceUrl: "https://www.perseus.tufts.edu",
    licenseText: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    detailsHtml: `Text provided under a CC BY-SA 4.0 license by the <a href="https://www.perseus.tufts.edu" target="_blank" rel="noopener noreferrer">Perseus Digital Library</a>, with funding from the National Endowment for the Humanities. Digitized from Charlton T. Lewis and Charles Short, <em>A Latin Dictionary</em> (1879). Data originally from <a href="https://github.com/PerseusDL/lexica" target="_blank" rel="noopener noreferrer">PerseusDL/lexica</a> and accessed from <a href="https://github.com/nkprasad12/lexica" target="_blank" rel="noopener noreferrer">github.com/nkprasad12/lexica</a>.`,
  },
  "S&H": {
    sourceText: "Distributed Proofreaders",
    sourceUrl: "https://www.pgdp.net/c/project.php?id=projectID5775aeccac0c7",
    licenseText: "Public Domain",
    detailsHtml: `Digitized by <a href="https://www.pgdp.net/c/project.php?id=projectID5775aeccac0c7" target="_blank" rel="noopener noreferrer">Distributed Proofreaders</a> from William Smith and Theophilus D. Hall, <em>A Copious and Critical English-Latin Dictionary</em> (1871), and generously placed into the public domain.`,
  },
  GAF: {
    sourceText: "gaffiot.fr",
    sourceUrl: "https://gaffiot.fr",
    detailsHtml: `F&eacute;lix Gaffiot, <em>Dictionnaire illustr&eacute; latin-fran&ccedil;ais</em> (1934). Digital data kindly provided by <a href="https://gaffiot.fr" target="_blank" rel="noopener noreferrer">gaffiot.fr</a>.`,
  },
  GRG: {
    sourceText: "latin-dict.github.io",
    sourceUrl: "https://latin-dict.github.io/dictionaries/Georges1910.html",
    licenseText: "Public Domain",
    detailsHtml: `Karl Ernst Georges, <em>Ausf&uuml;hrliches lateinisch-deutsches Handw&ouml;rterbuch</em> (8th ed., 1913/1918). Digitized data accessed from <a href="https://latin-dict.github.io/dictionaries/Georges1910.html" target="_blank" rel="noopener noreferrer">latin-dict.github.io</a> and is in the public domain.`,
  },
  GES: {
    sourceText: "Heidelberg University",
    sourceUrl: "https://latin-dict.github.io/dictionaries/Gesner1749.html",
    licenseText: "Public Domain",
    detailsHtml: `Johann Matthias Gesner, <em>Novus Linguae et Eruditionis Romanae Thesaurus</em> (1749). Transcribed by the team of Dr. Wilhelm K&uuml;hlmann from Heidelberg University; accessed via <a href="https://latin-dict.github.io/dictionaries/Gesner1749.html" target="_blank" rel="noopener noreferrer">latin-dict.github.io</a>.`,
  },
  FOR: {
    sourceText: "lexica.linguax.com",
    sourceUrl: "https://lexica.linguax.com",
    detailsHtml: `Egidio Forcellini, <em>Totius Latinitatis Lexicon</em>. Digital entries displayed from <a href="https://lexica.linguax.com" target="_blank" rel="noopener noreferrer">lexica.linguax.com</a>, maintained by Godmy. All credit belongs to the respective authors and contributors.`,
  },
  EGL: {
    sourceText: "latin-dict.github.io",
    sourceUrl: "https://latin-dict.github.io/dictionaries/LopezPozo1997.html",
    licenseText: "Public Domain",
    detailsHtml: `P. P. L&oacute;pez Pozo, <em>Diccionario Espa&ntilde;ol-Griego-Lat&iacute;n</em> (1997). Digitized data accessed from <a href="https://latin-dict.github.io/dictionaries/LopezPozo1997.html" target="_blank" rel="noopener noreferrer">latin-dict.github.io</a> and is in the public domain.`,
  },
  "R&A": {
    sourceText: "github.com/FergusJPWalsh",
    sourceUrl: "https://github.com/FergusJPWalsh/riddle-arnold",
    licenseText: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    detailsHtml: `J. E. Riddle and T. K. Arnold, <em>A Copious and Critical English-Latin Lexicon</em>. Data retrieved from <a href="https://github.com/FergusJPWalsh/riddle-arnold" target="_blank" rel="noopener noreferrer">FergusJPWalsh/riddle-arnold</a> under a CC BY-SA 4.0 license.`,
  },
  NUM: {
    sourceText: "Allen & Greenough / L&S",
    detailsHtml: `Latin numeral and tabular data collected and organized by Quillful, sourced from Allen &amp; Greenough's <em>New Latin Grammar</em> and Lewis &amp; Short.`,
  },
};

// Aliases for lowercase and legacy dictionary keys
DICT_ATTRIBUTIONS["ls"] = DICT_ATTRIBUTIONS["L&S"];
DICT_ATTRIBUTIONS["sh"] = DICT_ATTRIBUTIONS["S&H"];
DICT_ATTRIBUTIONS["gaffiot"] = DICT_ATTRIBUTIONS["GAF"];
DICT_ATTRIBUTIONS["georges"] = DICT_ATTRIBUTIONS["GRG"];
DICT_ATTRIBUTIONS["gesner"] = DICT_ATTRIBUTIONS["GES"];
DICT_ATTRIBUTIONS["forcellini"] = DICT_ATTRIBUTIONS["FOR"];
DICT_ATTRIBUTIONS["pozo"] = DICT_ATTRIBUTIONS["EGL"];
DICT_ATTRIBUTIONS["riddle_arnold"] = DICT_ATTRIBUTIONS["R&A"];
DICT_ATTRIBUTIONS["numeral"] = DICT_ATTRIBUTIONS["NUM"];
