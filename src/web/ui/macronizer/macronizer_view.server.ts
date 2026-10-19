import { parseRomanNumeral } from "@/morceus/numerals/roman_numerals";
import type { MacronizedWord } from "@/macronizer/macronizer_types";
import {
  html,
  joinHtml,
  raw,
  type SafeHtml,
} from "@/web/ui/core/dom/html.common";
import { renderSlotTemplates, slotAttr } from "@/web/ui/core/nav/slots.common";
import { buildDictUrl } from "@/web/ui/dict/search/dict_params.common";
import type {
  MacronizerTierCounts,
  ResolvedMacronizerDocument,
  ResolvedMacronizerWord,
} from "@/web/ui/macronizer/macronizer_apply.server";
import {
  MACRONIZER_MAX_CHARS,
  MACRONIZER_SLOTS,
  formatMacronizerPageTitle,
} from "@/web/ui/macronizer/macronizer_slots.common";
import {
  VOWELS,
  formatVowelChar,
  getCardTagInfo,
  stripLemmaHomograph,
} from "@/web/ui/macronizer/macronizer_tiers.common";
import { renderPageShell } from "@/web/ui/shell/page_shell.server";

export interface MacronizerPageOptions {
  inputText?: string;
  errorBanner?: string;
  document?: ResolvedMacronizerDocument;
  /** The suggestions come from the simulated dev tagger, not LatinCy. */
  simulated?: boolean;
}

/**
 * Encodes a plain word's lemma + morph entries into a compact `data-l` string:
 * `<lemma>:<morph1> · <morph2>;<lemma2>:<morph1>`
 */
function encodePlainWordData(word: MacronizedWord): string {
  const firstOpt = word.options[0];
  if (!firstOpt) return "";
  return firstOpt.options
    .map((o) => {
      const lemma = stripLemmaHomograph(o.lemma);
      const morph = o.morph.filter((m) => m.trim().length > 0).join(" · ");
      return `${lemma}:${morph}`;
    })
    .join(";");
}

function renderInputForm(inputText: string): SafeHtml {
  return html`<form
    id="mac-form"
    class="mac-input-form"
    method="post"
    action="/macronizer">
    <div class="mac-form-header">
      <label for="mac-text" class="mac-form-label">
        Latin text
        <span class="mac-char-limit"
          >(up to ${MACRONIZER_MAX_CHARS.toLocaleString("en-US")}
          characters)</span
        >
      </label>
      <span class="mac-char-counter" id="mac-char-counter" data-js-only
        >(${inputText.length} / ${MACRONIZER_MAX_CHARS})</span
      >
    </div>
    <textarea
      id="mac-text"
      name="text"
      class="mac-textarea"
      rows="6"
      maxlength="${MACRONIZER_MAX_CHARS}"
      placeholder="Arma virumque cano, Troiae qui primus ab oris…">
${inputText}</textarea
    >
    <div class="mac-form-actions">
      <button
        type="submit"
        id="mac-submit-btn"
        class="btn-primary mac-submit-btn">
        Macronize
      </button>
    </div>
  </form>`;
}

function renderStatusContent(counts: MacronizerTierCounts): SafeHtml {
  const unresolvedLabel =
    counts.unresolved === 1 ? "needs a choice" : "need a choice";
  return html`<span class="mac-stat mac-stat-unresolved" data-stat="unresolved"
      ><b>${counts.unresolved}</b> ${unresolvedLabel}</span
    >
    <span class="mac-stat-sep" aria-hidden="true">·</span>
    <span class="mac-stat mac-stat-check" data-stat="to-check"
      ><b>${counts.toCheck}</b> to check</span
    >
    <span class="mac-stat-sep" aria-hidden="true">·</span>
    <span class="mac-stat mac-stat-unknown" data-stat="unknown"
      ><b>${counts.unknown}</b> not in dictionary</span
    >`;
}

function renderPassageTokens(doc: ResolvedMacronizerDocument): SafeHtml {
  return html`${joinHtml(
    doc.tokens.map((token) => {
      if (typeof token === "string") {
        return html`${token}`;
      }
      if (token.tier === 0 && token.decision === "default") {
        const dictHref = buildDictUrl({
          q: token.shownForm,
          inflected: true,
          lang: "La",
          embedded: "1",
        });
        const dataL = encodePlainWordData(token.word);
        // One line per word: this markup repeats for every word of the text.
        // prettier-ignore
        return html`<a class="mac-word mac-plain" data-w="${token.wordIndex}" href="${dictHref}" target="mac-dict" data-l="${dataL}">${token.shownForm}</a>`;
      }
      const chosenClass = token.decision !== "default" ? " mac-chosen" : "";
      const decisionAttr =
        token.decision !== "default"
          ? raw(html` data-decision="${token.decision}"`)
          : raw("");
      const kindClass = token.tier === 5 ? "mac-unknown" : "mac-ambig";
      // prettier-ignore
      return html`<a class="mac-word ${kindClass}${chosenClass}" id="t${token.wordIndex}" href="#w${token.wordIndex}" data-w="${token.wordIndex}" data-tier="${token.tier}"${decisionAttr}>${token.shownForm}</a>`;
    })
  )}`;
}

function renderOptionLemmas(
  opt: MacronizedWord["options"][number],
  base: string
): SafeHtml {
  if (opt.kind === "numeral") {
    const numVal = parseRomanNumeral(base);
    const numLabel =
      numVal !== undefined
        ? `Roman numeral (${numVal}), no macrons`
        : "Roman numeral, no macrons";
    return html`<div class="mac-opt-lemmas">
      <div class="mac-lemma-group">
        <span class="mac-numeral-note">${numLabel}</span>
      </div>
    </div>`;
  }

  return html`<div class="mac-opt-lemmas">
    ${joinHtml(
      opt.options.map((entry) => {
        const cleanLemma = stripLemmaHomograph(entry.lemma);
        const dictHref = buildDictUrl({
          q: cleanLemma,
          inflected: false,
          lang: "La",
          embedded: "1",
        });
        const nonEmptyMorphs = entry.morph.filter((m) => m.trim().length > 0);
        return html`<div class="mac-lemma-group">
          <a class="mac-lemma-link" href="${dictHref}" target="mac-dict"
            >${cleanLemma}</a
          >
          ${nonEmptyMorphs.length > 0
            ? raw(
                html`<ul class="mac-morph-list">
                  ${joinHtml(nonEmptyMorphs.map((m) => html`<li>${m}</li>`))}
                </ul>`
              )
            : raw("")}
        </div>`;
      })
    )}
  </div>`;
}

function renderEditMacronsDetails(
  w: ResolvedMacronizerWord,
  openByDefault: boolean
): SafeHtml {
  const openAttr = openByDefault ? raw(" open") : raw("");
  const n = w.wordIndex;
  return html`<details class="mac-edit" ${openAttr}>
    <summary class="mac-edit-toggle">Edit macrons</summary>
    <input type="hidden" name="m${n}" value="" form="mac-apply" />
    <div
      class="mac-vowels"
      data-w="${n}"
      role="group"
      aria-label="Toggle long vowels on ${w.base}">
      ${joinHtml(
        w.baseChars.map((ch, p) => {
          if (!VOWELS.has(ch)) {
            return html`<span class="mac-char">${ch}</span>`;
          }
          const isLong = w.longAt.has(p);
          const displayChar = formatVowelChar(ch, isLong);
          const checkedAttr = isLong ? raw(" checked") : raw("");
          // prettier-ignore
          return html`<label class="mac-vowel"><input type="checkbox" name="m${n}" value="${p}" form="mac-apply"${checkedAttr} aria-label="Vowel ${ch} at position ${p + 1}" /><span>${displayChar}</span></label>`;
        })
      )}
    </div>
    <p class="mac-edit-hint">Toggle any vowel to mark or clear a macron.</p>
  </details>`;
}

function renderWordCard(w: ResolvedMacronizerWord): SafeHtml {
  if (w.tier === 0 && w.decision === "default") {
    return html``;
  }
  const n = w.wordIndex;
  const tagInfo = getCardTagInfo(w.word, w.tier, w.decision);

  if (w.tier === 5) {
    const dictHref = buildDictUrl({
      q: w.base,
      inflected: true,
      lang: "La",
      embedded: "1",
    });
    return html`<details
      class="mac-card"
      open
      id="w${n}"
      data-w="${n}"
      data-orig="${w.base}"
      data-tier="5">
      <summary class="mac-card-summary">
        <span class="mac-card-orig">${w.base}</span>
        <span class="mac-card-arrow" aria-hidden="true">→</span>
        <span class="mac-card-shown">${w.shownForm}</span>
        <span class="mac-tag ${tagInfo.tagClass}">${tagInfo.label}</span>
      </summary>
      <div class="mac-card-body">
        <p class="mac-unknown-note">
          Morceus doesn't know this word (often a proper noun, medieval
          spelling, or typo). Toggle vowels below to add macrons by hand:
        </p>
        ${raw(renderEditMacronsDetails(w, true))}
        <div class="mac-unknown-lookup">
          <a class="mac-lemma-link" href="${dictHref}" target="mac-dict"
            >Look up <em>${w.base}</em> in dictionary</a
          >
        </div>
        <div class="mac-card-foot">
          <button
            type="button"
            class="btn-secondary mac-keep-btn"
            data-keep="${n}"
            data-js-only>
            ✓ Keep <strong data-keep-form>${w.shownForm}</strong>
            <kbd>Enter</kbd>
          </button>
          <a class="mac-back-link" href="#t${n}" data-nojs-only>↑ in text</a>
        </div>
      </div>
    </details>`;
  }

  const defaultIdx =
    w.word.suggested !== undefined &&
    w.word.suggested >= 0 &&
    w.word.suggested < w.word.options.length
      ? w.word.suggested
      : 0;

  return html`<details
    class="mac-card"
    open
    id="w${n}"
    data-w="${n}"
    data-orig="${w.base}"
    data-tier="${w.tier}">
    <summary class="mac-card-summary">
      <span class="mac-card-orig">${w.base}</span>
      <span class="mac-card-arrow" aria-hidden="true">→</span>
      <span class="mac-card-shown">${w.shownForm}</span>
      <span class="mac-tag ${tagInfo.tagClass}">${tagInfo.label}</span>
    </summary>
    <div class="mac-card-body">
      <fieldset class="mac-options">
        <legend class="sr-only">Macron options for ${w.base}</legend>
        ${joinHtml(
          w.word.options.map((opt, k) => {
            const optFormNfc = opt.form.normalize("NFC");
            const isChecked =
              w.decision === "chosen" && w.chosenOptionIndex === k;
            const isShown =
              w.decision === "chosen"
                ? w.chosenOptionIndex === k
                : w.decision === "default" && defaultIdx === k;
            const isSuggested = w.word.suggested === k;
            const shownAttr = isShown ? raw(' data-shown="1"') : raw("");
            const checkedAttr = isChecked ? raw(" checked") : raw("");
            return html`<div class="mac-opt" ${shownAttr}>
              <label class="mac-opt-radio">
                <input
                  type="radio"
                  name="w${n}"
                  value="${k}"
                  form="mac-apply"
                  ${checkedAttr} />
                <span class="mac-opt-form" lang="la">${optFormNfc}</span>
                ${isSuggested
                  ? raw(html`<span class="mac-badge-sug">suggested</span>`)
                  : raw("")}
                <span class="mac-badge-shown">in text</span>
              </label>
              ${raw(renderOptionLemmas(opt, w.base))}
            </div>`;
          })
        )}
      </fieldset>
      ${raw(renderEditMacronsDetails(w, w.decision === "edited"))}
      <div class="mac-card-foot">
        <button
          type="button"
          class="btn-secondary mac-keep-btn"
          data-keep="${n}"
          data-js-only>
          ✓ Keep <strong data-keep-form>${w.shownForm}</strong>
          <kbd>Enter</kbd>
        </button>
        <a class="mac-back-link" href="#t${n}" data-nojs-only>↑ in text</a>
      </div>
    </div>
  </details>`;
}

function renderSharedPlainCard(): SafeHtml {
  return html`<details
    class="mac-card mac-card-plain"
    open
    id="w-plain"
    data-js-only>
    <summary class="mac-card-summary">
      <span class="mac-card-orig" data-plain-orig></span>
      <span class="mac-card-arrow" aria-hidden="true">→</span>
      <span class="mac-card-shown" data-plain-shown></span>
      <span class="mac-tag mac-tag-plain" data-plain-tag>unambiguous</span>
    </summary>
    <div class="mac-card-body">
      <div class="mac-opt-lemmas" data-plain-lemmas></div>
      <details class="mac-edit" open>
        <summary class="mac-edit-toggle">Override macrons on this word</summary>
        <div
          class="mac-vowels"
          data-plain-vowels
          role="group"
          aria-label="Toggle long vowels"></div>
        <p class="mac-edit-hint">Toggle any vowel to mark or clear a macron.</p>
      </details>
    </div>
  </details>`;
}

function renderMacronizerWorkspaceHtml(
  options: MacronizerPageOptions = {}
): SafeHtml {
  const inputText = options.inputText ?? "";
  const doc = options.document;

  if (!doc) {
    return html`<div class="mac-landing">
      <div class="mac-landing-card">
        <h1 class="mac-landing-title">Latin Macronizer</h1>
        <p class="mac-landing-sub">
          Paste a Latin passage to mark long vowels (ā, ē, ī, ō, ū, ȳ). Words
          with more than one possible vowel length are highlighted so you can
          check or change them.
        </p>
        ${options.errorBanner
          ? raw(
              html`<div class="mac-error-banner" role="alert">
                ${options.errorBanner}
              </div>`
            )
          : raw("")}
        ${raw(renderInputForm(inputText))}
      </div>
    </div>`;
  }

  return html`<div class="mac-split">
    <div class="mac-left">
      <details class="mac-input-details">
        <summary class="mac-input-summary">
          <span
            >Input text (${inputText.length.toLocaleString("en-US")}
            characters)</span
          >
          <span class="mac-input-summary-hint">Edit &amp; re-run</span>
        </summary>
        <div class="mac-input-details-body">
          ${raw(renderInputForm(inputText))}
        </div>
      </details>

      <h1 class="sr-only">Macronizer results</h1>
      ${options.simulated === true
        ? raw(
            html`<p class="mac-simulated-note" data-simulated>
              Suggestions are simulated (development mode): they come from a
              stand-in for the LatinCy tagger, not the real one.
            </p>`
          )
        : raw("")}
      <div class="mac-toolbar">
        <div
          class="mac-status"
          id="mac-status"
          role="status"
          aria-live="polite">
          ${raw(renderStatusContent(doc.counts))}
        </div>
        <div
          class="mac-toolbar-actions"
          role="toolbar"
          aria-label="Macronizer actions">
          <button
            type="button"
            class="btn-secondary mac-btn-next"
            id="mac-next-btn"
            data-js-only>
            Next to review <kbd>Enter</kbd>
          </button>
          <button
            type="button"
            class="btn-primary mac-btn-copy"
            id="mac-copy-btn"
            data-js-only>
            Copy text
          </button>
          <button
            type="submit"
            form="mac-apply"
            class="btn-primary mac-btn-apply"
            data-nojs-only>
            Apply choices
          </button>
        </div>
      </div>

      <div class="mac-passage" id="mac-passage" lang="la">
        ${raw(renderPassageTokens(doc))}
      </div>

      <details class="mac-legend">
        <summary class="mac-legend-summary">
          How highlights work &amp; keyboard shortcuts
        </summary>
        <div class="mac-legend-body">
          <span class="mac-legend-item"
            ><span class="mac-word mac-ambig" data-tier="1">word</span> Needs
            your choice</span
          >
          <span class="mac-legend-item"
            ><span class="mac-word mac-ambig" data-tier="4">word</span>
            Auto-picked · click to check</span
          >
          <span class="mac-legend-item"
            ><span class="mac-word mac-unknown" data-tier="5">word</span> Not in
            dictionary</span
          >
          <span class="mac-legend-item"
            ><span class="mac-word mac-ambig mac-chosen" data-tier="1"
              >word</span
            >
            Reviewed / chosen</span
          >
          <span class="mac-legend-item" data-js-only
            ><kbd>Enter</kbd> Keep &amp; next · <kbd>↓</kbd> Pick option ·
            <kbd>Esc</kbd> Back to word</span
          >
        </div>
      </details>

      <form
        id="mac-apply"
        class="mac-apply-form"
        method="post"
        action="/macronizer/apply">
        <input type="hidden" name="text" value="${inputText}" />
        <input type="hidden" name="sug" value="${doc.encodedSug}" />
        <input type="hidden" name="shown" value="${doc.encodedShown}" />
        <div class="mac-copybox" data-nojs-only>
          <div class="mac-copybox-header">
            <label for="mac-plain-out" class="mac-copybox-label">
              Macronized text — select all (<kbd>Ctrl</kbd>+<kbd>A</kbd>) and
              copy, or fix anything by hand here <strong>last</strong>
            </label>
            <button type="submit" class="btn-primary mac-btn-apply">
              Apply choices
            </button>
          </div>
          <textarea
            id="mac-plain-out"
            class="mac-copybox-textarea"
            rows="6"
            lang="la"
            data-unsubmitted>
${doc.plainText}</textarea
          >
        </div>
      </form>

      <button
        type="button"
        class="mac-sheet-peek"
        id="mac-sheet-peek"
        data-js-only
        aria-label="Expand word inspector">
        <span class="mac-sheet-handle" aria-hidden="true"></span>
        <span class="mac-sheet-label" id="mac-sheet-label"
          >Tap any word to inspect macrons &amp; definitions</span
        >
      </button>
    </div>

    <aside
      class="mac-right"
      id="mac-drawer"
      aria-label="Word inspector and dictionary">
      <div class="drawer-handle" data-js-only aria-hidden="true">
        <span class="drawer-pill"></span>
      </div>
      <div class="mac-inspector" id="mac-inspector">
        <p class="mac-inspector-empty" id="mac-inspector-empty">
          Click any highlighted word in the passage to inspect its vowel
          lengths, or press <kbd>Enter</kbd> to step through words to review.
        </p>
        ${raw(renderSharedPlainCard())}
        ${joinHtml(doc.words.map((w) => renderWordCard(w)))}
      </div>
      <div class="mac-dict-wrap">
        <iframe
          class="mac-dict-frame"
          id="mac-dict-frame"
          name="mac-dict"
          title="Dictionary lookup"
          src="/dicts?embedded=1"></iframe>
      </div>
    </aside>
  </div>`;
}

function renderMacronizerWorkspaceSlot(
  options: MacronizerPageOptions = {}
): SafeHtml {
  const hasResult = options.document !== undefined;
  const workspaceClass = hasResult
    ? "mac-workspace mac-workspace-result"
    : "mac-workspace mac-workspace-landing";
  return html`<div
    class="${workspaceClass}"
    ${raw(slotAttr("macronizer-workspace"))}>
    ${raw(renderMacronizerWorkspaceHtml(options))}
  </div>`;
}

export function renderMacronizerContentHtml(
  options: MacronizerPageOptions = {}
): SafeHtml {
  return html`<morcus-macronizer-view class="mac-root">
    ${raw(renderMacronizerWorkspaceSlot(options))}
  </morcus-macronizer-view>`;
}

export function renderMacronizerPartial(
  options: MacronizerPageOptions = {}
): string {
  return String(
    renderSlotTemplates(
      MACRONIZER_SLOTS.map((slot) => [
        slot,
        String(renderMacronizerWorkspaceSlot(options)),
      ])
    )
  );
}

export function renderMacronizerPage(
  options: MacronizerPageOptions = {}
): string {
  const hasResult = options.document !== undefined;
  return renderPageShell({
    title: formatMacronizerPageTitle(hasResult),
    canonicalPath: hasResult ? undefined : "/macronizer",
    route: "macronizer",
    contentHtml: String(renderMacronizerContentHtml(options)),
  });
}
