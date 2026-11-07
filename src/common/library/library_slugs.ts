import { assert } from "@/common/assert";

/**
 * Reader URL author slugs (`/work/:urlAuthor/:urlName`) that differ from what
 * `urlify` would derive from the source's author name. Prefer the short name
 * an author is generally known by (`nepos`, not `cornelius_nepos`), keeping
 * enough to stay unambiguous (`pliny_elder`, `valerius_flaccus`).
 *
 * The corpus's `#Author` codes are derived from these slugs too (see
 * `authorCodeFromSlug`), so the two always agree.
 *
 * When a slug changes, add the old one to `RETIRED_AUTHOR_SLUGS` so existing
 * links keep working.
 */
const AUTHOR_TO_URL_LOOKUP = new Map<string, string>([
  ["Julius Caesar", "caesar"],
  ["P. Ovidius Naso", "ovid"],
  ["Cornelius Tacitus", "tacitus"],
  ["C. Valerius Catullus", "catullus"],
  ["M. Tullius Cicero", "cicero"],
  ["C. Suetonius Tranquillus", "suetonius"],
  ["Titus Livius (Livy)", "livy"],
  ["Pseudo-Caesar", "pseudo_caesar"],
  ["Sextus Propertius", "propertius"],
  ["Valerius Flaccus", "valerius_flaccus"],
  ["Vitruvius Pollio", "vitruvius"],
  ["Aulus Gellius", "gellius"],
  // Seneca the Younger's works come under several source spellings.
  ["L. Annaeus Seneca iunior", "seneca_younger"],
  ["L. Annaeus Seneca", "seneca_younger"],
  ["Seneca, Lucius Annaeus", "seneca_younger"],
  ["Seneca the Elder", "seneca_elder"],
  ["Pliny the Elder", "pliny_elder"],
  ["Pliny the Younger", "pliny_younger"],
  ["Scriptores Historiae Augustae", "historia_augusta"],
  ["Ausonius, Decimus Magnus", "ausonius"],
  ["Q. Tullius Cicero", "quintus_cicero"],
  ["Sidonius Apollinaris", "sidonius"],
  ["Silius Italicus", "silius"],
  ["Cato, Marcus Porcius", "cato"],
  ["Jerome, Saint", "jerome"],
  ["Augustine, Saint", "augustine"],
  ["T. Maccius Plautus", "plautus"],
  ["Publius Terentius Afer (Terence)", "terence"],
  ["Curtius Rufus, Quintus", "curtius"],
  ["Florus, Lucius Annaeus", "florus"],
  ["Cornelius Nepos", "nepos"],
  ["Ammianus Marcellinus", "ammianus"],
  ["Pompeius Trogus", "trogus"],
]);

/**
 * Author slugs that have been retired, keyed by the slug that replaced them.
 * `<retired>/<urlName>` keeps resolving to the work, and the reader route
 * redirects it to the canonical URL.
 */
export const RETIRED_AUTHOR_SLUGS: ReadonlyMap<string, readonly string[]> =
  new Map([
    // Phase 2B moved Seneca the Younger's Perseus works under `seneca_minor`;
    // both later became `seneca_younger`.
    ["seneca_younger", ["seneca_minor", "seneca,_lucius_annaeus"]],
    ["seneca_elder", ["seneca_the_elder"]],
    ["pliny_elder", ["pliny_the_elder"]],
    ["pliny_younger", ["pliny_the_younger"]],
    ["silius", ["silius_italicus"]],
    // Slugs from before `urlify` dropped punctuation.
    ["curtius", ["curtius_rufus,_quintus"]],
    ["florus", ["florus,_lucius_annaeus"]],
    ["nepos", ["cornelius_nepos"]],
    ["ammianus", ["ammianus_marcellinus"]],
    ["trogus", ["pompeius_trogus"]],
  ]);

/**
 * The URL slug for `input`: its entry in `customs`, else the lower-cased
 * words joined by `_`, with accents removed and only `[a-z0-9_-]` kept.
 */
export function urlify(input: string, customs: Map<string, string>): string {
  const custom = customs.get(input);
  if (custom !== undefined) {
    return custom;
  }
  const slug = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  assert(slug.length > 0, () => `Empty URL slug for "${input}"`);
  return slug;
}

/** The reader URL slug for a work's author, as the source spells it. */
export function urlifyAuthor(author: string): string {
  return urlify(author, AUTHOR_TO_URL_LOOKUP);
}

/**
 * The corpus `#Author` code for a reader URL author slug: `names_like_this`
 * becomes `NamesLikeThis` (and `pseudo-caesar` would become `PseudoCaesar`).
 */
export function authorCodeFromSlug(slug: string): string {
  return slug
    .split(/[_.-]/)
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
}

/**
 * The corpus `#Author/Work` code for a work: `de_bello_gallico` becomes
 * `DeBelloGallico` (and `pro_a._caecina` becomes `ProACaecina`).
 */
export function toWorkCorpusCode(workId: string, rawTitle: string): string {
  return authorCodeFromSlug(urlifyWork(workId, rawTitle));
}

const NAME_TO_DISPLAY_NAME = new Map<string, string>([
  ["de Origine et Situ Germanorum Liber", "Germania"],
  ["De Vita Iulii Agricolae", "Agricola"],
  ["The Catilinarian Conspiracy", "Bellum Catilinae"],
  ["Laelius De Amicitia", "De Amicitia"],
  ["Pro P. Quinctio", "Pro Quinctio"],
  ["Medicamina faciei femineae", "Medicamina"],
  [
    "Pro C. Rabirio Perduellionis Reo Ad Quirites",
    "Pro Rabirio Perduellionis Reo",
  ],
  ["In L. Catilinam", "In Catilinam"],
  ["De domo sua ad pontifices", "de Domo Sua"],
  ["De haruspicum responso in P. Clodium", "De Haruspicum Responso"],
  ["In P. Vatinium testem interrogatio", "In P. Vatinium"],
  ["Pro L. Cornelio Balbo", "Pro Balbo"],
  ["In L. Calpurnium Pisonem", "In Pisonem"],
  ["Pro C. Rabirio Postumo", "Pro Rabirio Postumo"],
  ["Pro M. Tullio", "Pro Tullio"],
  ["De Imperio Cn. Pompei Ad Quirites", "De Imperio Cn. Pompei"],
  ["Pro A. Cluentio", "Pro Cluentio"],
  ["Pro L. Murena", "Pro Murena"],
]);

const NAME_TO_URL_LOOKUP = new Map<string, string>([
  ["de Origine et Situ Germanorum Liber", "germania"],
  ["De Vita Iulii Agricolae", "agricola"],
  ["The Catilinarian Conspiracy", "catalina1"],
  ["Medicamina faciei femineae", "medicamina"],
  ["Pro P. Quinctio", "pro_quinctio"],
  [
    "Pro C. Rabirio Perduellionis Reo Ad Quirites",
    "pro_rabirio_perduellionis_reo",
  ],
  ["In L. Catilinam", "in_catilinam"],
  ["De domo sua ad pontifices", "de_domo_sua"],
  ["De haruspicum responso in P. Clodium", "de_haruspicum_responso"],
  ["In P. Vatinium testem interrogatio", "in_p_vatinium"],
  ["Pro L. Cornelio Balbo", "pro_balbo"],
  ["In L. Calpurnium Pisonem", "in_pisonem"],
  ["Pro C. Rabirio Postumo", "pro_rabirio_postumo"],
  ["Pro M. Tullio", "pro_tullio"],
  ["De Imperio Cn. Pompei Ad Quirites", "de_imperio_cn_pompei"],
  ["Pro A. Cluentio", "pro_cluentio"],
  ["Pro L. Murena", "pro_murena"],
]);

/**
 * URL slugs pinned by work id. Slugs are derived from the TEI title, so when
 * upstream retitles a work its reader URL would move; pinning keeps old links
 * and saved spots working. Add an entry whenever a sync changes a slug.
 */
export const URL_NAME_BY_WORK_ID = new Map<string, string>([
  // canonical-latinLit 0700a6b7 (2026-10) retitled these.
  ["phi0474.phi003.perseus-lat2", "quintus_roscius"],
  ["phi0474.phi007.perseus-lat2", "pro_fonteio"],
  ["phi0474.phi018.perseus-lat2", "cum_populo_gratias_egi"],
  ["phi0474.phi020.perseus-lat2", "de_domo_sua"],
  ["phi0474.phi021.perseus-lat2", "de_haruspicum_responso"],
  ["phi0474.phi023.perseus-lat2", "in_p_vatinium"],
  ["phi0474.phi025.perseus-lat2", "de_provinciis_consularibus"],
  ["phi0474.phi034.perseus-lat2", "pro_rege_deiotaro"],
  ["phi0474.phi038.perseus-lat2", "de_partitione_oratoria"],
  ["phi0474.phi043.perseus-lat2", "de_republica"],
  ["phi0474.phi051.perseus-lat2", "de_senectute"],
  ["phi1351.phi001.perseus-lat2", "agricola"],
  // Slugs from before `urlify` dropped punctuation, kept so links still work.
  ["phi0474.phi004.perseus-lat2", "divinatio_in_q._caecilium"],
  ["phi0474.phi008.perseus-lat2", "pro_a._caecina"],
  ["phi0474.phi015.perseus-lat2", "pro_p._sulla"],
  ["phi0474.phi017.perseus-lat2", "pro_l._flacco"],
  ["phi0474.phi022.perseus-lat2", "pro_p._sestio"],
  ["phi0474.phi024.perseus-lat2", "pro_m._caelio"],
  ["phi0474.phi028.perseus-lat2", "pro_cn._plancio"],
  ["phi0474.phi029.perseus-lat2", "pro_m._scauro"],
  ["phi0474.phi031.perseus-lat2", "pro_t._annio_milone"],
  ["phi0474.phi032.perseus-lat2", "pro_m._marcello"],
  ["phi0474.phi033.perseus-lat2", "pro_q._ligario"],
  // Phase 2B: TEI titles that are too long, or wrong (stoa014's is OCR'd
  // with a line break), to make a good slug. Named after `__cts__.xml`.
  ["stoa0045.stoa010.perseus-lat2", "epigrammata"],
  // Both are titled "Epistularum" in the TEI.
  ["stoa0045.stoa011.perseus-lat2", "epistulae"],
  ["stoa0045.stoa014.perseus-lat2", "gratiarum_actio"],
  ["stoa0045.stoa016.perseus-lat2", "protrepticus_ad_nepotem"],
  ["stoa0058.stoa023.perseus-lat1", "contra_eutychen_et_nestorium"],
  ["stoa0058.stoa025.perseus-lat1", "de_trinitate"],
  ["stoa0058.stoa028.perseus-lat1", "utrum_pater_et_filius"],
  ["stoa0162.stoa004.perseus-lat2", "epistulae"],
  ["stoa0040.stoa011.perseus-lat2", "epistulae"],
  ["phi0845.phi002.perseus-lat3", "res_rustica"],
  ["stoa0261.stoa002.perseus-lat1", "epistulae"],
  // Phase 3: Seneca's Hercules Furens (TEI title is just "Hercules", distinct from Hercules Oetaeus).
  ["phi1017.phi001.perseus-lat2", "hercules_furens"],
]);

/** Short display titles pinned by work id, for the same reason. */
export const SHORT_TITLE_BY_WORK_ID = new Map<string, string>([
  ["phi0474.phi020.perseus-lat2", "de Domo Sua"],
  ["phi0474.phi021.perseus-lat2", "De Haruspicum Responso"],
  ["phi0474.phi023.perseus-lat2", "In P. Vatinium"],
  ["phi1351.phi001.perseus-lat2", "Agricola"],
  ["stoa0045.stoa010.perseus-lat2", "Epigrammata"],
  ["stoa0045.stoa011.perseus-lat2", "Epistulae"],
  ["stoa0045.stoa014.perseus-lat2", "Gratiarum Actio"],
  ["stoa0045.stoa016.perseus-lat2", "Protrepticus ad Nepotem"],
  ["stoa0058.stoa023.perseus-lat1", "Contra Eutychen et Nestorium"],
  ["stoa0058.stoa025.perseus-lat1", "De Trinitate"],
  ["stoa0058.stoa028.perseus-lat1", "Utrum Pater et Filius"],
  ["stoa0162.stoa004.perseus-lat2", "Epistulae"],
  ["stoa0040.stoa011.perseus-lat2", "Epistulae"],
  ["phi0845.phi002.perseus-lat3", "Res Rustica"],
  ["stoa0261.stoa002.perseus-lat1", "Epistulae"],
  ["phi1017.phi001.perseus-lat2", "Hercules Furens"],
]);

/** The short display title override for a work, if one is configured. */
export function shortWorkTitle(
  workId: string,
  rawTitle: string
): string | undefined {
  return (
    SHORT_TITLE_BY_WORK_ID.get(workId) ?? NAME_TO_DISPLAY_NAME.get(rawTitle)
  );
}

/** The display title for a work (its short title if configured, else `rawTitle`). */
export function displayWorkTitle(workId: string, rawTitle: string): string {
  return shortWorkTitle(workId, rawTitle) ?? rawTitle;
}

/** The reader URL slug (`/work/:urlAuthor/:urlName`) and corpus work code for a work. */
export function urlifyWork(workId: string, rawTitle: string): string {
  return (
    URL_NAME_BY_WORK_ID.get(workId) ?? urlify(rawTitle, NAME_TO_URL_LOOKUP)
  );
}
