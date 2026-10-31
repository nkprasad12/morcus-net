import { html, joinHtml, type SafeHtml } from "@/web/ui/core/dom/html.common";
import { storage } from "@/web/ui/core/state/storage.client";
import {
  decodeStoredDictBitmask,
  encodeDictBitmask,
} from "@/web/ui/dict/settings/dict_bitmask.common";

/**
 * Named sets of dictionaries the user saved from the settings dialog, to switch between kinds
 * of search in two clicks (open the dialog, pick a set).
 *
 * Client-only state the server never needs, so it lives in localStorage
 * (`docs/PREFERENCES.md`); each set's dictionaries are a `?d=` bitmask, the one canonical
 * encoding. Picking a set only ticks the dialog's checkboxes: closing the dialog saves them as
 * usual, so a set is never a second source of truth for the selection.
 */
export const DICT_SETS_KEY = "morcus_dict_sets";

export interface DictSet {
  readonly name: string;
  /** The `?d=` bitmask. */
  readonly d: string;
}

function isDictSet(x: unknown): x is DictSet {
  return (
    typeof x === "object" &&
    x !== null &&
    "name" in x &&
    "d" in x &&
    typeof x.name === "string" &&
    x.name.trim() !== "" &&
    typeof x.d === "string" &&
    decodeStoredDictBitmask(x.d) !== null
  );
}

/** The saved sets, in the order saved. Invalid entries are dropped, not the whole list. */
export function readDictSets(): DictSet[] {
  const parsed = storage.getJson(DICT_SETS_KEY);
  return Array.isArray(parsed) ? parsed.filter(isDictSet) : [];
}

function writeDictSets(sets: readonly DictSet[]): void {
  storage.setJson(DICT_SETS_KEY, sets.length > 0 ? sets : undefined);
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** The saved set called `name` (ignoring case and outer spaces), if any. */
export function findDictSet(name: string): DictSet | undefined {
  return readDictSets().find((s) => sameName(s.name, name));
}

/** Saves `keys` as `name`, replacing a set with the same name (ignoring case) in place. */
export function saveDictSet(name: string, keys: readonly string[]): void {
  const set = { name: name.trim(), d: encodeDictBitmask(keys) };
  const sets = readDictSets();
  const i = sets.findIndex((s) => sameName(s.name, name));
  if (i >= 0) sets[i] = set;
  else sets.push(set);
  writeDictSets(sets);
}

/**
 * Removes the set called `name`. Sets are found by name, not position, so a chip drawn before
 * another tab changed the list can't act on a different set.
 */
export function removeDictSet(name: string): void {
  writeDictSets(readDictSets().filter((s) => !sameName(s.name, name)));
}

/** The chips for `#dict-saved-list`. The title lists the set's dictionaries. */
export function renderDictSets(sets: readonly DictSet[]): SafeHtml {
  return html`${joinHtml(
    sets.map(
      (set) =>
        html`<span class="dict-set"
          ><button
            type="button"
            class="btn btn-sm dict-set-apply"
            data-name="${set.name}"
            title="${(decodeStoredDictBitmask(set.d) ?? []).join(", ")}">
            ${set.name}</button
          ><button
            type="button"
            class="btn btn-sm dict-set-remove"
            data-name="${set.name}"
            aria-label="Remove ${set.name}"
            title="Remove">
            ×
          </button></span
        >`
    )
  )}`;
}
