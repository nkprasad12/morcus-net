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
    .split(/[_-]/)
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
}
