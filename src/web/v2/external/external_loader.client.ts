/**
 * `<morcus-external-loader>`: the JS layer of the External Content Reader.
 *
 * The server renders every page, so this only adds what needs the browser:
 * - `landing`: the "Paste Text" / "Import from Web Page" tabs. Pasted text is
 *   saved to IndexedDB and opened at `?local=`; web pages submit the form
 *   natively. Also the "Saved on this device" list.
 * - `local`: reads a saved text from IndexedDB and hands the rendered passage
 *   to `<morcus-reader-view>` via `adoptPassage`. The markup comes from the
 *   same `external_text.common.ts` renderer the server uses.
 * - `url`: adds a server-rendered import to the saved list, like V1.
 *
 * Pasted text never leaves the device.
 */

import {
  BaseElement,
  html,
  joinHtml,
  registerElement,
  setHtml,
  type SafeHtml,
} from "@/web/v2/core/index.client";
import { MorcusReaderView } from "@/web/v2/reader/reader_view.client";
import {
  ExternalContentStore,
  type ExternalContentSummary,
} from "@/web/v2/external/external_storage.client";
import {
  parseExternalText,
  parseLineMode,
  renderExternalPassageHtml,
  resolveExternalTitle,
} from "@/web/v2/external/external_text.common";
import {
  EXTERNAL_READER_PATH,
  buildExternalReaderUrl,
} from "@/web/v2/external/external_url.common";

const STORAGE_UNAVAILABLE =
  "This browser can't save texts right now (storage may be off or full).";

/** Where a saved entry opens: URL imports re-render on the server. */
export function savedItemHref(item: ExternalContentSummary): string {
  return item.source === "fromUrl"
    ? buildExternalReaderUrl({ url: item.storageKey, lines: item.lineMode })
    : buildExternalReaderUrl({ local: item.storageKey, lines: item.lineMode });
}

function savedItemLabel(item: ExternalContentSummary): string {
  // V1 titles URL imports with the URL itself (it is also their key).
  return item.source === "fromUrl"
    ? item.title.replace(/^https?:\/\//, "")
    : item.title;
}

function renderSavedItem(item: ExternalContentSummary): SafeHtml {
  const label = savedItemLabel(item);
  // Kept compact: minification preserves whitespace inside templates.
  return html`<li class="external-saved-item">
    <a class="external-saved-link" href="${savedItemHref(item)}">${label}</a
    ><button
      type="button"
      class="btn btn-sm btn-secondary external-saved-delete"
      data-key="${item.storageKey}"
      data-label="${label}"
      aria-label="Delete ${label}">
      Delete
    </button>
  </li>`;
}

function textWithBreaks(node: Node): string {
  let out = "";
  for (const child of node.childNodes) {
    if (child.nodeName === "BR") out += "\n";
    else if (child.nodeType === Node.TEXT_NODE) out += child.nodeValue ?? "";
    else out += textWithBreaks(child);
  }
  return out;
}

/**
 * Rebuilds plain text from rendered sections, so a URL import can be saved in
 * the V1-compatible shape (which stores text, not markup).
 */
export function passageText(passage: Element): string {
  let out = "";
  for (const body of passage.querySelectorAll(
    ".reader-section > .reader-passage"
  )) {
    const isVerse =
      body.parentElement?.classList.contains("section-verse") === true;
    const newStanza = body.querySelector(".line-space") !== null;
    if (out !== "") out += isVerse && !newStanza ? "\n" : "\n\n";
    out += textWithBreaks(body).trim();
  }
  return out;
}

export class MorcusExternalLoader extends BaseElement {
  /** The saved-texts store. Replaceable in tests. */
  public store = new ExternalContentStore();
  /** Page navigation. Replaceable in tests, where jsdom can't navigate. */
  public navigate: (url: string) => void = (url) => {
    window.location.assign(url);
  };
  /** Delete confirmation. Replaceable in tests. */
  public confirmDelete: (label: string) => boolean = (label) =>
    window.confirm(`Delete “${label}” from this browser?`);

  /** Settles when the work started on connect is done (for tests). */
  public ready: Promise<void> = Promise.resolve();

  protected override onConnect() {
    switch (this.dataset.page) {
      case "landing":
        this.ready = this.initLanding();
        break;
      case "local":
        this.ready = this.loadLocal();
        break;
      case "url":
        this.ready = this.rememberUrlImport();
        break;
    }
  }

  protected override onDisconnect() {
    void this.store.close();
  }

  // ----- Landing ------------------------------------------------------------

  private initLanding(): Promise<void> {
    const form = this.scope.$<HTMLFormElement>("#external-form");
    if (form) {
      this.syncSource();
      for (const radio of this.querySelectorAll<HTMLInputElement>(
        'input[name="external-source"]'
      )) {
        this.scope.listen(radio, "change", () => this.syncSource());
      }
      this.scope.listen(form, "submit", (e) => {
        // Web pages submit natively (GET); pasted text stays on the device.
        if (!this.pasteSelected()) return;
        e.preventDefault();
        void this.savePaste(form);
      });
    }

    this.scope.delegate<HTMLButtonElement>(
      this,
      "click",
      ".external-saved-delete",
      (_e, button) => {
        void this.deleteSaved(button);
      }
    );

    return this.renderSavedList();
  }

  private pasteSelected(): boolean {
    return (
      this.scope.$<HTMLInputElement>("#external-source-paste")?.checked === true
    );
  }

  /** Disables the hidden tab's fields, so its `required` can't block "Read". */
  private syncSource(): void {
    const paste = this.pasteSelected();
    for (const field of this.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement
    >(".external-for-paste .external-input")) {
      field.disabled = !paste;
    }
    const url = this.scope.$<HTMLInputElement>("#external-url");
    if (url) url.disabled = paste;
    this.showPasteError("");
  }

  private showPasteError(message: string): void {
    const error = this.scope.$("#external-paste-error");
    if (!error) return;
    error.textContent = message;
    error.hidden = message === "";
  }

  private async savePaste(form: HTMLFormElement): Promise<void> {
    // Read the raw value: trimming would eat the first line's indent in verse.
    const text = this.scope.$<HTMLTextAreaElement>("#external-text")?.value;
    const title = this.scope.$<HTMLInputElement>("#external-title")?.value;
    if (text === undefined || text.trim() === "") {
      this.showPasteError("Paste some text to read.");
      return;
    }
    const lines = new FormData(form).get("lines");
    const lineMode = parseLineMode(
      typeof lines === "string" ? lines : undefined
    );
    let key: string;
    try {
      key = await this.store.save({
        title: resolveExternalTitle(title?.trim() ?? "", text),
        content: text,
        lineMode,
      });
    } catch {
      this.showPasteError(STORAGE_UNAVAILABLE);
      return;
    }
    this.navigate(buildExternalReaderUrl({ local: key, lines: lineMode }));
  }

  private async renderSavedList(): Promise<void> {
    const list = this.scope.$("#external-saved-list");
    const empty = this.scope.$("#external-saved-empty");
    if (!list) return;
    let items: ExternalContentSummary[];
    try {
      items = await this.store.list();
    } catch {
      if (empty) empty.textContent = STORAGE_UNAVAILABLE;
      return;
    }
    setHtml(list, html`${joinHtml(items.map(renderSavedItem))}`);
    if (empty) empty.hidden = items.length > 0;
  }

  private async deleteSaved(button: HTMLButtonElement): Promise<void> {
    const key = button.dataset.key;
    if (key === undefined || !this.confirmDelete(button.dataset.label ?? key)) {
      return;
    }
    try {
      await this.store.delete(key);
    } catch {
      return;
    }
    button.closest("li")?.remove();
    const empty = this.scope.$("#external-saved-empty");
    const list = this.scope.$("#external-saved-list");
    if (empty && list) empty.hidden = list.children.length > 0;
  }

  // ----- `?local=` ----------------------------------------------------------

  private async loadLocal(): Promise<void> {
    const view = this.closest("morcus-reader-view");
    if (!(view instanceof MorcusReaderView)) return;
    const key = this.dataset.localKey ?? "";
    const lines = parseLineMode(this.dataset.lines);

    const record = await this.store.get(key).catch(() => undefined);
    if (record === undefined) {
      view.adoptPassage(
        html`<p class="external-notice">
          This text isn't saved in this browser. It may have been deleted, or
          saved in another browser.
          <a href="${EXTERNAL_READER_PATH}">Read another text</a>
        </p>`
      );
      return;
    }

    for (const el of view.querySelectorAll(
      ".reader-passage-heading, .sticky-work-title"
    )) {
      el.textContent = record.title;
    }
    view
      .querySelector(".sticky-title-wrapper")
      ?.setAttribute("title", record.title);

    const doc = parseExternalText(record.content, lines);
    const parts: SafeHtml[] = [];
    if (doc.truncated) {
      parts.push(
        html`<p class="external-notice" role="note">
          This text is long, so only the first part is shown.
        </p>`
      );
    }
    parts.push(renderExternalPassageHtml(doc));
    view.adoptPassage(html`${joinHtml(parts)}`);

    // Reopen from the saved list in the mode last read.
    if (lines !== record.lineMode) {
      await this.store.setLineMode(key, lines).catch(() => undefined);
    }
  }

  // ----- `?url=` ------------------------------------------------------------

  private async rememberUrlImport(): Promise<void> {
    const url = this.dataset.url;
    const passage = document.getElementById("reader-passage");
    if (!url || !passage) return;
    const content = passageText(passage);
    if (content === "") return;
    // Best effort: failing to save must not disturb reading.
    await this.store
      .save({
        title: url,
        content,
        source: "fromUrl",
        lineMode: parseLineMode(this.dataset.lines),
      })
      .catch(() => undefined);
  }
}

registerElement("morcus-external-loader", MorcusExternalLoader);

declare global {
  interface HTMLElementTagNameMap {
    "morcus-external-loader": MorcusExternalLoader;
  }
}
