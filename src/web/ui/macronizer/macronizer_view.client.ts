import {
  BaseElement,
  DrawerController,
  copyText,
  currentIframeSrc,
  escapeId,
  html,
  joinHtml,
  raw,
  registerElement,
  showToast,
  swapElementContent,
  swapSlots,
} from "@/web/ui/core/index.client";
import { buildDictUrl } from "@/web/ui/dict/search/dict_params.common";
import {
  MACRONIZER_MAX_CHARS,
  MACRONIZER_SLOTS,
  formatMacronizerPageTitle,
} from "@/web/ui/macronizer/macronizer_slots.common";
import {
  VOWELS,
  buildFromVowels,
  formatVowelChar,
  splitMacrons,
  stripLemmaHomograph,
  wordBase,
} from "@/web/ui/macronizer/macronizer_tiers.common";

interface ReviewBucket {
  readonly id: 1 | 2 | 3;
  readonly label: string;
  readonly words: HTMLElement[];
}

const MAC_TEXT = "#mac-text";

export class MorcusMacronizerView extends BaseElement<"macronize"> {
  // Elements read in more than one place. Getters, not cached fields: the
  // `macronizer-workspace` slot is replaced on every submit.
  get #textarea() {
    return this.querySelector<HTMLTextAreaElement>(MAC_TEXT);
  }
  get #passage() {
    return this.querySelector<HTMLElement>("#mac-passage");
  }
  get #plainCard() {
    return this.querySelector<HTMLElement>("#w-plain");
  }

  #selectedWordIndex: number | null = null;
  #selectedBucketId: 1 | 2 | 3 | null = null;
  #selectedWordEl: HTMLElement | null = null;

  readonly #drawerController = this.addController(
    new DrawerController({
      root: this,
      drawerSelector: "#mac-drawer",
      handleSelector: ".drawer-handle",
      detailsElement: null,
      enabled: () => this.querySelector("#mac-drawer") !== null,
      onEscape: () => {
        this.#drawerController.minimize();
        this.#selectedWordEl?.focus({ preventScroll: true });
      },
    })
  );

  protected override onConnect(): void {
    this.#bindEvents();
    this.#initWorkspaceState();
  }

  protected override onContentSwap(swappedRoot: Element): void {
    if (swappedRoot.getAttribute("data-slot") !== "macronizer-workspace") {
      return;
    }
    this.#selectedWordIndex = null;
    this.#selectedBucketId = null;
    this.#selectedWordEl = null;
    this.#drawerController.dispose();
    this.#drawerController.connect();
    document.title = formatMacronizerPageTitle(this.#passage !== null);
    this.#initWorkspaceState();
  }

  #initWorkspaceState(): void {
    this.#syncCharCounter();
    this.#adoptHashSelection();
  }

  #bindEvents(): void {
    // 1. Live character counter & empty-input submit disable
    this.scope.delegate<HTMLTextAreaElement>(this, "input", MAC_TEXT, () => {
      this.#syncCharCounter();
    });

    // 2. Progressive POST form interception with native submit fallback
    this.scope.delegate<HTMLFormElement>(
      this,
      "submit",
      "#mac-form",
      (e, form) => {
        e.preventDefault();
        void this.#handleMacronizeSubmit(form);
      }
    );

    // 3. Word click in #mac-passage (ambiguous, unknown, and plain words)
    this.scope.delegate<HTMLElement>(
      this,
      "click",
      "#mac-passage a.mac-word",
      (e, wordEl) => {
        // Let modified clicks open a plain word's dictionary link in a new tab.
        if (
          e instanceof MouseEvent &&
          (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)
        ) {
          return;
        }
        e.preventDefault();
        wordEl.focus({ preventScroll: true });
        this.#selectWordElement(wordEl, { restoreDrawer: true });
      }
    );

    // 4. Word focusin in #mac-passage (keyboard Tab navigation)
    this.scope.delegate<HTMLElement>(
      this,
      "focusin",
      "#mac-passage a.mac-ambig, #mac-passage a.mac-unknown",
      (_e, wordEl) => {
        if (this.#selectedWordEl !== wordEl) {
          this.#selectWordElement(wordEl, { restoreDrawer: false });
        }
      }
    );

    // 5. Keep button click on card
    this.scope.delegate<HTMLButtonElement>(
      this,
      "click",
      "button[data-keep]",
      (_e, btn) => {
        btn.focus({ preventScroll: true });
        const n = Number(btn.dataset.keep);
        if (Number.isInteger(n)) {
          this.#keepAndAdvance(n);
        }
      }
    );

    // 6. Radio selection in ambiguous card
    this.scope.delegate<HTMLInputElement>(
      this,
      "change",
      ".mac-opt-radio input[type='radio']",
      (_e, radio) => {
        radio.focus({ preventScroll: true });
        this.#handleRadioChoice(radio);
      }
    );

    // 7. Vowel checkbox toggle in Edit macrons (card or shared plain card)
    this.scope.delegate<HTMLInputElement>(
      this,
      "change",
      ".mac-vowels input[type='checkbox']",
      (_e, checkbox) => {
        checkbox.focus({ preventScroll: true });
        this.#handleVowelToggle(checkbox);
      }
    );

    // 8. Toolbar Next to review button
    this.scope.delegate<HTMLButtonElement>(
      this,
      "click",
      "#mac-next-btn",
      () => {
        this.#advanceToNextWord();
      }
    );

    // 9. Toolbar Copy text button
    this.scope.delegate<HTMLButtonElement>(
      this,
      "click",
      "#mac-copy-btn",
      () => {
        void this.#handleCopyPassage();
      }
    );

    // 10. Mobile bottom-sheet peek bar
    this.scope.delegate<HTMLButtonElement>(
      this,
      "click",
      "#mac-sheet-peek",
      () => {
        this.#drawerController.restore();
      }
    );

    // 11. Keyboard shortcuts (Enter, ArrowDown, Escape)
    this.scope.listen(this, "keydown", (e: Event) => {
      if (e instanceof KeyboardEvent) {
        this.#handleKeydown(e);
      }
    });
  }

  #syncCharCounter(): void {
    const textarea = this.#textarea;
    const counter = this.querySelector<HTMLElement>("#mac-char-counter");
    const submitBtn = this.querySelector<HTMLButtonElement>("#mac-submit-btn");
    if (!textarea) return;
    const len = textarea.value.length;
    if (counter) {
      counter.textContent = `(${len} / ${MACRONIZER_MAX_CHARS})`;
    }
    if (submitBtn) {
      submitBtn.disabled = textarea.value.trim().length === 0;
    }
  }

  async #handleMacronizeSubmit(form: HTMLFormElement): Promise<void> {
    const textarea = this.#textarea;
    const rawText = textarea ? textarea.value : "";
    if (rawText.trim().length === 0) {
      return;
    }
    const action = form.getAttribute("action") || "/macronizer";
    const body = new URLSearchParams({ text: rawText }).toString();

    await swapSlots(this, action, {
      signal: this.scope.latest("macronize"),
      slots: MACRONIZER_SLOTS,
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      // An error page (e.g. 503 when the tagger is down) is swapped in like
      // a result; falling back would POST the same text to the tagger again.
      swapErrorResponses: true,
      // `submit()` skips the submit event, so this handler doesn't catch it.
      fallback: () => HTMLFormElement.prototype.submit.call(form),
    });
  }

  #adoptHashSelection(): void {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    const match = /^#[wt](\d+)$/.exec(hash);
    if (!match) return;
    const n = Number(match[1]);
    const wordEl = this.querySelector<HTMLElement>(
      `#mac-passage a.mac-word[data-w="${escapeId(String(n))}"]`
    );
    if (wordEl) {
      this.#selectWordElement(wordEl, { restoreDrawer: false });
      // Drop the hash so `:target` (the No-JS selection) doesn't keep a second
      // card and word highlighted once another word is selected.
      history.replaceState(
        history.state,
        "",
        window.location.pathname + window.location.search
      );
    }
  }

  #bucketForTier(tierStr: string | undefined): 1 | 2 | 3 | null {
    switch (tierStr) {
      case "1":
        return 1;
      case "2":
      case "3":
      case "4":
        return 2;
      case "5":
        return 3;
      default:
        return null;
    }
  }

  #selectWordElement(
    wordEl: HTMLElement,
    opts: { restoreDrawer: boolean }
  ): void {
    const prevSelected = this.querySelectorAll<HTMLElement>(
      "#mac-passage .mac-word.mac-selected"
    );
    prevSelected.forEach((el) => el.classList.remove("mac-selected"));
    wordEl.classList.add("mac-selected");
    this.#selectedWordEl = wordEl;

    const prevCards = this.querySelectorAll<HTMLElement>(
      "#mac-inspector .mac-card.current"
    );
    prevCards.forEach((c) => c.classList.remove("current"));

    const emptyMsg = this.querySelector<HTMLElement>("#mac-inspector-empty");
    if (emptyMsg) {
      emptyMsg.hidden = true;
    }

    const n = Number(wordEl.dataset.w);
    const shownText = (wordEl.textContent ?? "").trim();

    if (wordEl.classList.contains("mac-plain")) {
      this.#selectedWordIndex = Number.isInteger(n) ? n : null;
      this.#populatePlainCard(wordEl);
      const plainCard = this.#plainCard;
      plainCard?.classList.add("current");
      const orig = wordEl.dataset.orig ?? shownText;
      this.#updateSheetLabel(`${orig} → ${shownText}`);
      this.#loadDictForWord(shownText, true);
    } else if (Number.isInteger(n)) {
      this.#selectedWordIndex = n;
      const bucket = this.#bucketForTier(wordEl.dataset.tier);
      if (bucket !== null) {
        this.#selectedBucketId = bucket;
      }
      const card = this.querySelector<HTMLElement>(`#w${escapeId(String(n))}`);
      if (card) {
        card.classList.add("current");
        const orig = card.dataset.orig ?? shownText;
        this.#updateSheetLabel(`${orig} → ${shownText}`);
      }
      this.#loadDictForWord(shownText, true);
    }

    if (opts.restoreDrawer && this.#drawerController.isMinimized()) {
      this.#drawerController.restore();
    }
  }

  /** Sets the plain card's shown form and its "edited"/"unambiguous" tag. */
  #setPlainShown(shown: string, isEdited: boolean): void {
    const plainCard = this.#plainCard;
    const shownEl = plainCard?.querySelector<HTMLElement>("[data-plain-shown]");
    if (shownEl) shownEl.textContent = shown;
    const tagEl = plainCard?.querySelector<HTMLElement>("[data-plain-tag]");
    if (tagEl) {
      tagEl.textContent = isEdited ? "edited" : "unambiguous";
      tagEl.className = isEdited
        ? "mac-tag mac-tag-chosen"
        : "mac-tag mac-tag-plain";
    }
  }

  #populatePlainCard(wordEl: HTMLElement): void {
    const plainCard = this.#plainCard;
    if (!plainCard) return;

    const shown = (wordEl.textContent ?? "").normalize("NFC");
    // Plain words carry no `data-orig`: their base is the shown form's.
    const orig = splitMacrons(shown).base;
    const isEdited = wordEl.classList.contains("mac-chosen");

    const origEl = plainCard.querySelector<HTMLElement>("[data-plain-orig]");
    if (origEl) origEl.textContent = orig;
    this.#setPlainShown(shown, isEdited);

    const lemmasContainer = plainCard.querySelector<HTMLElement>(
      "[data-plain-lemmas]"
    );
    if (lemmasContainer) {
      swapElementContent(
        lemmasContainer,
        renderPlainLemmas(wordEl.dataset.l ?? "", orig)
      );
    }

    const vowelsContainer = plainCard.querySelector<HTMLElement>(
      "[data-plain-vowels]"
    );
    if (vowelsContainer) {
      const { chars: baseChars, longAt } = splitMacrons(shown);
      const pillsHtml = html`${joinHtml(
        baseChars.map((ch, p) => {
          if (!VOWELS.has(ch)) {
            return html`<span class="mac-char">${ch}</span>`;
          }
          const isLong = longAt.has(p);
          const displayChar = formatVowelChar(ch, isLong);
          const checkedAttr = isLong ? raw(" checked") : raw("");
          return html`<label class="mac-vowel"
            ><input
              type="checkbox"
              value="${p}"
              ${checkedAttr}
              aria-label="Vowel ${ch} at position ${p + 1}" /><span
              >${displayChar}</span
            ></label
          >`;
        })
      )}`;
      swapElementContent(vowelsContainer, pillsHtml);
    }
  }

  #handleRadioChoice(radio: HTMLInputElement): void {
    const card = radio.closest<HTMLElement>(".mac-card[data-w]");
    if (!card) return;
    const n = Number(card.dataset.w);
    if (!Number.isInteger(n)) return;

    const optDiv = radio.closest<HTMLElement>(".mac-opt");
    const formSpan = optDiv?.querySelector<HTMLElement>(".mac-opt-form");
    const chosenForm = (formSpan?.textContent ?? "").normalize("NFC");
    if (!chosenForm) return;

    // Update [data-shown] on option rows
    card.querySelectorAll<HTMLElement>(".mac-opt[data-shown]").forEach((el) => {
      el.removeAttribute("data-shown");
    });
    optDiv?.setAttribute("data-shown", "1");

    // Update word in passage
    const wordEl = this.querySelector<HTMLElement>(`#t${escapeId(String(n))}`);
    if (wordEl) {
      wordEl.textContent = chosenForm;
      wordEl.classList.add("mac-chosen");
      wordEl.setAttribute("data-decision", "chosen");
    }

    // Update card summary & keep button
    this.#updateCardSummary(card, chosenForm, "your choice", "mac-tag-chosen");

    // Sync card's vowel checkboxes to match the newly chosen form
    const { longAt } = splitMacrons(chosenForm);
    this.#syncCardVowelCheckboxes(card, longAt);

    this.#updateStatusCounts();
    this.#loadDictForWord(chosenForm, true);
  }

  #handleVowelToggle(checkbox: HTMLInputElement): void {
    const vowelsGroup = checkbox.closest<HTMLElement>(".mac-vowels");
    if (!vowelsGroup) return;

    // Case 1: Shared plain-word card
    if (vowelsGroup.hasAttribute("data-plain-vowels")) {
      const wordEl = this.#selectedWordEl;
      if (!wordEl || !wordEl.classList.contains("mac-plain")) return;
      const orig = splitMacrons(wordEl.textContent ?? "").base;
      const longAt = this.#readCheckedVowelPositions(vowelsGroup, orig);
      const newForm = buildFromVowels(orig, longAt);
      wordEl.textContent = newForm;
      wordEl.classList.add("mac-chosen");

      this.#setPlainShown(newForm, true);
      this.#updateSheetLabel(`${orig} → ${newForm}`);
      return;
    }

    // Case 2: Ambiguous or unknown word card
    const n = Number(vowelsGroup.dataset.w);
    if (!Number.isInteger(n)) return;
    const card = this.querySelector<HTMLElement>(`#w${escapeId(String(n))}`);
    if (!card) return;
    const orig = wordBase(card.dataset.orig ?? "").base;
    const longAt = this.#readCheckedVowelPositions(vowelsGroup, orig);
    const newForm = buildFromVowels(orig, longAt);

    // Update word in passage
    const wordEl = this.querySelector<HTMLElement>(`#t${escapeId(String(n))}`);
    if (wordEl) {
      wordEl.textContent = newForm;
      wordEl.classList.add("mac-chosen");
      wordEl.setAttribute("data-decision", "edited");
    }

    // Uncheck radios and clear [data-shown]
    card
      .querySelectorAll<HTMLInputElement>(".mac-opt-radio input[type='radio']")
      .forEach((r) => {
        r.checked = false;
      });
    card.querySelectorAll<HTMLElement>(".mac-opt[data-shown]").forEach((el) => {
      el.removeAttribute("data-shown");
    });

    this.#updateCardSummary(card, newForm, "edited", "mac-tag-chosen");
    this.#updateStatusCounts();
  }

  #readCheckedVowelPositions(
    vowelsGroup: HTMLElement,
    origWord: string
  ): Set<number> {
    const { chars: baseChars } = wordBase(origWord);
    const longAt = new Set<number>();
    const inputs = vowelsGroup.querySelectorAll<HTMLInputElement>(
      "input[type='checkbox']"
    );
    inputs.forEach((input) => {
      const p = Number(input.value);
      const baseChar = baseChars[p] ?? "";
      const isLong = input.checked;
      if (isLong && Number.isInteger(p) && p >= 0) {
        longAt.add(p);
      }
      const span = input.parentElement?.querySelector("span");
      if (span && baseChar) {
        span.textContent = formatVowelChar(baseChar, isLong);
      }
    });
    return longAt;
  }

  #syncCardVowelCheckboxes(
    card: HTMLElement,
    longAt: ReadonlySet<number>
  ): void {
    const { chars: baseChars } = wordBase(card.dataset.orig ?? "");
    const inputs = card.querySelectorAll<HTMLInputElement>(
      ".mac-vowels input[type='checkbox']"
    );
    inputs.forEach((input) => {
      const p = Number(input.value);
      const isLong = longAt.has(p);
      input.checked = isLong;
      const baseChar = baseChars[p] ?? "";
      const span = input.parentElement?.querySelector("span");
      if (span && baseChar) {
        span.textContent = formatVowelChar(baseChar, isLong);
      }
    });
  }

  #updateCardSummary(
    card: HTMLElement,
    shownForm: string,
    tagLabel: string,
    tagClass: string
  ): void {
    const shownEl = card.querySelector<HTMLElement>(".mac-card-shown");
    if (shownEl) shownEl.textContent = shownForm;
    const tagEl = card.querySelector<HTMLElement>(".mac-tag");
    if (tagEl) {
      tagEl.textContent = tagLabel;
      tagEl.className = `mac-tag ${tagClass}`;
    }
    const keepFormEl = card.querySelector<HTMLElement>("[data-keep-form]");
    if (keepFormEl) keepFormEl.textContent = shownForm;
    const orig = card.dataset.orig ?? shownForm;
    this.#updateSheetLabel(`${orig} → ${shownForm}`);
  }

  #markWordKept(n: number): void {
    const wordEl = this.querySelector<HTMLElement>(`#t${escapeId(String(n))}`);
    if (!wordEl) return;
    const shownForm = (wordEl.textContent ?? "").normalize("NFC");
    wordEl.classList.add("mac-chosen");
    if (!wordEl.hasAttribute("data-decision")) {
      wordEl.setAttribute("data-decision", "chosen");
    }

    const card = this.querySelector<HTMLElement>(`#w${escapeId(String(n))}`);
    if (card) {
      // Check the currently shown radio if none is checked and not edited
      const shownOpt = card.querySelector<HTMLElement>(".mac-opt[data-shown]");
      const shownRadio = shownOpt?.querySelector<HTMLInputElement>(
        "input[type='radio']"
      );
      if (shownRadio && !shownRadio.checked) {
        shownRadio.checked = true;
      }
      const isEdited = wordEl.getAttribute("data-decision") === "edited";
      this.#updateCardSummary(
        card,
        shownForm,
        isEdited ? "edited" : "your choice",
        "mac-tag-chosen"
      );
    }
    this.#updateStatusCounts();
  }

  #keepAndAdvance(n: number): void {
    this.#markWordKept(n);
    this.#selectedWordIndex = n;
    this.#advanceToNextWord();
  }

  #collectReviewBuckets(): ReviewBucket[] {
    const tier1: HTMLElement[] = [];
    const tier2to4: HTMLElement[] = [];
    const tier5: HTMLElement[] = [];

    const words = this.querySelectorAll<HTMLElement>(
      "#mac-passage a.mac-ambig:not(.mac-chosen), #mac-passage a.mac-unknown:not(.mac-chosen)"
    );
    words.forEach((el) => {
      const b = this.#bucketForTier(el.dataset.tier);
      if (b === 1) tier1.push(el);
      else if (b === 2) tier2to4.push(el);
      else if (b === 3) tier5.push(el);
    });

    return [
      { id: 1, label: "words needing a choice", words: tier1 },
      { id: 2, label: "auto-picked words to check", words: tier2to4 },
      { id: 3, label: "unknown words", words: tier5 },
    ];
  }

  #advanceToNextWord(): void {
    const buckets = this.#collectReviewBuckets();
    const activeBucket = buckets.find((b) => b.words.length > 0);
    if (!activeBucket) {
      showToast("All reviewed");
      return;
    }

    let nextWord: HTMLElement;
    const prevBucketId = this.#selectedBucketId;
    const curIndex = this.#selectedWordIndex;

    if (prevBucketId !== null && activeBucket.id !== prevBucketId) {
      // Moved to a new priority tier: start from the top of the text and toast
      nextWord = activeBucket.words[0];
      showToast(`Now checking ${activeBucket.label}`);
    } else if (curIndex !== null) {
      const after = activeBucket.words.find(
        (el) => Number(el.dataset.w) > curIndex
      );
      nextWord = after ?? activeBucket.words[0];
    } else {
      nextWord = activeBucket.words[0];
    }

    this.#selectedBucketId = activeBucket.id;
    this.#selectWordElement(nextWord, { restoreDrawer: false });
    nextWord.focus({ preventScroll: true });
    this.#scrollWordInTextPane(nextWord);
  }

  #scrollWordInTextPane(wordEl: HTMLElement): void {
    const pane = this.querySelector<HTMLElement>(".mac-left");
    // `.mac-left` only scrolls on wide screens; on narrow ones the page does.
    if (!pane || pane.scrollHeight <= pane.clientHeight) {
      if (typeof wordEl.scrollIntoView === "function") {
        wordEl.scrollIntoView({ block: "center" });
      }
      return;
    }
    const paneRect = pane.getBoundingClientRect();
    const wordRect = wordEl.getBoundingClientRect();
    const relTop = wordRect.top - paneRect.top;
    const margin = 64;
    if (relTop < margin || relTop > paneRect.height - margin) {
      pane.scrollTop += relTop - paneRect.height / 3;
    }
  }

  #updateStatusCounts(): void {
    const buckets = this.#collectReviewBuckets();
    const unresolvedCount = buckets[0].words.length;
    const toCheckCount = buckets[1].words.length;
    const unknownCount = buckets[2].words.length;

    const unresEl = this.querySelector<HTMLElement>('[data-stat="unresolved"]');
    if (unresEl) {
      const b = unresEl.querySelector("b");
      if (b) b.textContent = String(unresolvedCount);
      const tail = unresEl.lastChild;
      if (tail && tail.nodeType === Node.TEXT_NODE) {
        tail.nodeValue =
          unresolvedCount === 1 ? " needs a choice" : " need a choice";
      }
    }

    const checkEl = this.querySelector<HTMLElement>('[data-stat="to-check"]');
    if (checkEl) {
      const b = checkEl.querySelector("b");
      if (b) b.textContent = String(toCheckCount);
    }

    const unkEl = this.querySelector<HTMLElement>('[data-stat="unknown"]');
    if (unkEl) {
      const b = unkEl.querySelector("b");
      if (b) b.textContent = String(unknownCount);
    }
  }

  #updateSheetLabel(text: string): void {
    const label = this.querySelector<HTMLElement>("#mac-sheet-label");
    if (label) {
      label.textContent = text;
    }
  }

  #loadDictForWord(query: string, inflected: boolean): void {
    const trimmed = query.trim();
    if (!trimmed) return;
    const iframe = this.querySelector<HTMLIFrameElement>("#mac-dict-frame");
    if (!iframe) return;
    const targetSrc = buildDictUrl({
      q: trimmed,
      inflected,
      lang: "La",
      embedded: "1",
    });
    if (currentIframeSrc(iframe) !== targetSrc) {
      iframe.src = targetSrc;
    }
  }

  async #handleCopyPassage(): Promise<void> {
    const passage = this.#passage;
    if (!passage) return;
    const text = (passage.textContent ?? "").normalize("NFC");
    const ok = await copyText(text);
    if (ok) {
      showToast("Copied macronized text to clipboard");
    }
  }

  #handleKeydown(e: KeyboardEvent): void {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    if (e.key === "Enter") {
      // Enter is handled ONLY while focus is on an ambiguous/unknown word or a card radio
      if (
        target.matches(
          "#mac-passage a.mac-ambig, #mac-passage a.mac-unknown"
        ) &&
        target.dataset.w !== undefined
      ) {
        e.preventDefault();
        this.#keepAndAdvance(Number(target.dataset.w));
        return;
      }
      if (
        target instanceof HTMLInputElement &&
        target.matches(".mac-opt-radio input[type='radio']")
      ) {
        e.preventDefault();
        if (!target.checked) {
          target.checked = true;
          this.#handleRadioChoice(target);
        }
        const card = target.closest<HTMLElement>(".mac-card[data-w]");
        const n = Number(card?.dataset.w);
        if (Number.isInteger(n)) {
          this.#keepAndAdvance(n);
        }
        return;
      }
      return;
    }

    if (e.key === "ArrowDown") {
      if (
        target.matches("#mac-passage a.mac-ambig") &&
        target.dataset.w !== undefined
      ) {
        const n = Number(target.dataset.w);
        const card = this.querySelector<HTMLElement>(
          `#w${escapeId(String(n))}`
        );
        if (!card) return;
        const radio =
          card.querySelector<HTMLInputElement>(
            ".mac-opt-radio input[type='radio']:checked"
          ) ??
          card.querySelector<HTMLInputElement>(
            ".mac-opt[data-shown] input[type='radio']"
          ) ??
          card.querySelector<HTMLInputElement>(
            ".mac-opt-radio input[type='radio']"
          );
        if (radio) {
          e.preventDefault();
          radio.focus();
        }
      }
      return;
    }

    if (e.key === "Escape") {
      if (target.closest("#mac-inspector") && this.#selectedWordEl) {
        e.preventDefault();
        this.#selectedWordEl.focus({ preventScroll: true });
      }
    }
  }
}

/**
 * The plain-word card's lemma list, from a word's `data-l`
 * (`lemma:morph · morph;lemma2:morph`). Falls back to the word itself.
 */
function renderPlainLemmas(dataL: string, orig: string) {
  const entries = dataL.length > 0 ? dataL.split(";") : [`${orig}:`];
  return html`${joinHtml(
    entries.map((entry) => {
      const colonIdx = entry.indexOf(":");
      const lemma = stripLemmaHomograph(
        colonIdx === -1 ? entry : entry.slice(0, colonIdx)
      );
      const morph = colonIdx === -1 ? "" : entry.slice(colonIdx + 1);
      const href = buildDictUrl({
        q: lemma || orig,
        inflected: false,
        lang: "La",
        embedded: "1",
      });
      // prettier-ignore
      return html`<div class="mac-lemma-group"><a class="mac-lemma-link" href="${href}" target="mac-dict">${lemma || orig}</a><p class="mac-plain-morph">${morph}</p></div>`;
    })
  )}`;
}

registerElement("morcus-macronizer-view", MorcusMacronizerView);
