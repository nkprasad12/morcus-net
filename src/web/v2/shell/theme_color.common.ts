/**
 * The browser UI colour: `<meta name="theme-color">` (`page_shell.server.ts`,
 * kept in sync by `theme_toggle.client.ts`) and the web app manifest's
 * `theme_color` (`src/web/server/pwa_utils.ts`). It is the app bar background,
 * so the browser toolbar or installed app's title bar blends into it.
 *
 * Must match `--app-bar-bg` in `critical_variables.css` (`variables.test.ts`).
 */
export const THEME_COLOR = { light: "#bfdecf", dark: "#8fae9f" } as const;
