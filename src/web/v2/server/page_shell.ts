import * as he from "he";
import {
  getV2AssetHref,
  getV2CriticalCss,
} from "@/web/v2/server/asset_manifest";

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
          <span class="v2-brand-badge">UI V2</span>
          <morcus-theme-toggle></morcus-theme-toggle>
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
