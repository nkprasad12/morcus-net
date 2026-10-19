/**
 * The browser UI colour: `<meta name="theme-color">` (`page_shell.server.ts`,
 * kept in sync by `theme_toggle.client.ts`). It is the app bar background,
 * so the browser toolbar or installed app's title bar blends into it.
 *
 * Must match `--app-bar-bg` in `critical_variables.css` (`variables.test.ts`).
 */
export const THEME_COLOR = { light: "#bfdecf", dark: "#1f332b" } as const;

/**
 * The web app manifest's `theme_color` and `background_color`
 * (`src/web/server/pwa_utils.ts`). Unlike the meta tag, installed Android apps
 * read these once at install and can't follow the theme toggle, so this is a
 * mid green between the light and dark app bars that looks intentional in both:
 * - Chrome Android colours the system nav bar with `theme_color` (its status
 *   bar follows the live meta tag) and the launch splash with `background_color`.
 * - Firefox Android colours the status bar with `theme_color`, and makes the
 *   nav bar black or white depending on whether `background_color` is dark.
 *   This colour counts as dark, so the nav bar is black.
 * - Safari (iOS 26) ignores both and samples the page instead.
 */
export const MANIFEST_COLOR = "#5f8a77";
