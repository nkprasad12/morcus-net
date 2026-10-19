/**
 * Draggable page width surfaces, shared by the server markup
 * (`shell/page_width.server.ts`) and the client (`core/widgets/page_width.client.ts`).
 */

export type WidthSurface = "reader" | "dict" | "library" | "corpus";

export interface WidthSurfaceConfig {
  /** Width with nothing saved; mirrors the CSS fallback in page_width.css. */
  readonly def: number;
  /** Narrowest draggable width. */
  readonly min: number;
  /** Widths a drag snaps to (the old presets). */
  readonly presets: readonly number[];
}

export const WIDTH_SURFACES: Readonly<
  Record<WidthSurface, WidthSurfaceConfig>
> = {
  // 720 keeps the reader's dictionary split usable: MIN_SPLIT_WIDTH (300) +
  // MIN_TEXT_PANEL_WIDTH (320) + SPLIT_CHROME_WIDTH (22) + side padding.
  reader: { def: 1400, min: 720, presets: [1100, 1400, 1680] },
  // The dictionary width is its reading column (the contents rail is extra,
  // see dict/toc/dict_toc.css).
  dict: { def: 900, min: 560, presets: [760, 900, 1140] },
  library: { def: 900, min: 600, presets: [900, 1200, 1440] },
  corpus: { def: 900, min: 600, presets: [900, 1200, 1440] },
};

export function isWidthSurface(x: unknown): x is WidthSurface {
  return x === "reader" || x === "dict" || x === "library" || x === "corpus";
}
