import {
  DEFAULT_DICT_KEYS,
  decodeDictBitmask,
  encodeDictBitmask,
} from "@/web/ui/dict/settings/dict_bitmask.common";
import {
  formatDictsCookie,
  formatInflectedCookie,
  mergeDictKeysForSave,
  parseDictsFromCookie,
} from "@/web/ui/dict/settings/dict_selection.common";

/**
 * Dictionary content preferences on the client.
 *
 * The server resolves dictionaries and inflection (URL → cookie → default) and renders the result;
 * the client adopts that rendered state rather than re-deriving it.
 * The cookie is the only durable store so the server and client never disagree about the user's
 * selection.
 */

/** The dictionary state the server resolved for this page. */
interface RenderedDictState {
  readonly dictKeys: string[];
  readonly bitmask: string;
  readonly isInflected: boolean;
}

/**
 * Reads the resolved state the server rendered onto the search form as `data-d` (bitmask) and
 * `data-o` (`1` | `0`). A missing form or attribute falls back to the defaults, which is also what
 * the server renders when it has nothing better.
 */
export function readRenderedDictState(
  form: HTMLElement | null
): RenderedDictState {
  const dictKeys = decodeDictBitmask(form?.dataset.d) ?? [...DEFAULT_DICT_KEYS];
  return {
    dictKeys,
    bitmask: encodeDictBitmask(dictKeys),
    isInflected: form?.dataset.o !== "0",
  };
}

/**
 * Saves the dictionary selection as the user's durable preference.
 *
 * With `inScopeKeys` (the dictionaries the settings dialog showed), only those change: the rest
 * keep their value in the cookie as it is *now*, so a scoped dialog (the reader's, `lang=La`)
 * never touches dictionaries it didn't offer, even if another tab saved them meanwhile.
 */
export function persistDictKeys(
  dictKeys: string[],
  inScopeKeys?: Iterable<string>
): void {
  const keys =
    inScopeKeys === undefined
      ? dictKeys
      : mergeDictKeysForSave(
          dictKeys,
          inScopeKeys,
          parseDictsFromCookie(document.cookie)
        );
  document.cookie = formatDictsCookie(keys);
}

/** Saves the inflection mode as the user's durable preference. */
export function persistInflected(isInflected: boolean): void {
  document.cookie = formatInflectedCookie(isInflected);
}
