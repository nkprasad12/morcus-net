import * as he from "he";
import {
  getV2AssetHref,
  getV2CriticalCss,
  getV2CriticalJs,
} from "@/web/ui/shell/asset_manifest.server";
import {
  v2RouteScripts,
  type V2JsChunkName,
  type V2Route,
} from "@/bundler/client_build_contract";
import { renderReportIssueDialog } from "@/web/ui/dialog/dialog.server";
import { getBuildVersion } from "@/web/ui/core/server/build_version.server";
import { ICON_PATHS } from "@/web/ui/core/widgets/icons.common";
import type { WidthSurface } from "@/web/ui/core/widgets/page_width.common";
import { renderPageWidthHandles } from "@/web/ui/shell/page_width.server";
import { THEME_COLOR } from "@/web/ui/shell/theme_color.common";

export type V2ActivePage = "dicts" | "about" | "library" | "corpus";

/**
 * `onerror` for UI V2 module script tags. If any required chunk fails to load
 * (network error, 404), `data-js-failed` on <html> brings back every No-JS
 * fallback (see the JS gate in `critical.css`). There is no CSP today; if
 * one is added, move this into the critical script as a capture-phase `error`
 * listener.
 */
const BUNDLE_ONERROR =
  "document.documentElement.setAttribute('data-js-failed','')";

const SITE_ORIGIN = "https://morcus.net";

/**
 * One `theme-color` per OS scheme, so the browser picks the right one before
 * any script runs. `theme_toggle.client.ts` overrides both with a saved choice.
 */
const THEME_COLOR_META_HTML =
  `\n  <meta name="theme-color" content="${THEME_COLOR.light}" media="(prefers-color-scheme: light)">` +
  `\n  <meta name="theme-color" content="${THEME_COLOR.dark}" media="(prefers-color-scheme: dark)">`;

interface PageShellBaseOptions {
  title: string;
  contentHtml: string;
  /**
   * The page's canonical path (and canonical query, if any), starting with `/`.
   * Emits `<link rel="canonical">` and `<meta property="og:url">` under
   * {@link SITE_ORIGIN}. Omit on non-indexable views (e.g. 404/503 error pages,
   * imported external texts, or embedded iframes).
   */
  canonicalPath?: string;
  hideAppBar?: boolean;
  isReader?: boolean;
  isExternal?: boolean;
  extraHeadHtml?: string;
  /**
   * Gives the page draggable width handles, saved per surface
   * (`core/widgets/page_width.client.ts`). Pages without one (About, External) keep
   * their fixed width.
   */
  widthSurface?: WidthSurface;
}

/** A page with an app-bar entry, which is highlighted. */
interface NavPageShellOptions extends PageShellBaseOptions {
  activePage: V2ActivePage;
  /** The client route, when it isn't the one `activePage` implies. */
  route?: V2Route;
}

/**
 * A page with no app-bar entry (e.g. `/macronizer`): nothing is
 * highlighted, and `route` picks its client chunks.
 */
interface UnlistedPageShellOptions extends PageShellBaseOptions {
  activePage?: undefined;
  route: V2Route;
}

type PageShellOptions = NavPageShellOptions | UnlistedPageShellOptions;

type PageRouteOptions =
  | Pick<NavPageShellOptions, "activePage" | "isExternal" | "route">
  | Pick<UnlistedPageShellOptions, "activePage" | "isExternal" | "route">;

/** Which client route a page is, for choosing its script chunks. */
function pageRoute(options: PageRouteOptions): V2Route {
  if (options.route !== undefined) {
    return options.route;
  }
  return options.isExternal ? "external" : options.activePage;
}

/**
 * Resolves the ordered list of UI V2 client script chunks required for a page.
 *
 * Chunks must be emitted as `<script type="module">` tags in dependency order
 * without `async`, so the browser fetches them in parallel and evaluates them
 * in document order. The order and the dependencies come from the `dependOn`
 * graph in `client_build_contract.ts`, so a page can't load a chunk without its
 * ancestors (it would silently never run).
 */
export function resolvePageScripts(
  options: PageRouteOptions
): readonly V2JsChunkName[] {
  return v2RouteScripts(pageRoute(options));
}

/**
 * Renders the persistent accessible App Bar navigation.
 * Standard semantic HTML hyperlinks work natively without JavaScript.
 * `activePage` is highlighted; with none, no entry is.
 */
export function renderAppBar(activePage?: V2ActivePage): string {
  const isDictsActive = activePage === "dicts";
  const isLibraryActive = activePage === "library";
  const isCorpusActive = activePage === "corpus";
  const isAboutActive = activePage === "about";

  return `
    <header class="app-bar">
      <div class="app-bar-inner">
        <!-- Left on desktop / Center on mobile: Brand Logo & Desktop Nav -->
        <div class="brand-group">
          <a href="/dicts" class="brand-logo-link" aria-label="M&oacute;rcus Home">
            <img src="/public/favicon.ico" alt="M&oacute;rcus Logo" class="brand-logo" width="48" height="48">
          </a>
          <!-- Desktop Navigation Links -->
          <nav class="nav nav-desktop" aria-label="Main Navigation">
            <a
              href="/dicts"
              class="nav-link ${isDictsActive ? "active" : ""}"
              ${isDictsActive ? 'aria-current="page"' : ""}
            >
              Dictionary
            </a>
            <a
              href="/library"
              class="nav-link ${isLibraryActive ? "active" : ""}"
              ${isLibraryActive ? 'aria-current="page"' : ""}
            >
              Library
            </a>
            <a
              href="/corpus"
              class="nav-link ${isCorpusActive ? "active" : ""}"
              ${isCorpusActive ? 'aria-current="page"' : ""}
            >
              Corpus
            </a>
            <a
              href="/about"
              class="nav-link ${isAboutActive ? "active" : ""}"
              ${isAboutActive ? 'aria-current="page"' : ""}
            >
              About
            </a>
          </nav>
        </div>

        <!-- Right on desktop / Left on mobile: Dark/Light Mode & Report Dialog -->
        <div class="actions-group">
          <morcus-theme-toggle data-js-only>
            <button
              type="button"
              class="theme-toggle-btn"
              aria-label="Switch to dark mode"
              title="Switch to dark mode"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="${ICON_PATHS.moon}"></path>
              </svg>
            </button>
          </morcus-theme-toggle>
          <morcus-report-dialog data-js-only>
            <button
              type="button"
              class="theme-toggle-btn report-btn"
              aria-label="Report an issue"
              title="Report an issue"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="${ICON_PATHS.flag}"></path>
              </svg>
            </button>
            ${renderReportIssueDialog()}
          </morcus-report-dialog>
        </div>

        <!-- Mobile Hamburger Dropdown Menu (<details> native Zero-JS) -->
        <details class="mobile-menu">
            <summary class="mobile-menu-btn" aria-label="Open navigation menu">
              <svg viewBox="0 0 24 24" aria-hidden="true" class="icon-menu">
                <path d="${ICON_PATHS.menu}"></path>
              </svg>
              <svg viewBox="0 0 24 24" aria-hidden="true" class="icon-close">
                <path d="${ICON_PATHS.close}"></path>
              </svg>
            </summary>
            <nav class="nav mobile-menu-dropdown" aria-label="Mobile Navigation">
              <a
                href="/dicts"
                class="nav-link ${isDictsActive ? "active" : ""}"
                ${isDictsActive ? 'aria-current="page"' : ""}
              >
                Dictionary
              </a>
              <a
                href="/library"
                class="nav-link ${isLibraryActive ? "active" : ""}"
                ${isLibraryActive ? 'aria-current="page"' : ""}
              >
                Library
              </a>
              <a
                href="/corpus"
                class="nav-link ${isCorpusActive ? "active" : ""}"
                ${isCorpusActive ? 'aria-current="page"' : ""}
              >
                Corpus
              </a>
              <a
                href="/about"
                class="nav-link ${isAboutActive ? "active" : ""}"
                ${isAboutActive ? 'aria-current="page"' : ""}
              >
                About
              </a>
            </nav>
          </details>
      </div>
    </header>
  `;
}

/**
 * Wraps content in the full document skeleton with App Bar, container, and script tags.
 */
export function renderPageShell(options: PageShellOptions): string {
  const titleEncoded = he.escape(options.title);
  const appBarHtml = options.hideAppBar ? "" : renderAppBar(options.activePage);
  const isReader = options.isReader ?? false;
  const isEmbedded = options.hideAppBar ?? false;

  const bodyClasses: string[] = [];
  if (isReader) bodyClasses.push("body-reader");
  if (isEmbedded) bodyClasses.push("body-embedded");
  const widthSurface = isEmbedded ? undefined : options.widthSurface;
  // `body-reader` and `body-dict` are set separately. These are spelled out
  // as literals so `tools/css_audit/css_audit_conformance.test.ts` can match them.
  if (widthSurface === "library") bodyClasses.push("body-library");
  else if (widthSurface === "corpus") bodyClasses.push("body-corpus");
  // Scopes the dictionary page width preset (shell/page_width.css). Embedded
  // dictionaries are excluded so the reader's iframe ignores the setting.
  if (options.activePage === "dicts" && !isReader && !isEmbedded) {
    bodyClasses.push("body-dict");
  }
  const bodyClass =
    bodyClasses.length > 0 ? ` class="${bodyClasses.join(" ")}"` : "";

  const containerClasses: string[] = ["container"];
  if (isReader) containerClasses.push("container-reader");
  if (isEmbedded) containerClasses.push("container-embedded");
  const containerClass = containerClasses.join(" ");

  const mainClasses: string[] = [];
  if (isReader) mainClasses.push("main-reader");
  if (isEmbedded) mainClasses.push("main-embedded");
  const mainClass =
    mainClasses.length > 0 ? ` class="${mainClasses.join(" ")}"` : "";

  const dictPrefetchHtml = isReader
    ? `\n  <link rel="prefetch" href="${getV2AssetHref("dict.js")}">`
    : "";
  // Installability, browser UI colour, canonical URL, and OpenGraph link card
  // metadata. Skipped in embedded iframes, which browsers neither install nor
  // colour and crawlers/unfurlers never visit directly. Every byte here ships on
  // every page, so nothing else: the favicon is `/favicon.ico`, which browsers
  // fetch unprompted (`web_server.ts`), and the manifest covers home-screen
  // icons and standalone mode.
  const canonicalUrlEncoded =
    !isEmbedded && options.canonicalPath
      ? he.escape(`${SITE_ORIGIN}${options.canonicalPath}`)
      : "";
  const canonicalHeadHtml = canonicalUrlEncoded
    ? `\n  <link rel="canonical" href="${canonicalUrlEncoded}">` +
      `\n  <meta property="og:url" content="${canonicalUrlEncoded}">`
    : "";
  const pwaHeadHtml = isEmbedded
    ? ""
    : `\n  <link rel="manifest" href="/public/pwa.webmanifest">` +
      THEME_COLOR_META_HTML +
      canonicalHeadHtml +
      `\n  <meta property="og:site_name" content="Morcus Latin Tools">` +
      `\n  <meta property="og:title" content="${titleEncoded}">` +
      `\n  <meta property="og:type" content="website">` +
      `\n  <meta property="og:image" content="${SITE_ORIGIN}/public/logo512.png">`;
  const extraHeadHtml = options.extraHeadHtml
    ? `\n  ${options.extraHeadHtml}`
    : "";

  const scriptTagsHtml = resolvePageScripts(options)
    .map(
      (scriptName) =>
        `<script type="module" src="${getV2AssetHref(
          scriptName
        )}" onerror="${BUNDLE_ONERROR}"></script>`
    )
    .join("\n  ");

  // Read by `withBuildVersion` (`core/nav/build_version.client.ts`).
  const buildVersion = getBuildVersion();
  const versionAttr =
    buildVersion === undefined
      ? ""
      : ` data-version="${he.escape(buildVersion)}"`;

  return `<!DOCTYPE html>
<html lang="en"${versionAttr}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titleEncoded}</title>${pwaHeadHtml}
  <style>${getV2CriticalCss()}</style>
  <script>${getV2CriticalJs()}</script>
  <link rel="stylesheet" href="${getV2AssetHref(
    "app.css"
  )}">${dictPrefetchHtml}${extraHeadHtml}
</head>
<body${bodyClass}>
  <div id="top"></div>
  ${appBarHtml}
  <div class="${containerClass}">
    <main${mainClass}>
      ${options.contentHtml}
    </main>
  </div>
  ${widthSurface ? renderPageWidthHandles(widthSurface) : ""}

  <a
    href="#top"
    class="back-to-top"
    aria-label="Jump to top"
    title="Jump to top"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="${ICON_PATHS.chevronUp}"></path>
    </svg>
  </a>

  <!-- Single global popover for abbreviation expansions. "manual", not "auto":
       abbr_popover.client.ts owns dismissal; native light-dismiss would close
       it on pointerdown so a second tap on the same word reopened it. -->
  <div id="abbr-popover" popover="manual" class="abbr-popover"></div>

  <!-- UI V2 client-side Web Components bundles -->
  ${scriptTagsHtml}
</body>
</html>`;
}
