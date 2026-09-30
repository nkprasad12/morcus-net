import { LifetimeScope } from "@/web/v2/core/base_element.client";
import { bindDismissable } from "@/web/v2/core/dismissable.client";
import { setHtml } from "@/web/v2/core/dom.client";
import { html, joinHtml } from "@/web/v2/core/html.common";
import { ICON_PATHS } from "@/web/v2/core/icons.common";
import { AnchoredPopoverController } from "@/web/v2/core/popover.client";
import { showToast } from "@/web/v2/core/toast.client";

export interface SectionActionOptions {
  /** The clicked `a.section-anchor` element. */
  anchor: HTMLAnchorElement;
  /** Section or sense identifier sent to `/v2/api/report` (e.g. `"1.1"` or `"n20077.1"`). */
  sectionId: string;
  /** Human-readable label shown in the editor header (e.g. `"§ 1.1"` or `"sense I."`). */
  label: string;
  /** Canonical URL sent with the report payload. */
  reportUrl: string;
  /** Callback invoked when "Copy permalink" is selected. */
  onCopy: () => void;
  /** Resolves the DOM nodes belonging to this section/sense to hide and extract text from. */
  getContentNodes: () => ChildNode[];
}

interface ActiveEditorState {
  anchor: HTMLAnchorElement;
  box: HTMLElement;
  busy: boolean;
  isDirty: () => boolean;
  close: (restoreFocus: boolean) => void;
}

let menuEl: HTMLElement | null = null;
let menuTrigger: HTMLAnchorElement | null = null;
let menuCtrl: AnchoredPopoverController | null = null;
let menuScope: LifetimeScope | null = null;
let activeEditor: ActiveEditorState | null = null;

const DIRTY_EDIT_TOAST = "Submit or cancel your current edit first";

const normText = (s: string | null | undefined) =>
  (s ?? "").replace(/\s+/g, " ").trim();

/**
 * Extracts clean plain text from a section or dictionary sense's content nodes,
 * stripping non-editorial UI widgets and preserving line breaks for verse passages.
 */
export function extractSectionCleanText(contentNodes: ChildNode[]): string {
  const clone = document.createElement("div");
  for (const node of contentNodes) clone.appendChild(node.cloneNode(true));
  clone
    .querySelectorAll(".reader-note-ref,.mateo-embed-pane,.forc-action-btn")
    .forEach((el) => el.remove());

  const lines = clone.querySelectorAll(".reader-line");
  return lines.length > 0
    ? Array.from(lines, (l) => normText(l.textContent))
        .filter(Boolean)
        .join("\n")
    : normText(clone.textContent);
}

function closeMenu(): void {
  menuScope?.dispose();
  menuScope = null;
  if (menuCtrl?.isOpen) {
    menuCtrl.close();
  }
  menuEl?.remove();
  menuEl = null;
  menuTrigger = null;
}

/**
 * Closes any active section action menu or in-place editor immediately.
 */
export function closeActiveSectionUI(): void {
  closeMenu();
  activeEditor?.close(false);
}

const renderMenuItem = (action: string, icon: string, label: string) =>
  html`<button
    type="button"
    class="section-action-item"
    role="menuitem"
    data-action="${action}">
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path d="${icon}"></path></svg
    ><span>${label}</span>
  </button>`;

/**
 * Opens the 2-item anchored popover menu ("Copy permalink" / "Suggest correction")
 * for a reader section or dictionary sense anchor.
 */
export function openSectionActionMenu(options: SectionActionOptions): void {
  if (activeEditor) {
    if (
      activeEditor.box.isConnected &&
      (activeEditor.isDirty() || activeEditor.busy)
    ) {
      showToast(DIRTY_EDIT_TOAST);
      return;
    }
    const same = activeEditor.anchor === options.anchor;
    activeEditor.close(false);
    if (same) return;
  }

  if (menuEl) {
    const same = menuEl.isConnected && menuTrigger === options.anchor;
    closeMenu();
    if (same) return;
  }

  const { anchor } = options;
  const doc = anchor.ownerDocument ?? document;

  menuTrigger = anchor;
  menuEl = doc.createElement("div");
  menuEl.className =
    "anchored-popover anchored-popover-centered section-action-menu";
  menuEl.setAttribute("role", "menu");
  menuEl.setAttribute("aria-label", `Actions for ${options.label}`);
  doc.body.appendChild(menuEl);

  setHtml(
    menuEl,
    html`${joinHtml([
      renderMenuItem("copy", ICON_PATHS.link, "Copy permalink"),
      renderMenuItem("edit", ICON_PATHS.edit, "Suggest correction"),
    ])}`
  );

  anchor.setAttribute("aria-haspopup", "menu");

  const items = menuEl.querySelectorAll<HTMLButtonElement>(
    "button[data-action]"
  );
  menuScope = new LifetimeScope(menuEl);

  menuScope.listen(menuEl, "click", (e: MouseEvent) => {
    const btn =
      e.target instanceof Element
        ? e.target.closest<HTMLButtonElement>("button[data-action]")
        : null;
    if (!btn) return;
    // native-takeover(own-subtree): this section menu's action buttons run
    // copy/edit in place of their native action
    e.preventDefault();
    // native-takeover(own-subtree): keep the menu's action click from
    // reaching outside-click handlers on ancestors
    e.stopPropagation();
    const action = btn.dataset.action;
    closeMenu();
    if (action === "copy") options.onCopy();
    else if (action === "edit") startSectionEdit(options);
  });

  menuScope.listen(menuEl, "keydown", (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      // native-takeover(own-subtree): arrow keys move focus between this
      // menu's items instead of scrolling
      e.preventDefault();
      (doc.activeElement === items[0] ? items[1] : items[0])?.focus();
    }
  });

  menuCtrl = new AnchoredPopoverController({
    root: doc,
    group: "reader-chrome",
    align: "center",
    defaultWidth: 188,
    getPanel: () => (menuEl?.isConnected ? menuEl : null),
    getTrigger: () => (menuTrigger?.isConnected ? menuTrigger : null),
    getInitialFocus: () => items[0] ?? null,
    onClose: () => {
      menuScope?.dispose();
      menuScope = null;
      menuEl?.remove();
      menuEl = null;
      menuTrigger = null;
    },
  });
  menuCtrl.open();
}

/**
 * Swaps a section or sense's content nodes in-place with an auto-resizing `<textarea>`
 * and action bar (`Cancel` / `Submit Correction`).
 */
export function startSectionEdit(options: SectionActionOptions): void {
  const contentNodes = options.getContentNodes();
  const originalText = extractSectionCleanText(contentNodes);
  if (contentNodes.length === 0 || !originalText) return;

  const { anchor, label } = options;
  const doc = anchor.ownerDocument ?? document;

  const stash = doc.createElement("span");
  stash.hidden = true;

  const box = doc.createElement("div");
  box.className = "section-edit-box";

  contentNodes[0].before(stash, box);
  stash.append(...contentNodes);

  const heading = `Suggest correction for ${label}`;
  const btnCls = "btn btn-sm ";
  setHtml(
    box,
    html`<div class="section-edit-header">
        <span class="section-edit-label"
          >Suggesting correction for ${label}</span
        >
      </div>
      <textarea
        class="section-edit-input"
        rows="2"
        aria-label="${heading}"></textarea>
      <div class="section-edit-actions">
        <button
          type="button"
          class="${btnCls}btn-secondary section-edit-cancel">
          Cancel</button
        ><button type="button" class="${btnCls}btn-primary section-edit-submit">
          Submit Correction
        </button>
      </div>`
  );

  const textarea = box.querySelector<HTMLTextAreaElement>(
    ".section-edit-input"
  );
  const [cancelBtn, submitBtn] =
    box.querySelectorAll<HTMLButtonElement>("button");
  if (!textarea || !cancelBtn || !submitBtn) return;

  textarea.value = originalText;

  const autoResize = () => {
    textarea.style.height = "auto";
    if (textarea.scrollHeight > 0) {
      textarea.style.height = `${textarea.scrollHeight + 2}px`;
    }
  };
  autoResize();
  textarea.focus();
  textarea.setSelectionRange(originalText.length, originalText.length);

  const scope = new LifetimeScope(box);
  let closed = false;
  const isDirty = () => textarea.value.trim() !== originalText.trim();

  const closeEditor = (restoreFocus: boolean) => {
    if (closed) return;
    closed = true;
    scope.dispose();
    if (activeEditor?.box === box) activeEditor = null;
    if (stash.isConnected) stash.replaceWith(...contentNodes);
    box.remove();
    if (restoreFocus && anchor.isConnected) anchor.focus();
  };

  const editorState: ActiveEditorState = {
    anchor,
    box,
    busy: false,
    isDirty,
    close: closeEditor,
  };
  activeEditor = editorState;

  const setBusy = (b: boolean) => {
    editorState.busy =
      submitBtn.disabled =
      cancelBtn.disabled =
      textarea.readOnly =
        b;
    submitBtn.textContent = b ? "Submitting..." : "Submit Correction";
  };

  const submitEdit = async () => {
    if (editorState.busy) return;
    const edited = textarea.value.trim();
    const original = originalText.trim();

    if (!edited || edited === original) {
      showToast("No changes to submit");
      closeEditor(true);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/v2/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editedText: { original, edited, sectionId: options.sectionId },
          tags: ["userEdit"],
          url: options.reportUrl,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      closeEditor(true);
      showToast("✓ Correction submitted! Thank you.");
    } catch {
      setBusy(false);
      showToast("Failed to submit correction. Please try again.");
    }
  };

  scope.listen(textarea, "input", autoResize);
  scope.listen(box, "keydown", (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      // native-takeover(own-subtree): Ctrl/Cmd+Enter in this editor box
      // submits the correction
      e.preventDefault();
      void submitEdit();
    }
  });
  scope.listen(cancelBtn, "click", (e: MouseEvent) => {
    // native-takeover(own-subtree): this editor's cancel button closes the
    // editor in place of its native action
    e.preventDefault();
    if (!editorState.busy) closeEditor(true);
  });
  scope.listen(submitBtn, "click", (e: MouseEvent) => {
    // native-takeover(own-subtree): this editor's submit button submits the
    // correction via fetch in place of its native action
    e.preventDefault();
    void submitEdit();
  });
  scope.use(
    bindDismissable({
      container: box,
      isOpen: () => box.isConnected,
      ignore: (target) => anchor.contains(target),
      onDismiss: (reason) => {
        if (!box.isConnected) {
          closeEditor(false);
          return;
        }
        if (reason === "escape") {
          if (!editorState.busy) closeEditor(true);
          return;
        }
        if (editorState.isDirty() || editorState.busy) {
          showToast(DIRTY_EDIT_TOAST);
          return;
        }
        closeEditor(false);
      },
      doc,
    })
  );
}
