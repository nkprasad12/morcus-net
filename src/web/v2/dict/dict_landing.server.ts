import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { buildWelcomeMessage } from "@/web/v2/dict/dict_landing.common";
import { DEFAULT_DICT_KEYS } from "@/web/v2/dict/dict_selection.server";

function fullLang(code: string): string {
  switch (code) {
    case "La":
      return "Latin";
    case "En":
      return "English";
    case "Fr":
      return "French";
    case "De":
      return "German";
    case "Es":
      return "Spanish";
    default:
      return code;
  }
}

interface DictItem {
  key: string;
  displayName: string;
  targetLang: string;
}

/**
 * Categorizes available dictionaries into "From Latin" and "To Latin".
 */
function getDirectionalDicts(): {
  fromLatin: DictItem[];
  toLatin: DictItem[];
} {
  const fromLatin: DictItem[] = [];
  const toLatin: DictItem[] = [];

  for (const dict of LatinDict.AVAILABLE) {
    if (dict.key === "NUM") continue;
    if (dict.languages.from === "La") {
      const targetLang = fullLang(dict.languages.to);
      fromLatin.push({
        key: dict.key,
        displayName: dict.displayName,
        targetLang: targetLang === "Latin" ? "Latin" : targetLang,
      });
    } else if (dict.languages.to === "La") {
      toLatin.push({
        key: dict.key,
        displayName: dict.displayName,
        targetLang: fullLang(dict.languages.from),
      });
    }
  }

  return { fromLatin, toLatin };
}

/**
 * Renders the rich landing state for empty dictionary searches in V2.
 */
export function renderDictLandingHtml(
  activeDicts?: string[],
  isInflected: boolean = true
): string {
  const { fromLatin, toLatin } = getDirectionalDicts();
  const dictKeys =
    activeDicts && activeDicts.length > 0 ? activeDicts : DEFAULT_DICT_KEYS;
  const welcomeText = buildWelcomeMessage(dictKeys, isInflected);

  const activeKeysSet = new Set(dictKeys.map((k) => k.toUpperCase()));

  const renderDictList = (items: DictItem[]) =>
    items
      .map((d) => {
        const isEnabled = activeKeysSet.has(d.key.toUpperCase());
        const statusClass = isEnabled ? "v2-dict-enabled" : "v2-dict-disabled";
        return `
        <li class="v2-dict-list-item ${statusClass}" data-dict-key="${d.key}">
          <strong class="v2-lexicon-badge ${statusClass}">${d.key}</strong>
          <span class="v2-lexicon-name">${d.displayName}</span>
          <span class="v2-lexicon-lang">(${d.targetLang})</span>
        </li>
      `;
      })
      .join("");

  return `
    <div class="v2-landing-container">
      <!-- Dynamic Welcome message based on active dictionaries -->
      <p class="v2-landing-welcome" id="v2-landing-welcome">${welcomeText}</p>

      <!-- Two-column info grid -->
      <div class="v2-landing-grid">
        <!-- Column 1: Dictionaries (First on mobile & desktop) -->
        <section class="v2-landing-card">
          <header class="v2-landing-card-header">
            <h3 class="v2-landing-card-title">All Dictionaries</h3>
          </header>
          <div class="v2-landing-card-body">
            <div class="v2-dict-sections">
              <div class="v2-dict-section">
                <h4 class="v2-dict-section-title">From Latin</h4>
                <ul class="v2-lexicon-list">
                  ${renderDictList(fromLatin)}
                </ul>
              </div>
              <div class="v2-dict-section">
                <h4 class="v2-dict-section-title">To Latin</h4>
                <ul class="v2-lexicon-list">
                  ${renderDictList(toLatin)}
                </ul>
              </div>
            </div>

            <div class="v2-card-settings-note">
              <svg class="v2-landing-tune-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"></path>
              </svg>
              <span>Enable or disable dictionaries in the settings</span>
            </div>
          </div>
        </section>

        <!-- Column 2: Understanding the Markup -->
        <section class="v2-landing-card">
          <header class="v2-landing-card-header">
            <h3 class="v2-landing-card-title">Understanding the Markup</h3>
          </header>
          <div class="v2-landing-card-body">
            <p class="v2-landing-card-desc">
              Entries highlight grammar, citations, and sections:
            </p>

            <!-- Minimal mock entry demonstrating all styling classes -->
            <div class="v2-sample-entry">
              <div class="v2-sample-entry-line">
                <span class="lsOrth">unda</span>, ae,
                <span class="lsGrammar"><span class="lsHover" title="feminine">f.</span></span>,
                <em>a wave, billow, surge</em>.
              </div>
              <div class="v2-sample-entry-sense">
                <a href="#sample-sense" class="lsSenseBullet v2-section-anchor" title="Direct link to this section">I.</a>
                <span class="lsHover" title="literal">Lit.</span>:
                <span class="lsQuote">mare plenum undarum</span>,
                <span class="lsBibl"><span class="lsAuthor lsHover" title="Plautus">Plaut.</span> Mil. 2, 6, 33</span>
              </div>
            </div>

            <!-- Expandable legend explaining every color and interactive style (collapsed by default) -->
            <details class="v2-legend-details">
              <summary class="v2-legend-summary">
                <span class="v2-legend-summary-title">What do the colors mean?</span>
                <span class="v2-legend-summary-arrow" aria-hidden="true">▾</span>
              </summary>
              <div class="v2-legend-body">
                <ul class="v2-legend-list">
                  <li>
                    <span class="v2-legend-sample"><span class="lsOrth">unda</span></span>
                    <span class="v2-legend-explain"><strong>Red tint:</strong> Lemma headwords</span>
                  </li>
                  <li>
                    <span class="v2-legend-sample"><span class="lsGrammar">f.</span></span>
                    <span class="v2-legend-explain"><strong>Orange tint:</strong> Grammatical gender, parts of speech, usage notes</span>
                  </li>
                  <li>
                    <span class="v2-legend-sample"><span class="lsQuote">“mare…”</span></span>
                    <span class="v2-legend-explain"><strong>Blue tint:</strong> Latin quotations</span>
                  </li>
                  <li>
                    <span class="v2-legend-sample"><span class="lsBibl"><span class="lsAuthor">Cic.</span></span></span>
                    <span class="v2-legend-explain"><strong>Purple tint:</strong> Ancient authors, works, and passage references</span>
                  </li>
                  <li>
                    <span class="v2-legend-sample"><span class="lsHover" title="Example tooltip">Lit.</span></span>
                    <span class="v2-legend-explain"><strong>Dotted underline:</strong> Possible abbreviations (hover or tap to expand)</span>
                  </li>
                  <li>
                    <span class="v2-legend-sample"><span class="lsSenseBullet v2-section-anchor">I.</span></span>
                    <span class="v2-legend-explain"><strong>Grey badge:</strong> Section headers (click to jump or copy URL)</span>
                  </li>
                </ul>
              </div>
            </details>

            <!-- Only displayed when JS is active since the slider is client-injected -->
            <div class="v2-legend-settings-tip v2-js-only">
              <svg class="v2-landing-tune-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"></path>
              </svg>
              <span>You can change highlight intensity in the settings</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;
}
