import * as he from "he";
import {
  getV2AssetHref,
  getV2CriticalCss,
  getV2CriticalJs,
} from "@/web/v2/shell/asset_manifest.server";
import { renderReportIssueDialog } from "@/web/v2/dialog/dialog.server";
import { ICON_PATHS } from "@/web/v2/core/icons.common";

export type V2ActivePage = "dicts" | "about" | "library";

export interface PageShellOptions {
  title: string;
  activePage: V2ActivePage;
  contentHtml: string;
  hideAppBar?: boolean;
  isReader?: boolean;
}

/**
 * Renders the persistent accessible App Bar navigation.
 * Standard semantic HTML hyperlinks work natively without JavaScript.
 */
export function renderAppBar(activePage: V2ActivePage): string {
  const isDictsActive = activePage === "dicts";
  const isLibraryActive = activePage === "library";
  const isAboutActive = activePage === "about";

  return `
    <header class="v2-app-bar">
      <div class="v2-app-bar-inner">
        <!-- Left on desktop / Center on mobile: Brand Logo & Desktop Nav -->
        <div class="v2-brand-group">
          <a href="/v2/dicts" class="v2-brand-logo-link" aria-label="M&oacute;rcus Home">
            <img src="/public/favicon.ico" alt="M&oacute;rcus Logo" class="v2-brand-logo" width="48" height="48">
          </a>
          <!-- Desktop Navigation Links -->
          <nav class="v2-nav v2-nav-desktop" aria-label="Main Navigation">
            <a
              href="/v2/dicts"
              class="v2-nav-link ${isDictsActive ? "active" : ""}"
              ${isDictsActive ? 'aria-current="page"' : ""}
            >
              Dictionary
            </a>
            <a
              href="/v2/library"
              class="v2-nav-link ${isLibraryActive ? "active" : ""}"
              ${isLibraryActive ? 'aria-current="page"' : ""}
            >
              Library
            </a>
            <a
              href="/v2/about"
              class="v2-nav-link ${isAboutActive ? "active" : ""}"
              ${isAboutActive ? 'aria-current="page"' : ""}
            >
              About
            </a>
          </nav>
        </div>

        <!-- Right on desktop / Left on mobile: Dark/Light Mode & Report Dialog -->
        <div class="v2-actions-group">
          <morcus-theme-toggle></morcus-theme-toggle>
          <morcus-report-dialog>
            <button
              type="button"
              class="v2-theme-toggle-btn v2-report-btn"
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
        <details class="v2-mobile-menu">
            <summary class="v2-mobile-menu-btn" aria-label="Open navigation menu">
              <svg viewBox="0 0 24 24" aria-hidden="true" class="v2-icon-menu">
                <path d="${ICON_PATHS.menu}"></path>
              </svg>
              <svg viewBox="0 0 24 24" aria-hidden="true" class="v2-icon-close">
                <path d="${ICON_PATHS.close}"></path>
              </svg>
            </summary>
            <nav class="v2-nav v2-mobile-menu-dropdown" aria-label="Mobile Navigation">
              <a
                href="/v2/dicts"
                class="v2-nav-link ${isDictsActive ? "active" : ""}"
                ${isDictsActive ? 'aria-current="page"' : ""}
              >
                Dictionary
              </a>
              <a
                href="/v2/library"
                class="v2-nav-link ${isLibraryActive ? "active" : ""}"
                ${isLibraryActive ? 'aria-current="page"' : ""}
              >
                Library
              </a>
              <a
                href="/v2/about"
                class="v2-nav-link ${isAboutActive ? "active" : ""}"
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
  if (isReader) bodyClasses.push("v2-body-reader");
  if (isEmbedded) bodyClasses.push("v2-body-embedded");
  const bodyClass =
    bodyClasses.length > 0 ? ` class="${bodyClasses.join(" ")}"` : "";

  const containerClasses: string[] = ["v2-container"];
  if (isReader) containerClasses.push("v2-container-reader");
  if (isEmbedded) containerClasses.push("v2-container-embedded");
  const containerClass = containerClasses.join(" ");

  const mainClasses: string[] = [];
  if (isReader) mainClasses.push("v2-main-reader");
  if (isEmbedded) mainClasses.push("v2-main-embedded");
  const mainClass =
    mainClasses.length > 0 ? ` class="${mainClasses.join(" ")}"` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titleEncoded}</title>
  <style>${getV2CriticalCss()}</style>
  <script>${getV2CriticalJs()}</script>
  <link rel="stylesheet" href="${getV2AssetHref("v2.css")}">
</head>
<body${bodyClass}>
  <div id="top"></div>
  ${appBarHtml}
  <div class="${containerClass}">
    <main${mainClass}>
      ${options.contentHtml}
    </main>
  </div>

  <a
    href="#top"
    class="v2-back-to-top"
    aria-label="Jump to top"
    title="Jump to top"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="${ICON_PATHS.chevronUp}"></path>
    </svg>
  </a>

  <!-- Single global popover for abbreviation expansions -->
  <div id="v2-abbr-popover" popover="auto" class="v2-abbr-popover"></div>

  <!-- UI V2 enhanced with Lit Web Components -->
  <script type="module" src="${getV2AssetHref("v2.js")}"></script>
</body>
</html>`;
}
