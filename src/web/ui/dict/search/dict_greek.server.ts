import * as he from "he";
import { getLogeionUrl } from "@/web/ui/dict/search/dict_greek.common";
import { ssr } from "@/web/ui/core/server/ssr_template.server";

/**
 * Renders the Greek search fallback HTML with a direct Logeion link and toggleable inline iframe embed.
 */
export function renderGreekFallbackHtml(query: string): string {
  const logeionUrl = getLogeionUrl(query);
  const escapedQuery = he.escape(query);

  return ssr`
    <div class="greek-fallback" lang="el">
      <div class="greek-notice">
        <p class="greek-title">This site does not (yet) support Greek.</p>
        <p class="greek-desc">
          Search for &ldquo;<strong class="greek-word">${escapedQuery}</strong>&rdquo; directly on
          <a href="${logeionUrl}" target="_blank" rel="noopener noreferrer" class="greek-link">Logeion in a new tab</a>,
          or expand the embedded viewer below:
        </p>
      </div>

      <div class="greek-controls">
        <morcus-greek-embed data-word="${escapedQuery}" data-url="${logeionUrl}">
          <details class="greek-details">
            <summary class="action-btn greek-toggle-btn" role="button" title="Toggle embedded Logeion viewer">
              <span class="greek-toggle-icon" aria-hidden="true">&#x25B8;</span>
              <span class="action-btn-text">Logeion Embed</span>
            </summary>
            <div class="greek-frame-wrapper">
              <iframe
                src="${logeionUrl}"
                class="greek-frame"
                loading="lazy"
                title="Logeion Greek Dictionary search for ${escapedQuery}"
              ></iframe>
            </div>
          </details>

          <label class="greek-auto-open-label" data-js-only>
            <input type="checkbox" class="greek-auto-open-checkbox" />
            <span class="greek-auto-open-text">Automatically open embedded Logeion searches</span>
          </label>
        </morcus-greek-embed>
      </div>
    </div>
  `.trim();
}
