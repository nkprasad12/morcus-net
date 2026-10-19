import { computeAnchoredPlacement } from "@/web/v2/core/widgets/anchored_position.client";
import { LifetimeScope } from "@/web/v2/core/dom/lifetime_scope.client";
import { bindDismissable } from "@/web/v2/core/widgets/dismissable.client";
import { setHtml } from "@/web/v2/core/dom/dom.client";
import { html, joinHtml } from "@/web/v2/core/dom/html.common";
import { ICON_EDIT, ICON_LINK } from "@/web/v2/core/widgets/icons.common";
import type { PopoverWillOpenDetail } from "@/web/v2/core/widgets/popover.client";
import { showToast } from "@/web/v2/core/widgets/toast.client";

interface SectionActionOptions {
  /** The clicked `a.section-anchor` element. */
  anchor: HTMLAnchorElement;
  /** Section or sense identifier sent to `/api/report` (e.g. `"1.1"` or `"n20077.1"`). */
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
let menuScope: LifetimeScope | null = null;
let activeEditor: ActiveEditorState | null = null;

const DIRTY_EDIT_TOAST = "Submit or cancel your current edit first";
/** Mutual-exclusion group shared with the reader's Settings and TOC popovers. */
const READER_CHROME_GROUP = "reader-chrome";

const normText = (s: string | null | undefined) =>
  (s ?? "").replace(/\s+/g, " ").trim();

/**
 * Extracts clean plain text from a section or dictionary sense's content nodes,
 * stripping non-editorial UI widgets and preserving line breaks for verse passages.
 */
function extractSectionCleanText(contentNodes: ChildNode[]): string {
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
  menuTrigger?.setAttribute("aria-expanded", "false");
  // Removing a showing popover also takes it out of the top layer.
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
 *
 * One menu serves every anchor on the page and lives only while open, so it
 * manages its own while-open scope instead of using the one-to-one
 * `AnchoredPopoverController`. It closes on an outside tap, Escape, Tab, any
 * scroll that moves its anchor, or another `reader-chrome` popover opening.
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
  const win = doc.defaultView ?? window;

  const menu = doc.createElement("div");
  menuEl = menu;
  menuTrigger = anchor;
  menu.className = "anchored-popover section-action-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", `Actions for ${options.label}`);
  // Top layer where supported, so no ancestor's overflow or stacking context
  // can clip it; a plain `position: fixed` panel elsewhere. "manual" because
  // dismissal is ours: native light-dismiss would close it on the pointerdown
  // of a re-click on the anchor, which the click would then reopen.
  menu.setAttribute("popover", "manual");
  doc.body.appendChild(menu);

  setHtml(
    menu,
    html`${joinHtml([
      renderMenuItem("copy", ICON_LINK, "Copy permalink"),
      renderMenuItem("edit", ICON_EDIT, "Suggest correction"),
    ])}`
  );

  anchor.setAttribute("aria-haspopup", "menu");
  anchor.setAttribute("aria-expanded", "true");

  const items = menu.querySelectorAll<HTMLButtonElement>("button[data-action]");
  const scope = new LifetimeScope(menu);
  menuScope = scope;

  scope.listen(menu, "click", (e: MouseEvent) => {
    const btn =
      e.target instanceof Element
        ? e.target.closest<HTMLButtonElement>("button[data-action]")
        : null;
    if (!btn) return;
    // This section menu's action buttons run copy/edit in place of their native
    // action
    e.preventDefault();
    // Keep the menu's action click from reaching outside-click handlers on
    // ancestors
    e.stopPropagation();
    const action = btn.dataset.action;
    closeMenu();
    if (action === "copy") options.onCopy();
    else if (action === "edit") startSectionEdit(options);
  });

  scope.listen(menu, "keydown", (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      // Arrow keys move focus between this menu's items instead of scrolling
      e.preventDefault();
      (doc.activeElement === items[0] ? items[1] : items[0])?.focus();
    } else if (e.key === "Tab") {
      // Tab leaves the menu (ARIA menu pattern). Focusing the anchor first lets
      // the default Tab action continue from it in the page's tab order.
      closeMenu();
      anchor.focus({ preventScroll: true });
    }
  });

  const position = () => {
    const { left, top, caretLeft } = computeAnchoredPlacement(
      anchor.getBoundingClientRect(),
      { width: menu.offsetWidth, height: menu.offsetHeight },
      {
        width: win.innerWidth || doc.documentElement.clientWidth,
        height: win.innerHeight,
      },
      // Bounds: left >= radius + 6 (12px), right >= radius + 8 (14px); anchors are left-side.
      { align: "center", side: "below", gap: 8, margin: 4, caretInset: 13 }
    );
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    menu.style.setProperty("--caret-left", `${Math.round(caretLeft)}px`);
  };

  // Settings / TOC popovers and this menu close each other.
  doc.dispatchEvent(
    new CustomEvent<PopoverWillOpenDetail>("morcus:popover-will-open", {
      detail: { source: menu, group: READER_CHROME_GROUP },
    })
  );
  scope.listen<PopoverWillOpenDetail>(doc, "morcus:popover-will-open", (e) => {
    if (e.detail?.group === READER_CHROME_GROUP && e.detail.source !== menu) {
      closeMenu();
    }
  });

  if (typeof menu.showPopover === "function") menu.showPopover();
  position();
  // Opening must not scroll the page: that would close the menu immediately.
  items[0]?.focus({ preventScroll: true });

  // Close on any scroll that moves the anchor. Capture phase, because scroll
  // events don't bubble: the desktop reader scrolls `.reader-text-panel`, not
  // the window. Comparing the anchor's position ignores unrelated scrollers
  // (e.g. the dictionary outline rail following along).
  const openTop = anchor.getBoundingClientRect().top;
  scope.listen(
    doc,
    "scroll",
    () => {
      if (Math.abs(anchor.getBoundingClientRect().top - openTop) >= 1) {
        closeMenu();
      }
    },
    { capture: true, passive: true }
  );
  // Resizes (rotation, mobile address bar) keep the menu attached instead.
  scope.listen(win, "resize", position);
  scope.use(
    bindDismissable({
      container: menu,
      triggerEl: anchor,
      isOpen: () => menuEl === menu,
      // A tap on the anchor itself toggles via the anchor's click handler.
      ignore: (target) => anchor.contains(target),
      onDismiss: closeMenu,
      listenPointerDown: true,
      doc,
    })
  );
}

/**
 * Nudges window scroll minimally when `.section-edit-box` extends below the
 * viewport bottom or any visible fixed bottom drawer's minimized peek bar.
 */
function nudgeEditorAboveDrawers(
  box: HTMLElement,
  doc: Document,
  win: Window
): void {
  let bottom = win.innerHeight;
  for (const d of doc.querySelectorAll<HTMLElement>(".drawer:not([hidden])")) {
    const s = win.getComputedStyle(d);
    const r = d.getBoundingClientRect();
    if (
      !d.contains(box) &&
      s.display !== "none" &&
      s.visibility !== "hidden" &&
      (!s.position || s.position === "fixed") &&
      r.height > 0 &&
      r.top > 0 &&
      r.top < bottom
    ) {
      bottom = r.top;
    }
  }
  const top = box.getBoundingClientRect().bottom - bottom;
  if (bottom > 0 && top > 0) win.scrollBy?.({ top, behavior: "instant" });
}

/**
 * Swaps a section or sense's content nodes in-place with an auto-resizing `<textarea>`
 * and action bar (`Cancel` / `Submit Correction`).
 */
function startSectionEdit(options: SectionActionOptions): void {
  const contentNodes = options.getContentNodes();
  const originalText = extractSectionCleanText(contentNodes);
  if (contentNodes.length === 0 || !originalText) return;

  const { anchor, label } = options;
  const doc = anchor.ownerDocument ?? document;
  const win = doc.defaultView ?? window;

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
  box.dispatchEvent(
    new CustomEvent("morcus:section-edit-open", { bubbles: true })
  );
  nudgeEditorAboveDrawers(box, doc, win);

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
      const res = await fetch("/api/report", {
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
      // Ctrl/Cmd+Enter in this editor box submits the correction
      e.preventDefault();
      void submitEdit();
    }
  });
  scope.listen(cancelBtn, "click", (e: MouseEvent) => {
    // This editor's cancel button closes the editor in place of its native
    // action
    e.preventDefault();
    if (!editorState.busy) closeEditor(true);
  });
  scope.listen(submitBtn, "click", (e: MouseEvent) => {
    // This editor's submit button submits the correction via fetch in place of
    // its native action
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
          // bindDismissable only reports Escape with focus in box/anchor or
          // on <body>. From <body> (e.g. after clicking whitespace), treat a
          // dirty edit like an outside click: keep it and warn.
          const active = doc.activeElement;
          const focusInEditor =
            active !== null &&
            (box.contains(active) || anchor.contains(active));
          if (!focusInEditor && editorState.isDirty()) {
            showToast(DIRTY_EDIT_TOAST);
            return;
          }
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
