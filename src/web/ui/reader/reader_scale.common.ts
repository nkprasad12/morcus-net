/**
 * Side-panel text sizing, shared by the reader's server markup and client.
 *
 * The side panel (dictionary, translation, notes) is sized in percent of the
 * main reading text, whose base is `--reader-base` in `reader_text.css`. The
 * embedded dictionary's own text is based on 1.1rem, so it gets that size
 * rescaled, as its `--dict-scale` (and the `scale=` URL param).
 */

/** The side panel's default size, in percent of the main reading text. */
export const DEFAULT_PANEL_SCALE = 85;

/** `--reader-base` in `reader_text.css`, per breakpoint. */
export const READER_BASE_REM = { desktop: 1.2, phone: 1.1 } as const;

/** The breakpoint at which `--reader-base` switches to the phone value. */
export const PHONE_QUERY = "(max-width: 640px)";

/** The base size of the dictionary's entry text. */
const DICT_BASE_REM = 1.1;

/** The dictionary's `--dict-scale`, in percent, for a side-panel size. */
export function dictScaleFor(panelPercent: number, phone: boolean): number {
  const base = phone ? READER_BASE_REM.phone : READER_BASE_REM.desktop;
  return Math.round((panelPercent * base) / DICT_BASE_REM);
}
