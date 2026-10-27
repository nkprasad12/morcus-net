/**
 * Owner of the app-wide appearance preferences: theme and the reading text's
 * font, size, line spacing and contrast. They live in
 * `GlobalSettings` and are presentation only, so each maps to one pre-paint
 * value on <html> (see docs/PREFERENCES.md):
 *
 * | Setting             | Pre-paint          | Default (removed)        |
 * | :------------------ | :----------------- | :----------------------- |
 * | `darkMode`          | `data-theme`       | absent: the OS scheme    |
 * | `textFont`          | `--font-text`      | sans (`variables.css`)   |
 * | `textScale`         | `--text-scale`     | 1                        |
 * | `lineSpacing`       | `--text-leading`   | 1                        |
 * | `textContrastLight` | `data-text-contrast-light` | normal           |
 * | `textContrastDark`  | `data-text-contrast-dark`  | normal           |
 *
 * Reading-text CSS multiplies its own base size and line height by
 * `--text-scale` and `--text-leading`, so every surface keeps its proportions.
 *
 * Contrast is stored per theme, as one attribute each, and `variables.css`
 * reads only the one for the theme on screen, so "System"
 * follows the OS scheme without script. A subtle colour shift doesn't need
 * pre-paint for itself, but it goes through the snapshot anyway because the
 * embedded dictionary (the reader's and macronizer's iframes) has no
 * Appearance menu to apply it, only the critical script.
 */

import {
  setPrepaint,
  type PrepaintName,
} from "@/web/ui/core/dom/prepaint.client";
import {
  settingsStore,
  type GlobalSettings,
  type LineSpacing,
  type TextContrast,
  type TextFont,
} from "@/web/ui/core/state/settings.client";

export type ThemeChoice = "system" | "light" | "dark";

export const TEXT_SCALE = { min: 70, max: 160, step: 5, default: 100 };
export const DEFAULT_TEXT_FONT: TextFont = "sans";
export const DEFAULT_LINE_SPACING: LineSpacing = "normal";
export const DEFAULT_TEXT_CONTRAST: TextContrast = "normal";

/** Line-height multipliers; with the reader's 1.65 they give 1.45 / 1.65 / 1.85. */
const LEADING: Record<LineSpacing, number> = {
  compact: 0.88,
  normal: 1,
  relaxed: 1.12,
};

/** The resolved appearance, defaults filled in. */
export interface Appearance {
  theme: ThemeChoice;
  textFont: TextFont;
  textScale: number;
  lineSpacing: LineSpacing;
  contrastLight: TextContrast;
  contrastDark: TextContrast;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Resolves stored settings, filling in defaults and clamping out-of-range numbers. */
export function resolveAppearance(settings: GlobalSettings): Appearance {
  return {
    theme:
      settings.darkMode === undefined
        ? "system"
        : settings.darkMode
        ? "dark"
        : "light",
    textFont: settings.textFont ?? DEFAULT_TEXT_FONT,
    textScale: clamp(
      settings.textScale ?? TEXT_SCALE.default,
      TEXT_SCALE.min,
      TEXT_SCALE.max
    ),
    lineSpacing: settings.lineSpacing ?? DEFAULT_LINE_SPACING,
    contrastLight: settings.textContrastLight ?? DEFAULT_TEXT_CONTRAST,
    contrastDark: settings.textContrastDark ?? DEFAULT_TEXT_CONTRAST,
  };
}

/** The settings patch that stores `appearance` (defaults stored as absent). */
export function appearanceToSettings(
  appearance: Appearance
): Partial<GlobalSettings> {
  return {
    darkMode:
      appearance.theme === "system" ? undefined : appearance.theme === "dark",
    textFont:
      appearance.textFont === DEFAULT_TEXT_FONT
        ? undefined
        : appearance.textFont,
    textScale:
      appearance.textScale === TEXT_SCALE.default
        ? undefined
        : appearance.textScale,
    lineSpacing:
      appearance.lineSpacing === DEFAULT_LINE_SPACING
        ? undefined
        : appearance.lineSpacing,
    textContrastLight: nonDefaultContrast(appearance.contrastLight),
    textContrastDark: nonDefaultContrast(appearance.contrastDark),
  };
}

function nonDefaultContrast(c: TextContrast): TextContrast | undefined {
  return c === DEFAULT_TEXT_CONTRAST ? undefined : c;
}

/**
 * The pre-paint values for `appearance`: final strings for <html>, or `null`
 * for a default, which leaves the CSS fallback in charge.
 */
export function appearancePrepaint(
  appearance: Appearance
): [PrepaintName, string | null][] {
  return [
    ["data-theme", appearance.theme === "system" ? null : appearance.theme],
    [
      "--font-text",
      appearance.textFont === "serif" ? "var(--font-serif)" : null,
    ],
    [
      "--text-scale",
      appearance.textScale === TEXT_SCALE.default
        ? null
        : (appearance.textScale / 100).toFixed(2),
    ],
    [
      "--text-leading",
      appearance.lineSpacing === DEFAULT_LINE_SPACING
        ? null
        : String(LEADING[appearance.lineSpacing]),
    ],
    [
      "data-text-contrast-light",
      nonDefaultContrast(appearance.contrastLight) ?? null,
    ],
    [
      "data-text-contrast-dark",
      nonDefaultContrast(appearance.contrastDark) ?? null,
    ],
  ];
}

/**
 * Applies `appearance` to <html>, records it for the critical script, and
 * mirrors it into same-origin iframes (the reader's and macronizer's
 * dictionary), which only read the snapshot when they load.
 */
export function applyAppearance(appearance: Appearance): void {
  const entries = appearancePrepaint(appearance);
  for (const [name, value] of entries) setPrepaint(name, value);
  for (const iframe of document.querySelectorAll<HTMLIFrameElement>("iframe")) {
    try {
      const root = iframe.contentDocument?.documentElement;
      if (root) applyTo(root, entries);
    } catch {
      // Cross-origin iframe: not ours to restyle.
    }
  }
}

function applyTo(
  root: HTMLElement,
  entries: readonly [PrepaintName, string | null][]
) {
  for (const [name, value] of entries) {
    if (name.startsWith("--")) {
      if (value === null) root.style.removeProperty(name);
      else root.style.setProperty(name, value);
    } else if (value === null) {
      root.removeAttribute(name);
    } else {
      root.setAttribute(name, value);
    }
  }
}

/** Reads, resolves and stores; returns the stored result. */
export const appearanceStore = {
  get(): Appearance {
    return resolveAppearance(settingsStore.get());
  },
  set(appearance: Appearance): Appearance {
    settingsStore.update(appearanceToSettings(appearance));
    return appearanceStore.get();
  },
};
