import * as he from "he";
import {
  getPeAssetHref,
  getPeCriticalCss,
} from "@/web/pe/server/asset_manifest";

export type PeActivePage = "dicts" | "about";

export interface PageShellOptions {
  title: string;
  activePage: PeActivePage;
  contentHtml: string;
}

/**
 * Renders the persistent accessible App Bar navigation.
 * Standard semantic HTML hyperlinks work natively without JavaScript.
 */
export function renderAppBar(activePage: PeActivePage): string {
  const isDictsActive = activePage === "dicts";
  const isAboutActive = activePage === "about";

  return `
    <header class="pe-app-bar">
      <div class="pe-app-bar-inner">
        <a href="/pe/dicts" class="pe-brand">
          <span class="pe-brand-title">M&oacute;rcus</span>
          <span class="pe-brand-badge">Lite</span>
        </a>
        <nav class="pe-nav" aria-label="Main Navigation">
          <a
            href="/pe/dicts"
            class="pe-nav-link ${isDictsActive ? "active" : ""}"
            ${isDictsActive ? 'aria-current="page"' : ""}
          >
            Dictionary
          </a>
          <a
            href="/pe/about"
            class="pe-nav-link ${isAboutActive ? "active" : ""}"
            ${isAboutActive ? 'aria-current="page"' : ""}
          >
            About
          </a>
          <morcus-theme-toggle></morcus-theme-toggle>
        </nav>
      </div>
    </header>
  `;
}

/**
 * Wraps content in the full document skeleton with App Bar, container, and script tags.
 */
export function renderPageShell(options: PageShellOptions): string {
  const titleEncoded = he.encode(options.title);
  const appBarHtml = renderAppBar(options.activePage);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titleEncoded}</title>
  <style>${getPeCriticalCss()}</style>
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
  <link rel="stylesheet" href="${getPeAssetHref("pe.css")}">
</head>
<body>
  ${appBarHtml}
  <div class="pe-container">
    <main>
      ${options.contentHtml}
    </main>
  </div>

  <!-- Progressively enhanced with Lit Web Components -->
  <script type="module" src="${getPeAssetHref("pe.js")}"></script>
</body>
</html>`;
}
