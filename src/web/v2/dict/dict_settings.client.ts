import {
  BaseElement,
  registerElement,
  registerRevealer,
  setPrepaint,
  settingsStore,
  setupModalDialog,
  type ModalDialogHandle,
} from "@/web/v2/core/index.client";
import {
  persistDictKeys,
  persistInflected,
} from "@/web/v2/dict/dict_preferences.client";
import { encodeDictBitmask } from "@/web/v2/dict/dict_bitmask.common";
import {
  DICT_SETTINGS_DIALOG_ID,
  DICT_SETTINGS_TRIGGER_ID,
} from "@/web/v2/dict/search_bar.common";

const DEFAULT_STRENGTH = 50;

/** Detail of `dict-settings-commit`: the committed dictionary content settings. */
export interface DictSettingsCommit {
  dictKeys: string[];
  bitmask: string;
  isInflected: boolean;
}

/**
 * The dictionary settings dialog (`<morcus-dict-settings>`), rendered by `renderDictSearchBar`.
 *
 * Without JS the tray button is a `#dict-settings` link that shows the dialog via `:target`, and
 * **Done** submits the dialog's own form (see `search_bar.server.ts`). Once upgraded:
 *
 * - The button opens the dialog with `showModal()`, so the page behind it is inert.
 * - **Content settings apply when the dialog closes** (Done, Escape, the close button or the
 *   backdrop), not on each tick, so the results don't shift behind the dialog. If anything
 *   changed, closing saves it and emits one `dict-settings-commit`. A scoped dialog (reader
 *   iframe, `lang=`) saves only the dictionaries it shows, and has no inflection to save.
 * - Highlight strength is presentation only, so it stays live.
 */
export class MorcusDictSettings extends BaseElement {
  #strength: number = DEFAULT_STRENGTH;
  #committedDicts: Set<string> = new Set();
  #committedInflected: boolean = true;

  #dialogEl: HTMLDialogElement | null = null;
  #formEl: HTMLFormElement | null = null;
  #triggerEl: HTMLElement | null = null;
  #modal: ModalDialogHandle | null = null;

  // Read in more than one place; a getter re-queries rather than caches.
  get #sliderEl() {
    return this.scope.$<HTMLInputElement>(".settings-slider");
  }

  protected override onConnect() {
    this.#strength = this.#computeInitialStrength();
    this.#dialogEl = this.scope.$<HTMLDialogElement>(
      `#${DICT_SETTINGS_DIALOG_ID}`
    );
    this.#formEl = this.scope.$<HTMLFormElement>("form.dict-settings-form");
    this.#triggerEl = this.ownerDocument.getElementById(
      DICT_SETTINGS_TRIGGER_ID
    );

    this.#adoptRenderedState();
    // Before upgrade the dialog may have been opened via `:target` and edited. If it's still open
    // (the hash names it), those edits are a draft that applies on close, as if made just now.
    // If it was closed again, No-JS semantics apply: closing without Done discards them.
    if (!this.#isHashTarget()) this.#resetControls();
    this.#syncDoneDisabled();
    this.#syncStrengthUi(true);

    if (this.#dialogEl) {
      this.#modal = setupModalDialog(this.#dialogEl, {
        trigger: this.#triggerEl,
        onClose: () => {
          this.#commit();
          this.#triggerEl?.focus();
        },
      });
      this.scope.use(this.#modal);
      // Hash handover: `#dict-settings` opens the dialog (initial load or later navigation), then
      // the component owns the state (`:target` CSS is scoped to un-upgraded hosts).
      this.scope.use(
        registerRevealer(
          this.#dialogEl,
          () => {
            if (!this.#dialogEl?.open) this.#modal?.open();
          },
          { ownsHash: true }
        )
      );
    }

    // Done submits the dialog's form without JS; with JS it just closes, which applies.
    this.scope.listen(this.#formEl, "submit", (e: Event) => {
      e.preventDefault();
      this.#modal?.close();
    });
    this.scope.listen(this.#formEl, "change", () => {
      this.#syncDoneDisabled();
    });

    const sliderEl = this.#sliderEl;
    this.scope.listen(sliderEl, "input", (e: Event) => {
      if (e.target instanceof HTMLInputElement) {
        this.#updateStrength(Number(e.target.value), false);
      }
    });
    this.scope.listen(sliderEl, "change", (e: Event) => {
      if (e.target instanceof HTMLInputElement) {
        this.#updateStrength(Number(e.target.value), true);
      }
    });
  }

  protected override onDisconnect() {
    // Listeners are already gone, so this can't commit: a moved or removed host drops its draft.
    if (this.#dialogEl?.open) {
      this.#dialogEl.removeAttribute("open");
    }
    this.#triggerEl?.setAttribute("aria-expanded", "false");
    this.#resetControls();
  }

  #isHashTarget(): boolean {
    return window.location.hash === `#${DICT_SETTINGS_DIALOG_ID}`;
  }

  #computeInitialStrength(): number {
    const settings = settingsStore.get();
    if (typeof settings.highlightStrength === "number") {
      return Math.max(0, Math.min(100, settings.highlightStrength));
    }
    return DEFAULT_STRENGTH;
  }

  #dictCheckboxes(): HTMLInputElement[] {
    return this.scope.$$<HTMLInputElement>(".dict-checkbox");
  }

  #inflectedCheckbox(): HTMLInputElement | null {
    return this.scope.$<HTMLInputElement>("#toggle-inflected");
  }

  #syncDoneDisabled() {
    const doneBtn = this.scope.$<HTMLButtonElement>(
      "button.dict-settings-done"
    );
    if (!doneBtn) return;
    doneBtn.disabled = !this.#dictCheckboxes().some((cb) => cb.checked);
  }

  /**
   * The server resolves dictionaries and inflection (URL → cookie → default) and renders each
   * control's `checked` attribute from the result, so `defaultChecked` *is* the committed state.
   */
  #adoptRenderedState() {
    this.#committedDicts = new Set(
      this.#dictCheckboxes()
        .filter((cb) => cb.defaultChecked)
        .map((cb) => cb.dataset.key || cb.value)
    );
    // A scoped dialog has no toggle, only the view's inflection as a hidden `o`.
    this.#committedInflected =
      this.#inflectedCheckbox()?.defaultChecked ??
      this.#formEl?.querySelector<HTMLInputElement>(
        'input[type="hidden"][name="o"]'
      )?.value !== "0";
  }

  /** Puts the controls back to the committed state, discarding a draft. */
  #resetControls() {
    for (const cb of this.#dictCheckboxes()) {
      cb.checked = this.#committedDicts.has(cb.dataset.key || cb.value);
    }
    const inflected = this.#inflectedCheckbox();
    if (inflected) inflected.checked = this.#committedInflected;
    this.#syncDoneDisabled();
  }

  /** Applies the draft in the controls, if it differs from what's committed. */
  #commit() {
    const checkboxes = this.#dictCheckboxes();
    const draftDicts = checkboxes
      .filter((cb) => cb.checked)
      .map((cb) => cb.dataset.key || cb.value);
    if (draftDicts.length === 0) {
      this.#resetControls();
      return;
    }
    const inflected = this.#inflectedCheckbox();
    const draftInflected = inflected?.checked ?? this.#committedInflected;

    const dictsChanged =
      draftDicts.length !== this.#committedDicts.size ||
      draftDicts.some((k) => !this.#committedDicts.has(k));
    const inflectedChanged = draftInflected !== this.#committedInflected;
    if (!dictsChanged && !inflectedChanged) return;

    this.#committedDicts = new Set(draftDicts);
    this.#committedInflected = draftInflected;
    for (const cb of checkboxes) {
      cb.defaultChecked = cb.checked;
    }
    if (inflected) inflected.defaultChecked = draftInflected;

    // Only the dictionaries this dialog showed are saved: a scoped one (the reader's) offers just
    // those in its `lang`, and the rest of the preference stays as it is. A scoped dialog has no
    // inflection toggle (the lookup forces it), so inflection is saved only when there is one.
    persistDictKeys(
      draftDicts,
      checkboxes.map((cb) => cb.dataset.key || cb.value)
    );
    if (inflected) {
      persistInflected(draftInflected);
    }
    this.emit<DictSettingsCommit>("dict-settings-commit", {
      dictKeys: draftDicts,
      bitmask: encodeDictBitmask(draftDicts),
      isInflected: draftInflected,
    });
  }

  /** `record`: also record the highlight scale for pre-paint (see applyScale). */
  #syncStrengthUi(record: boolean) {
    const sliderEl = this.#sliderEl;
    if (sliderEl && Number(sliderEl.value) !== this.#strength) {
      sliderEl.value = String(this.#strength);
    }
    const valueDisplayEl = this.scope.$(".settings-value");
    if (valueDisplayEl) {
      valueDisplayEl.textContent = `${this.#strength}%`;
    }
    this.#applyScale(this.#strength, record);
  }

  #updateStrength(newStrength: number, persist: boolean) {
    this.#strength = newStrength;
    this.#syncStrengthUi(persist);
    if (persist) {
      settingsStore.update({ highlightStrength: newStrength });
    }
  }

  /**
   * Applies the highlight scale to <html>. With `record`, it's also recorded
   * for the critical script (on connect and when a change is committed, not
   * on every slider tick).
   */
  #applyScale(strength: number, record: boolean) {
    const scale = String(strength / 50);
    if (record) {
      setPrepaint("--highlight-scale", scale);
    } else {
      document.documentElement.style.setProperty("--highlight-scale", scale);
    }
  }
}

registerElement("morcus-dict-settings", MorcusDictSettings);

declare module "@/web/v2/core/js_gate.client" {
  interface MorcusElementTagNameMap {
    "morcus-dict-settings": MorcusDictSettings;
  }
}
