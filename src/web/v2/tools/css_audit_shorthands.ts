/**
 * Shorthand → longhand reset table for the UI V2 CSS audit.
 *
 * Derived from `mdn-data`: a property is a shorthand when its `computed`
 * field is an array, and that array lists the longhands it resets. The table
 * is expanded transitively (`border` → `border-top` → `border-top-width`).
 *
 * The table is only ever consulted in one direction (does the LATER property
 * reset the EARLIER one?), so a missing entry can only hide a finding, never
 * invent one. Known gaps in `mdn-data`, accepted as miss-only:
 * - `font-variant` and `white-space` are recorded as `asSpecified`, not as
 *   shorthands;
 * - `padding`, `margin` and `inset` list only their physical longhands, so the
 *   logical longhands are patched in below (in a fixed writing mode a later
 *   `padding` really does reset an earlier `padding-inline`);
 * - `border` omits `border-image`, which the shorthand resets per spec.
 *
 * One `mdn-data` entry errs in the harmful direction and is removed below:
 * - `grid` lists the gutter properties, but since the 2017 CSSWG resolution
 *   the `grid` shorthand does *not* reset `row-gap` / `column-gap` (nor their
 *   `grid-*-gap` aliases), and browsers follow the spec.
 */

import mdnProperties from "mdn-data/css/properties.json";

const SPEC_PATCH_ADD: Readonly<Record<string, readonly string[]>> = {
  padding: ["padding-inline", "padding-block"],
  margin: ["margin-inline", "margin-block"],
  inset: ["inset-inline", "inset-block"],
  border: ["border-image"],
};

const SPEC_PATCH_REMOVE: Readonly<Record<string, readonly string[]>> = {
  grid: [
    "row-gap",
    "column-gap",
    "grid-row-gap",
    "grid-column-gap",
    "gap",
    "grid-gap",
  ],
};

/** Properties `all` leaves alone (besides custom properties). */
const ALL_EXEMPT = new Set(["direction", "unicode-bidi", "all"]);

function buildResetTable(): ReadonlyMap<string, ReadonlySet<string>> {
  const direct = new Map<string, Set<string>>();
  const props: Record<string, { computed?: unknown }> = mdnProperties;
  for (const [name, entry] of Object.entries(props)) {
    if (!Array.isArray(entry.computed)) continue;
    const longhands = entry.computed.filter(
      (item): item is string => typeof item === "string"
    );
    direct.set(name, new Set(longhands));
  }
  for (const [shorthand, longhands] of Object.entries(SPEC_PATCH_ADD)) {
    const set = direct.get(shorthand) ?? new Set<string>();
    for (const longhand of longhands) set.add(longhand);
    direct.set(shorthand, set);
  }
  for (const [shorthand, longhands] of Object.entries(SPEC_PATCH_REMOVE)) {
    const set = direct.get(shorthand);
    for (const longhand of longhands) set?.delete(longhand);
  }

  const closure = new Map<string, Set<string>>();
  const expand = (name: string, seen: Set<string>): Set<string> => {
    const cached = closure.get(name);
    if (cached) return cached;
    const out = new Set<string>();
    for (const longhand of direct.get(name) ?? []) {
      out.add(longhand);
      if (seen.has(longhand)) continue;
      seen.add(longhand);
      for (const nested of expand(longhand, seen)) out.add(nested);
    }
    closure.set(name, out);
    return out;
  };
  for (const name of direct.keys()) expand(name, new Set([name]));
  return closure;
}

const RESETS: ReadonlyMap<string, ReadonlySet<string>> = buildResetTable();

/**
 * Returns true when a later declaration of `laterProp` makes an earlier
 * declaration of `earlierProp` (on the same element, at the same specificity
 * and importance) unobservable.
 */
export function resetsProperty(
  laterProp: string,
  earlierProp: string
): boolean {
  const later = laterProp.toLowerCase();
  const earlier = earlierProp.toLowerCase();
  if (later === earlier) return true;
  if (later === "all") {
    return !earlier.startsWith("--") && !ALL_EXEMPT.has(earlier);
  }
  return RESETS.get(later)?.has(earlier) ?? false;
}

/** Exposed for tests. */
export function longhandsOf(shorthand: string): readonly string[] {
  return [...(RESETS.get(shorthand.toLowerCase()) ?? [])].sort();
}
