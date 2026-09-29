/**
 * The static "How to write queries" syntax guide ("Flat Panel").
 * Renders a 3-column split on desktop and native subaccordions on mobile.
 */

import {
  html,
  joinHtml,
  raw,
  type RawHtml,
  type SafeHtml,
} from "@/web/v2/core/html.common";

interface Example {
  readonly query: string;
  readonly description: SafeHtml;
  readonly sample: SafeHtml;
}

const EXAMPLES: readonly Example[] = [
  {
    query: "#Caesar @lemma:bellum",
    description: html`Any inflection of <i>bellum</i> in works by Caesar`,
    sample: html`bellum, belli, bella...`,
  },
  {
    query: "@lemma:do @case:dat",
    description: html`Any form of <i>do</i> followed by a dative word`,
    sample: html`dedit nato, dant patri`,
  },
  {
    query: "(@lemma:do or @lemma:habeo) ~ @case:acc",
    description: html`<i>do</i> or <i>habeo</i> near an accusative word`,
    sample: html`dedi panem, habet ensem`,
  },
  {
    query: "amoris",
    description: html`Exact occurrences of <i>amoris</i>`,
    sample: html`amoris, Amoris`,
  },
];

function desktopExampleRows(): RawHtml {
  return joinHtml(
    EXAMPLES.map((ex) => {
      const href = `/v2/corpus?${new URLSearchParams({
        q: ex.query,
      }).toString()}`;
      return html`<tr class="guide-example-row">
        <td class="guide-example-cell-query">
          <a href="${href}" class="guide-example-link" data-corpus-nav
            ><code>${ex.query}</code></a
          >
        </td>
        <td class="guide-example-cell-desc">${raw(ex.description)}</td>
        <td class="guide-example-cell-sample">${raw(ex.sample)}</td>
      </tr>`;
    })
  );
}

function mobileExampleItems(): RawHtml {
  return joinHtml(
    EXAMPLES.map((ex) => {
      const href = `/v2/corpus?${new URLSearchParams({
        q: ex.query,
      }).toString()}`;
      return html`<a
        href="${href}"
        class="guide-mobile-example"
        data-corpus-nav>
        <div class="guide-mobile-example-query">
          <code>${ex.query}</code>
        </div>
        <div class="guide-mobile-example-desc">
          ${raw(ex.description)} (e.g. <i>${raw(ex.sample)}</i>)
        </div>
      </a>`;
    })
  );
}

/**
 * The inner body of the query guide (3-column desktop grid, interactive examples
 * table, and mobile subaccordions).
 */
export function renderGuideInner(): SafeHtml {
  return html`<div class="guide-inner">
    <!-- Desktop View: 3-Column Split with Hairline Dividers -->
    <div class="desktop-guide-view">
      <div class="desktop-guide-grid">
        <!-- Col 1: Narrowing Words -->
        <div class="guide-col">
          <div class="guide-col-title">Narrowing words &amp; grammar</div>
          <p class="guide-col-desc">
            Target words, lemmas, or inflection tags:
          </p>
          <ul class="guide-col-list">
            <li>
              <code>amoris</code>
              <span>Exact word (case-insensitive)</span>
            </li>
            <li>
              <code>@lemma:amo</code>
              <span>Any verb/noun form (<code>@l:amo</code>)</span>
            </li>
            <li>
              <code>@case:genitive</code>
              <span>Case filter (<code>@c:gen</code>)</span>
            </li>
            <li class="guide-col-combine">
              Combine with <strong>and</strong> / <strong>or</strong>:
              <code>(@c:gen and @l:amo)</code>
            </li>
          </ul>
        </div>

        <!-- Col 2: Proximity & Distance -->
        <div class="guide-col">
          <div class="guide-col-title">Proximity &amp; distance</div>
          <p class="guide-col-desc">Control word order and proximity:</p>
          <ul class="guide-col-list">
            <li>
              <code>(space)</code>
              <span>Adjacent words in exact order</span>
            </li>
            <li>
              <code>~</code>
              <span>Within a few words either direction</span>
            </li>
            <li>
              <code>~3</code>
              <span>Within 3 words (max 15)</span>
            </li>
            <li>
              <code>~3&gt;</code>
              <span>Within 3 words strictly before</span>
            </li>
          </ul>
        </div>

        <!-- Col 3: Author Scope -->
        <div class="guide-col">
          <div class="guide-col-title">Author scope</div>
          <p class="guide-col-desc">
            Restrict queries to a specific classical author:
          </p>
          <ul class="guide-col-list">
            <li>
              <code>#Caesar amoris</code>
              <span>Caesar's works only</span>
            </li>
            <li>
              <code>#Cicero @case:vocative</code>
              <span>Cicero vocatives</span>
            </li>
            <li class="guide-col-note">
              One author filter permitted per query.
            </li>
          </ul>
        </div>
      </div>

      <!-- Desktop Examples Table -->
      <div class="guide-examples-section">
        <div class="guide-examples-title">
          Query Examples
          <span class="guide-examples-subtitle"
            >(click to test in search bar)</span
          >
        </div>
        <div class="guide-table-scroll">
          <table class="guide-examples-table">
            <thead>
              <tr>
                <th>Query</th>
                <th>Description</th>
                <th>Sample Matches</th>
              </tr>
            </thead>
            <tbody>
              ${desktopExampleRows()}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Mobile View: Flat Sub-Accordions -->
    <div class="mobile-guide-container">
      <div class="mobile-guide-accordions">
        <!-- Subaccordion 1: Narrowing Words -->
        <details class="guide-subaccordion" open>
          <summary class="guide-subaccordion-summary">
            <div class="guide-subaccordion-title">
              <svg
                class="guide-subaccordion-chevron"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                aria-hidden="true">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
              <span>Narrowing words</span>
            </div>
            <span class="guide-subaccordion-badge">@lemma, @case</span>
          </summary>
          <div class="guide-subaccordion-content">
            <div class="guide-item">
              <code>amoris</code>
              <span>Exact word (case-insensitive)</span>
            </div>
            <div class="guide-item">
              <code>@lemma:amo</code>
              <span>Any verb/noun form (<code>@l:amo</code>)</span>
            </div>
            <div class="guide-item">
              <code>@case:genitive</code>
              <span>Case filter (<code>@c:gen</code>)</span>
            </div>
            <div class="guide-item-combine">
              Combine with <strong>and</strong> / <strong>or</strong>:
              <code>(@c:gen and @l:amo)</code>
            </div>
          </div>
        </details>

        <!-- Subaccordion 2: Proximity & Distance -->
        <details class="guide-subaccordion">
          <summary class="guide-subaccordion-summary">
            <div class="guide-subaccordion-title">
              <svg
                class="guide-subaccordion-chevron"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                aria-hidden="true">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
              <span>Proximity &amp; distance</span>
            </div>
            <span class="guide-subaccordion-badge">~, ~3, ~3&gt;</span>
          </summary>
          <div class="guide-subaccordion-content">
            <div class="guide-item">
              <code>(space)</code>
              <span>Adjacent words in order</span>
            </div>
            <div class="guide-item">
              <code>~</code>
              <span>Within a few words either direction</span>
            </div>
            <div class="guide-item">
              <code>~3</code>
              <span>Within 3 words (max 15)</span>
            </div>
            <div class="guide-item">
              <code>~3&gt;</code>
              <span>Within 3 words strictly before</span>
            </div>
          </div>
        </details>

        <!-- Subaccordion 3: Author Scope -->
        <details class="guide-subaccordion">
          <summary class="guide-subaccordion-summary">
            <div class="guide-subaccordion-title">
              <svg
                class="guide-subaccordion-chevron"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                aria-hidden="true">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
              <span>Author scope</span>
            </div>
            <span class="guide-subaccordion-badge">#Author</span>
          </summary>
          <div class="guide-subaccordion-content">
            <div class="guide-item">
              <code>#Caesar amoris</code>
              <span>Caesar's works only</span>
            </div>
            <div class="guide-item">
              <code>#Cicero @case:vocative</code>
              <span>Cicero vocatives</span>
            </div>
            <div class="guide-item-note">
              One author filter permitted per query
            </div>
          </div>
        </details>

        <!-- Subaccordion 4: Interactive Examples -->
        <details class="guide-subaccordion">
          <summary class="guide-subaccordion-summary">
            <div class="guide-subaccordion-title">
              <svg
                class="guide-subaccordion-chevron"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                aria-hidden="true">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
              <span>Query examples</span>
            </div>
            <span class="guide-subaccordion-badge">Tap to test</span>
          </summary>
          <div class="guide-subaccordion-content guide-mobile-examples">
            ${mobileExampleItems()}
          </div>
        </details>
      </div>
    </div>
  </div>`;
}

/**
 * The flat panel query guide card. Rendered open on landing and zero-results views.
 */
export function renderCorpusHelp(open: boolean = true): SafeHtml {
  return html`<details
    id="corpusHelpCard"
    class="corpus-help corpus-help-card"
    ${open ? "open" : ""}>
    <summary class="guide-summary">
      <div class="guide-summary-left">
        <span class="guide-title">How to write queries</span>
        <span class="guide-syntax-badge">Syntax Guide</span>
      </div>
      <span class="guide-summary-right">
        <span class="helpSummaryAction">
          <span class="help-action-closed"
            >Show syntax guide &amp; examples</span
          >
          <span class="help-action-open">Hide syntax guide</span>
        </span>
        <span class="helpSummaryActionMobile">
          <span class="help-action-closed">Show guide</span>
          <span class="help-action-open">Hide guide</span>
        </span>
        <svg
          class="guide-chevron"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          aria-hidden="true">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </span>
    </summary>
    ${raw(renderGuideInner())}
  </details>`;
}

/**
 * Native Zero-JS inline disclosure for populated results views. Sits inline
 * in the subtitle and unfolds the guide panel on demand without vertical push.
 */
export function renderInlineHelpDisclosure(): SafeHtml {
  return html`<details
    id="corpusHelpCard"
    class="corpus-help corpus-syntax-details">
    <summary class="corpus-syntax-link">
      <span>Syntax guide</span>
      <svg
        class="corpus-syntax-chevron"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        aria-hidden="true">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </summary>
    <div class="corpus-help-panel corpus-help-card">
      ${raw(renderGuideInner())}
    </div>
  </details>`;
}
