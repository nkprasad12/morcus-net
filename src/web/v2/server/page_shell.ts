import * as he from "he";
import {
  getV2AssetHref,
  getV2CriticalCss,
} from "@/web/v2/server/asset_manifest";
import { renderReportIssueDialog } from "@/web/v2/server/dialog";

export type V2ActivePage = "dicts" | "about";

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
  const isAboutActive = activePage === "about";

  return `
    <header class="v2-app-bar">
      <div class="v2-app-bar-inner">
        <div class="v2-app-bar-left">
          <a href="/v2/dicts" class="v2-brand-logo-link" aria-label="M&oacute;rcus Home">
            <img src="/public/favicon.ico" alt="M&oacute;rcus Logo" class="v2-brand-logo" width="48" height="48">
          </a>
          <nav class="v2-nav" aria-label="Main Navigation">
            <a
              href="/v2/dicts"
              class="v2-nav-link ${isDictsActive ? "active" : ""}"
              ${isDictsActive ? 'aria-current="page"' : ""}
            >
              Dictionary
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
        <div class="v2-app-bar-right">
          <span class="v2-brand-badge">V2</span>
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
        }
      } catch (e) {}
    })();
  </script>
  <link rel="stylesheet" href="${getV2AssetHref("v2.css")}">
</head>
<body>
  ${appBarHtml}
  <div class="v2-container">
    <main>
      ${options.contentHtml}
    </main>
  </div>

  <!-- UI V2 enhanced with Lit Web Components -->
  <script type="module" src="${getV2AssetHref("v2.js")}"></script>
</body>
</html>`;
}
