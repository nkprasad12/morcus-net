import {
  BaseElement,
  registerElement,
  registerRevealer,
  setupModalDialog,
  type ModalDialogHandle,
} from "@/web/ui/core/index.client";
import {
  persistDictKeys,
  persistInflected,
} from "@/web/ui/dict/settings/dict_preferences.client";
import { encodeDictBitmask } from "@/web/ui/dict/settings/dict_bitmask.common";
import {
  DICT_SETTINGS_DIALOG_ID,
  DICT_SETTINGS_TRIGGER_ID,
} from "@/web/ui/dict/search/search_bar.common";
import { OPEN_APPEARANCE_EVENT } from "@/web/ui/shell/appearance_events.common";

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
 * - Highlight strength and text appearance are app-wide and live in the app-bar Appearance menu;
 *   the dialog only links to it.
 */
export class MorcusDictSettings extends BaseElement {
  #committedDicts: Set<string> = new Set();
  #committedInflected: boolean = true;

  #dialogEl: HTMLDialogElement | null = null;
  #formEl: HTMLFormElement | null = null;
  #triggerEl: HTMLElement | null = null;
  #modal: ModalDialogHandle | null = null;

  protected override onConnect() {
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

    // Opens the app-bar Appearance menu. Embedded views (the reader's and
    // macronizer's dictionary) have no app bar, so there is nothing to open.
    const appearanceLink = this.scope.$<HTMLButtonElement>(
      "#dict-appearance-link"
    );
    if (appearanceLink) {
      appearanceLink.hidden =
        this.ownerDocument.querySelector("morcus-appearance-menu") === null;
    }
    this.scope.listen(appearanceLink, "click", (e: MouseEvent) => {
      // Keep this click from reaching the menu's outside-click dismissal,
      // which it registers on the document as it opens.
      e.stopPropagation();
      // Closing applies any draft, as it always does.
      this.#modal?.close();
      this.ownerDocument.dispatchEvent(new CustomEvent(OPEN_APPEARANCE_EVENT));
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
}

registerElement("morcus-dict-settings", MorcusDictSettings);

declare module "@/web/ui/core/dom/js_gate.client" {
  interface MorcusElementTagNameMap {
    "morcus-dict-settings": MorcusDictSettings;
  }
}
