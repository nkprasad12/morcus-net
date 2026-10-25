/**
 * The static "How to write queries" syntax guide ("Flat Panel").
 * Renders a 3-column split on desktop and native subaccordions on mobile
 * from a single section & example data source.
 */

import {
  html,
  joinHtml,
  raw,
  type RawHtml,
  type SafeHtml,
} from "@/web/ui/core/dom/html.common";
import { renderIconSvg } from "@/web/ui/core/widgets/icons.common";
import { CORPUS_PATH } from "@/web/ui/corpus/corpus_params.common";
import { INFLECTION_CATEGORIES } from "@/web/ui/corpus/corpus_syntax.common";

const CHEVRON_ICONS = {
  right: "strokeChevronRight",
  down: "strokeChevronDown",
} as const;

function chevron(
  className: string,
  direction: keyof typeof CHEVRON_ICONS
): string {
  return renderIconSvg(CHEVRON_ICONS[direction], {
    className,
    strokeWidth: 2.5,
  });
}

interface GuideItem {
  readonly code: string;
  readonly text: SafeHtml;
}

interface GuideSection {
  readonly title: string;
  readonly badge: string;
  readonly description: string;
  readonly items: readonly GuideItem[];
  readonly extra?: SafeHtml;
  readonly combine?: SafeHtml;
  readonly note?: string;
}

function renderInflectionCategories(): SafeHtml {
  const rows = [...INFLECTION_CATEGORIES].map(([category, values]) => {
    const list = [...values.keys()].join(", ");
    return html`<li class="guide-item">
      <code>@${category}</code>
      <span>${list}</span>
    </li>`;
  });
  return html`<details class="guide-categories">
    <summary class="guide-categories-summary">
      ${raw(chevron("guide-categories-chevron", "right"))}
      <span>All inflection @categories</span>
    </summary>
    <ul class="guide-col-list guide-categories-list">
      ${joinHtml(rows)}
    </ul>
  </details>`;
}

const GUIDE_SECTIONS: readonly GuideSection[] = [
  {
    title: "Narrowing words",
    badge: "@lemma, @case",
    description: "Target words, lemmas, or inflection tags:",
    items: [
      {
        code: "amoris",
        text: html`Exact word (case-insensitive)`,
      },
      {
        code: "@lemma:amo",
        text: html`Any verb/noun form (<code>@l:amo</code>)`,
      },
      {
        code: "@case:genitive",
        text: html`Case filter (<code>@c:gen</code>)`,
      },
    ],
    extra: renderInflectionCategories(),
    combine: html`Combine with <strong>and</strong> / <strong>or</strong>:
      <code>(@c:gen and @l:amo)</code>`,
  },
  {
    title: "Proximity & distance",
    badge: "~, ~3, ~3>",
    description: "Control word order and proximity:",
    items: [
      {
        code: "(space)",
        text: html`Adjacent words in exact order`,
      },
      {
        code: "~",
        text: html`Within a few words either direction`,
      },
      {
        code: "~3",
        text: html`Within 3 words (max 15)`,
      },
      {
        code: "~3>",
        text: html`Within 3 words strictly before`,
      },
    ],
  },
  {
    title: "Author scope",
    badge: "#Author",
    description: "Restrict queries to a specific classical author:",
    items: [
      {
        code: "#Caesar amoris",
        text: html`Caesar's works only`,
      },
      {
        code: "#Cicero @case:vocative",
        text: html`Cicero vocatives`,
      },
    ],
    note: "One author filter permitted per query.",
  },
];

function renderSectionList(section: GuideSection): SafeHtml {
  const rows: SafeHtml[] = section.items.map(
    (item) => html`<li class="guide-item">
      <code>${item.code}</code>
      <span>${raw(item.text)}</span>
    </li>`
  );
  if (section.extra !== undefined) {
    rows.push(html`<li>${raw(section.extra)}</li>`);
  }
  if (section.combine !== undefined) {
    rows.push(
      html`<li class="guide-item-combine">${raw(section.combine)}</li>`
    );
  }
  if (section.note !== undefined) {
    rows.push(html`<li class="guide-item-note">${section.note}</li>`);
  }
  return html`<ul class="guide-col-list">
    ${joinHtml(rows)}
  </ul>`;
}

function desktopColumns(): RawHtml {
  return joinHtml(
    GUIDE_SECTIONS.map(
      (section) => html`<div class="guide-col">
        <div class="guide-col-title">${section.title}</div>
        <p class="guide-col-desc">${section.description}</p>
        ${raw(renderSectionList(section))}
      </div>`
    )
  );
}

function mobileAccordions(): RawHtml {
  return joinHtml(
    GUIDE_SECTIONS.map(
      (section, index) => html`<details
        class="guide-subaccordion"
        ${index === 0 ? "open" : ""}>
        <summary class="guide-subaccordion-summary">
          <div class="guide-subaccordion-title">
            ${raw(chevron("guide-subaccordion-chevron", "right"))}
            <span>${section.title}</span>
          </div>
          <span class="guide-subaccordion-badge">${section.badge}</span>
        </summary>
        <div class="guide-subaccordion-content">
          ${raw(renderSectionList(section))}
        </div>
      </details>`
    )
  );
}

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

function exampleHref(q: string): string {
  return `${CORPUS_PATH}?${new URLSearchParams({ q }).toString()}`;
}

function desktopExampleRows(): RawHtml {
  return joinHtml(
    EXAMPLES.map(
      (ex) => html`<tr class="guide-example-row">
        <td>
          <a
            href="${exampleHref(ex.query)}"
            class="guide-example-link"
            data-corpus-nav
            ><code>${ex.query}</code></a
          >
        </td>
        <td>${raw(ex.description)}</td>
        <td class="guide-example-cell-sample">${raw(ex.sample)}</td>
      </tr>`
    )
  );
}

function mobileExampleItems(): RawHtml {
  return joinHtml(
    EXAMPLES.map(
      (ex) => html`<a
        href="${exampleHref(ex.query)}"
        class="guide-mobile-example"
        data-corpus-nav>
        <div class="guide-mobile-example-query">
          <code>${ex.query}</code>
        </div>
        <div class="guide-mobile-example-desc">
          ${raw(ex.description)} (e.g. <i>${raw(ex.sample)}</i>)
        </div>
      </a>`
    )
  );
}

/**
 * The inner body of the query guide (3-column desktop grid, interactive examples
 * table, and mobile subaccordions).
 */
function renderGuideInner(): SafeHtml {
  return html`<div class="guide-inner">
    <div class="desktop-guide-view">
      <div class="desktop-guide-grid">${desktopColumns()}</div>
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

    <div class="mobile-guide-container">
      <div class="mobile-guide-accordions">
        ${mobileAccordions()}
        <details class="guide-subaccordion">
          <summary class="guide-subaccordion-summary">
            <div class="guide-subaccordion-title">
              ${raw(chevron("guide-subaccordion-chevron", "right"))}
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
export function renderCorpusHelp(): SafeHtml {
  return html`<details class="corpus-help corpus-help-card" open>
    <summary class="guide-summary">
      <div class="guide-summary-left">
        <span class="guide-title">How to write queries</span>
        <span class="guide-syntax-badge">Syntax Guide</span>
      </div>
      <span class="guide-summary-right">
        <span class="guide-action-desktop">
          <span class="help-action-closed"
            >Show syntax guide &amp; examples</span
          >
          <span class="help-action-open">Hide syntax guide</span>
        </span>
        <span class="guide-action-mobile">
          <span class="help-action-closed">Show guide</span>
          <span class="help-action-open">Hide guide</span>
        </span>
        ${raw(chevron("guide-chevron", "down"))}
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
  return html`<details class="corpus-help corpus-syntax-details">
    <summary class="corpus-syntax-link">
      <span>Syntax guide</span>
      ${raw(chevron("corpus-syntax-chevron", "down"))}
    </summary>
    <div class="corpus-help-panel corpus-help-card">
      ${raw(renderGuideInner())}
    </div>
  </details>`;
}
