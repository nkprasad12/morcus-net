/**
 * UI V2 Target Browser Matrix: Baseline 2023 + Extended Mobile.
 *
 * Single source of truth for browser targets across:
 * 1. `@rsbuild/core` (`output.overrideBrowserslist` in `src/bundler/v2.rsbuild.ts`)
 * 2. Stylelint (`stylelint-no-unsupported-browser-features` in Phase 6)
 *
 * Browserslist acts as an allowlist; unnamed browsers (Opera Mini, UC, IE) are
 * excluded by construction.
 */
export const V2_BROWSERSLIST: readonly string[] = [
  "chrome >= 111",
  "edge >= 111",
  "firefox >= 121",
  "safari >= 16.4",
  "and_chr >= 111",
  "and_ff >= 121",
  "ios_saf >= 16.4",
  "samsung >= 23",
  "opera >= 96",
  "op_mob >= 73",
] as const;
