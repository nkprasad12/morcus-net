import {
  decodeDictBitmask,
  encodeDictBitmask,
} from "@/web/v2/dict/dict_bitmask.common";
import {
  DEFAULT_DICT_KEYS,
  formatDictsCookie,
  formatInflectedCookie,
  isBorrowedView,
  type DictViewState,
} from "@/web/v2/dict/dict_selection.common";

/**
 * Dictionary content preferences on the client.
 *
 * The server resolves dictionaries and inflection (URL → cookie → default) and renders the result;
 * the client adopts that rendered state rather than re-deriving it (see `docs/PREFERENCES.md`).
 * The cookie is the only durable store. There is deliberately no localStorage copy: a second store
 * is what let the server and client disagree about the user's selection (F1–F6).
 */

/** The dictionary state the server resolved for this page. */
export interface RenderedDictState {
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

/** Saves the dictionary selection as the user's durable preference. */
export function persistDictKeys(dictKeys: string[]): void {
  document.cookie = formatDictsCookie(dictKeys);
}

/** Saves the inflection mode as the user's durable preference. */
export function persistInflected(isInflected: boolean): void {
  document.cookie = formatInflectedCookie(isInflected);
}

/**
 * Whether a settings change made in `form` may be saved. The server marks the form:
 *
 * - `data-scoped` (reader iframe, `lang=` filter): the selection is narrowed for this view, so
 *   changes are never saved.
 * - `data-borrowed` (the view isn't the user's saved settings, e.g. a shared link): changes update
 *   the view but aren't saved, since that would silently adopt the borrowed selection. The chip's
 *   **Save these** saves explicitly. Once `view` matches the saved cookies again there's nothing
 *   borrowed left, so the chip is removed and later changes save as usual.
 *
 * A change outside any search form (there is none today) is saved.
 */
export function mayPersistDictChange(
  form: HTMLFormElement | null,
  view: DictViewState
): boolean {
  if (form === null) return true;
  if (form.hasAttribute("data-scoped")) return false;
  if (form.hasAttribute("data-borrowed")) {
    if (isBorrowedView(view, document.cookie)) return false;
    form.removeAttribute("data-borrowed");
    form.querySelector(".borrowed-chip")?.remove();
  }
  return true;
}
