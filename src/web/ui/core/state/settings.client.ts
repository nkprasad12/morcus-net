import { isBoolean, isNumber, Validator } from "@/web/utils/rpc/parsing";
import { storage } from "@/web/ui/core/state/storage.client";

/**
 * Typed LocalStorage settings store for UI V2.
 */

/**
 * A dragged page width (see `core/widgets/page_width.client.ts`): a px width, or
 * `"full"` to follow the window. The default is the absence of a value.
 */
export type DraggedPageWidth = number | "full";

export const isDraggedPageWidth: Validator<DraggedPageWidth> = (
  x: unknown
): x is DraggedPageWidth =>
  x === "full" || (isNumber(x) && Number.isFinite(x) && x > 0);

export interface GlobalSettings {
  darkMode?: boolean;
  highlightStrength?: number;
  /** Reading-text font (`--font-text`); absent means the sans default. */
  textFont?: TextFont;
  /** Reading-text size in percent (`--text-scale`); absent means 100. */
  textScale?: number;
  /** Reading-text line spacing (`--text-leading`); absent means normal. */
  lineSpacing?: LineSpacing;
  /** Reading-text contrast in the light theme; absent means the default. */
  textContrastLight?: TextContrast;
  /** Reading-text contrast in the dark theme; absent means the default. */
  textContrastDark?: TextContrast;
  /** How dictionary highlights are drawn; absent means background tints. */
  highlightStyle?: HighlightStyle;
  autoOpenLogeion?: boolean;
  readerWidth?: DraggedPageWidth;
  libraryWidth?: DraggedPageWidth;
  corpusWidth?: DraggedPageWidth;
  dictWidth?: DraggedPageWidth;
}

export type TextFont = "sans" | "serif";
export type LineSpacing = "compact" | "normal" | "relaxed";
export type TextContrast = "softer" | "normal" | "higher" | "highest";
export type HighlightStyle = "background" | "text";

export const isTextFont: Validator<TextFont> = (x: unknown): x is TextFont =>
  x === "sans" || x === "serif";
export const isLineSpacing: Validator<LineSpacing> = (
  x: unknown
): x is LineSpacing => x === "compact" || x === "normal" || x === "relaxed";
/** The contrast levels, lowest first (the Appearance menu steps through them). */
export const TEXT_CONTRASTS: readonly TextContrast[] = [
  "softer",
  "normal",
  "higher",
  "highest",
];
export const isTextContrast: Validator<TextContrast> = (
  x: unknown
): x is TextContrast =>
  x === "softer" || x === "normal" || x === "higher" || x === "highest";
export const isHighlightStyle: Validator<HighlightStyle> = (
  x: unknown
): x is HighlightStyle => x === "background" || x === "text";

export const GLOBAL_SETTINGS_KEY = "GlobalSettings";

export type FieldCheckers<T> = {
  [K in keyof T]-?: Validator<NonNullable<T[K]>>;
};

/**
 * Extracts and validates properties from an unknown value based on a schema of validators.
 * Invalid or undefined fields are omitted from the returned partial object.
 */
export function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export function pickValid<T extends object>(
  raw: unknown,
  checkers: FieldCheckers<T>
): Partial<T> {
  if (!isRecord(raw)) {
    return {};
  }
  const result: Partial<T> = {};
  for (const property in checkers) {
    if (Object.prototype.hasOwnProperty.call(checkers, property)) {
      const val = raw[property];
      const checker = checkers[property];
      if (val !== undefined && checker(val)) {
        Reflect.set(result, property, val);
      }
    }
  }
  return result;
}

const GLOBAL_SETTINGS_CHECKERS: FieldCheckers<GlobalSettings> = {
  darkMode: isBoolean,
  highlightStrength: isNumber,
  textFont: isTextFont,
  textScale: isNumber,
  lineSpacing: isLineSpacing,
  textContrastLight: isTextContrast,
  textContrastDark: isTextContrast,
  highlightStyle: isHighlightStyle,
  autoOpenLogeion: isBoolean,
  readerWidth: isDraggedPageWidth,
  libraryWidth: isDraggedPageWidth,
  corpusWidth: isDraggedPageWidth,
  dictWidth: isDraggedPageWidth,
};

export function parseSettings(raw: string | null): GlobalSettings {
  if (!raw) return {};
  try {
    return pickValid<GlobalSettings>(JSON.parse(raw), GLOBAL_SETTINGS_CHECKERS);
  } catch {
    return {};
  }
}

export const settingsStore = {
  get(): GlobalSettings {
    return parseSettings(storage.get(GLOBAL_SETTINGS_KEY));
  },

  update(patch: Partial<GlobalSettings>): GlobalSettings {
    const current = settingsStore.get();
    const next = { ...current, ...patch };
    storage.setJson(GLOBAL_SETTINGS_KEY, next);
    return next;
  },
};
