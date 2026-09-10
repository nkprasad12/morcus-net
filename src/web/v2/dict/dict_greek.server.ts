import * as he from "he";
import { getLogeionUrl } from "@/web/v2/dict/dict_greek.common";

/**
 * Renders the Greek search fallback HTML with a direct Logeion link and toggleable inline iframe embed.
 */
export function renderGreekFallbackHtml(query: string): string {
  const logeionUrl = getLogeionUrl(query);
  const escapedQuery = he.escape(query);

  return `
    <div class="v2-greek-fallback" lang="el">
      <div class="v2-greek-notice">
        <p class="v2-greek-title">This site does not (yet) support Greek.</p>
        <p class="v2-greek-desc">
          Search for &ldquo;<strong class="v2-greek-word">${escapedQuery}</strong>&rdquo; directly on
          <a href="${logeionUrl}" target="_blank" rel="noopener noreferrer" class="v2-greek-link">Logeion in a new tab</a>,
          or expand the embedded viewer below:
        </p>
      </div>

      <div class="v2-greek-controls">
        <morcus-greek-embed data-word="${escapedQuery}" data-url="${logeionUrl}">
          <details class="v2-greek-details">
            <summary class="v2-action-btn v2-greek-toggle-btn" role="button" title="Toggle embedded Logeion viewer">
              <span class="v2-greek-toggle-icon" aria-hidden="true">&#x25B8;</span>
              <span class="v2-greek-toggle-text">Open Logeion Embed</span>
            </summary>
            <div class="v2-greek-frame-wrapper">
              <iframe
                src="${logeionUrl}"
                class="v2-greek-frame"
                loading="lazy"
                title="Logeion Greek Dictionary search for ${escapedQuery}"
              ></iframe>
            </div>
          </details>

          <label class="v2-greek-auto-open-label">
            <input type="checkbox" class="v2-greek-auto-open-checkbox" />
            <span class="v2-greek-auto-open-text">Automatically open embedded Logeion searches</span>
          </label>
        </morcus-greek-embed>
      </div>
    </div>
  `.trim();
}
