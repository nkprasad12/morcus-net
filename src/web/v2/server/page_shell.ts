import * as he from "he";
import {
  getV2AssetHref,
  getV2CriticalCss,
} from "@/web/v2/server/asset_manifest";
import { renderReportIssueDialog } from "@/web/v2/server/dialog";

export type V2ActivePage = "dicts" | "about" | "reader";

export interface PageShellOptions {
  title: string;
  activePage: V2ActivePage;
  contentHtml: string;
}

/**
 * Renders the persistent accessible App Bar navigation.
 * Standard semantic HTML hyperlinks work natively without JavaScript.
 */
export function renderAppBar(activePage: V2ActivePage): string {
  const isDictsActive = activePage === "dicts";
  const isReaderActive = activePage === "reader";
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
              href="/v2/reader"
              class="v2-nav-link ${isReaderActive ? "active" : ""}"
              ${isReaderActive ? 'aria-current="page"' : ""}
            >
              Reader
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
                <path d="M14.4 6 14 4H5v17h2v-7h5.6l.4 2h7V6z"></path>
              </svg>
            </button>
            ${renderReportIssueDialog()}
          </morcus-report-dialog>
        </div>

        <!-- Mobile Hamburger Dropdown Menu (<details> native Zero-JS) -->
        <details class="v2-mobile-menu">
            <summary class="v2-mobile-menu-btn" aria-label="Open navigation menu">
              <svg viewBox="0 0 24 24" aria-hidden="true" class="v2-icon-menu">
                <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"></path>
              </svg>
              <svg viewBox="0 0 24 24" aria-hidden="true" class="v2-icon-close">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path>
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
                href="/v2/reader"
                class="v2-nav-link ${isReaderActive ? "active" : ""}"
                ${isReaderActive ? 'aria-current="page"' : ""}
              >
                Reader
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
  const appBarHtml = renderAppBar(options.activePage);
  const isReader = options.activePage === "reader";
  const bodyClass = isReader ? ' class="v2-body-reader"' : "";
  const containerClass = isReader
    ? "v2-container v2-container-reader"
    : "v2-container";
  const mainClass = isReader ? ' class="v2-main-reader"' : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titleEncoded}</title>
  <style>${getV2CriticalCss()}</style>
  <script>
    (function() {
      try {
        var s = localStorage.getItem('GlobalSettings');
        if (s) {
          var p = JSON.parse(s);
          if (typeof p.darkMode === 'boolean') {
            document.documentElement.setAttribute('data-theme', p.darkMode ? 'dark' : 'light');
          }
          if (typeof p.highlightStrength === 'number') {
            document.documentElement.style.setProperty('--v2-highlight-scale', (p.highlightStrength / 50));
          }
        }
      } catch (e) {}
    })();
  </script>
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
      <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"></path>
    </svg>
  </a>

  <!-- Single global popover for abbreviation expansions -->
  <div id="v2-abbr-popover" popover="auto" class="v2-abbr-popover"></div>

  <!-- UI V2 enhanced with Lit Web Components -->
  <script type="module" src="${getV2AssetHref("v2.js")}"></script>
</body>
</html>`;
}
