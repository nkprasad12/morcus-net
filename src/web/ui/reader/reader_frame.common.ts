/**
 * Browser-safe markup for the parts of the reader frame around the passage:
 * the sticky bar (its pager arrows, layout, and `Aa` settings button
 * `#reader-settings-btn`), the passage heading with its copy-permalink link
 * (`a.reader-heading-link`), the dictionary companion panel (the desktop
 * splitter, the panel or mobile bottom sheet with its Dictionary / Notes /
 * Translation / About tabs, and the drawer button), and the reader settings
 * dialog (`#reader-settings-popover`).
 *
 * Shared by the server-rendered readers (`reader.server.ts`,
 * `reader_dialogs.server.ts`, and through them `external/external.server.ts`)
 * and the client-rendered Experimental Texts reader
 * (`experimental_texts/experimental_text_view_adapter.client.ts`), so
 * `<morcus-reader-view>`, `<morcus-reader-settings>`, and
 * `ReaderPanelController` enhance all of them the same way.
 *
 * Like `reader_toc.common.ts`, this reaches the client bundle, so it must not
 * import `he`, `renderIconSvg` / `ICON_PATHS`, or any `.server.ts` module.
 * Escaping uses `escapeTocText` (byte-identical to `he.escape`), and the icons
 * are drawn exactly as `renderIconSvg` draws them from paths copied out of
 * `ICON_PATHS` (`reader_frame.test.ts` pins both), so only the readers'
 * chunks carry them.
 */

import { html, raw, type SafeHtml } from "@/web/ui/core/dom/html.common";
import { slotAttr } from "@/web/ui/core/nav/slots.common";
import { ICON_CLOSE, ICON_LINK } from "@/web/ui/core/widgets/icons.common";
import { DEFAULT_PANEL_SCALE } from "@/web/ui/reader/reader_scale.common";
import { escapeTocText } from "@/web/ui/reader/reader_toc.common";

/** `ICON_PATHS.palette` (Material "palette"). */
const PALETTE_PATH =
  "M12 3a9 9 0 0 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z";
/** `ICON_PATHS.check`. */
const CHECK_PATH = "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z";

// Drawn exactly as `renderIconSvg("close", ...)` / `renderIconSvg("palette")`
// and `renderCopyPillIconsHtml()`.
// prettier-ignore
const SETTINGS_CLOSE_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" class="dialog-close-icon" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON_CLOSE}"></path></svg>`;
const PALETTE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${PALETTE_PATH}"></path></svg>`;
// prettier-ignore
const COPY_PILL_ICONS = `<span class="copy-pill-icon" aria-hidden="true"><svg viewBox="0 0 24 24" class="copy-pill-glyph copy-pill-link" aria-hidden="true"><path d="${ICON_LINK}"></path></svg><svg viewBox="0 0 24 24" class="copy-pill-glyph copy-pill-check" aria-hidden="true"><path d="${CHECK_PATH}"></path></svg></span>`;

/** Copies of the `ICON_PATHS` entries the frame draws. */
export const READER_FRAME_ICON_PATHS = {
  close: ICON_CLOSE,
  chevronUp: "M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z",
  book: "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",
  notes:
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8",
  info: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 16v-4 M12 8h.01",
  translation:
    "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 0a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z M2 12h20",
  drawer:
    "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M3 14h18 M10 17.5h4",
  strokeChevronLeft: "M15 6l-6 6 6 6",
  strokeChevronRight: "M9 6l6 6-6 6",
} as const;

export type ReaderFrameIcon = keyof typeof READER_FRAME_ICON_PATHS;

/** The frame's filled icons; every other one is an outline (stroked). */
const FILLED_ICONS: ReadonlySet<ReaderFrameIcon> = new Set(["chevronUp"]);

export interface ReaderFrameIconOptions {
  readonly className?: string;
  /** Width and height. */
  readonly size?: number;
  /** Outline icons only; defaults to 2. */
  readonly strokeWidth?: number;
}

/**
 * Draws one of the frame's icons exactly as `renderIconSvg(name, { width:
 * size, height: size, className, strokeWidth })` does.
 */
export function renderReaderFrameIconSvg(
  name: ReaderFrameIcon,
  options: ReaderFrameIconOptions = {}
): string {
  const size = options.size ? ` width="${options.size}"` : "";
  const height = options.size ? ` height="${options.size}"` : "";
  const cls = options.className ? ` class="${options.className}"` : "";
  const stroke = FILLED_ICONS.has(name)
    ? ""
    : ` fill="none" stroke="currentColor" stroke-width="${
        options.strokeWidth ?? 2
      }" stroke-linecap="round" stroke-linejoin="round"`;
  return `<svg viewBox="0 0 24 24"${size}${height}${cls} aria-hidden="true"${stroke}><path d="${READER_FRAME_ICON_PATHS[name]}"></path></svg>`;
}

/** Escaped text, for interpolation into an `html` template. */
function text(value: string) {
  return raw(escapeTocText(value));
}

// ---------------------------------------------------------------------------
// Sticky bar
// ---------------------------------------------------------------------------

/** One of the sticky bar's previous / next page arrows. */
export interface ReaderPagerArrowOptions {
  readonly dir: "prev" | "next";
  /** The target page; the current page's URL when `disabled`. */
  readonly href: string;
  /** No page that way: drawn dimmed and taken out of the tab order. */
  readonly disabled: boolean;
  readonly ariaLabel: string;
  readonly title: string;
  /** The target's label beside the arrow; omitted for a glyph-only arrow. */
  readonly label?: string;
  /** The server's `pager-prev` / `pager-next`. */
  readonly id?: string;
  /**
   * Trusted extra attributes: the server's page-turn slot, or the client
   * reader's `data-role`.
   */
  readonly attrs: string;
}

/** A sticky-bar pager arrow (`a.reader-nav-arrow`). */
export function renderReaderPagerArrowHtml(
  options: ReaderPagerArrowOptions
): SafeHtml {
  const isPrev = options.dir === "prev";
  // The trailing space when enabled keeps the server's markup as it was.
  const cls = options.disabled
    ? "reader-btn reader-nav-arrow disabled"
    : "reader-btn reader-nav-arrow ";
  const id = options.id ? `id="${escapeTocText(options.id)}"` : "";
  const disabledAttrs = options.disabled
    ? 'aria-disabled="true" tabindex="-1"'
    : "";
  const arrow = isPrev
    ? '<span class="pager-arrow" aria-hidden="true">&larr;</span>'
    : '<span class="pager-arrow" aria-hidden="true">&rarr;</span>';
  const chevron = renderReaderFrameIconSvg(
    isPrev ? "strokeChevronLeft" : "strokeChevronRight",
    { className: "pager-chevron", size: 16, strokeWidth: 2.5 }
  );
  const label =
    options.label === undefined
      ? ""
      : `<span class="pager-label">${escapeTocText(options.label)}</span>`;
  // The label sits on the arrow's outer side: after `←`, before `→`.
  const inner = isPrev
    ? `${arrow}\n${chevron}${label ? `\n${label}` : ""}`
    : `${label ? `${label}\n` : ""}${arrow}\n${chevron}`;
  // prettier-ignore
  return html`<a href="${text(options.href)}"
             class="${raw(cls)}"
             ${raw(id)}
             ${raw(disabledAttrs)}
             aria-label="${text(options.ariaLabel)}"
             title="${text(options.title)}"
             ${raw(options.attrs)}>
            ${raw(inner)}
          </a>`;
}

/**
 * The `Aa` trigger for the reader settings dialog. `MorcusReaderSettings` finds it
 * by id, so every reader bar must render this exact button.
 */
export function renderReaderSettingsButtonHtml(): SafeHtml {
  // Not prettier-formatted: the server's markup has to stay as it was. Only
  // the indentation is free, as `html` turns each line break and the
  // whitespace around it into one `\n`.
  // prettier-ignore
  return html`<button type="button"
      class="reader-btn reader-settings-btn"
      id="reader-settings-btn"
      data-js-only
      aria-haspopup="dialog"
      aria-expanded="false"
      aria-controls="reader-settings-popover"
      aria-label="Appearance &amp; Typography"
      title="Appearance &amp; Typography">
    <span class="settings-glyph" aria-hidden="true">Aa</span>
  </button>`;
}

/** The pieces of {@link renderReaderStickyBarHtml}. */
export interface ReaderStickyBarOptions {
  /** {@link renderReaderPagerArrowHtml} for the previous page. */
  readonly prevHtml: SafeHtml;
  /** The bar's centre: usually the contents button (`renderTocTriggerHtml`). */
  readonly centerHtml: SafeHtml;
  /** {@link renderReaderPagerArrowHtml} for the next page. */
  readonly nextHtml: SafeHtml;
  /** An `id` for the centre's wrapper (the server's `reader-jump-form`). */
  readonly centerId?: string;
}

/**
 * The reader's sticky quick-navigation bar: previous page, the centre (title
 * and contents), next page and the `Aa` settings button.
 */
export function renderReaderStickyBarHtml(
  options: ReaderStickyBarOptions
): SafeHtml {
  const centerId = options.centerId
    ? ` id="${escapeTocText(options.centerId)}"`
    : "";
  // prettier-ignore
  return html`<header class="reader-sticky-bar" role="toolbar" aria-label="Reader Quick Navigation">
        <div class="sticky-primary-row">
${raw(options.prevHtml)}
          <div class="reader-sticky-form"${raw(centerId)}>
            <div class="sticky-center-group">
              ${raw(options.centerHtml)}
            </div>
          </div>
          <div class="sticky-primary-right">
${raw(options.nextHtml)}
            <span class="running-right-sep" aria-hidden="true">&middot;</span>
${raw(renderReaderSettingsButtonHtml())}
          </div>
        </div>
      </header>`;
}

// ---------------------------------------------------------------------------
// Passage heading & settings dialog
// ---------------------------------------------------------------------------

/**
 * Renders the passage `<h1>` heading. When `href` is supplied (library works,
 * URL-backed external texts), the heading text is wrapped in a
 * permalink anchor (`a.reader-heading-link`) that copies the page link on
 * click (`<morcus-reader-view>`).
 */
export function renderReaderHeadingHtml(
  title: string,
  href?: string
): SafeHtml {
  const escapedTitle = escapeTocText(title);
  if (!href) {
    // prettier-ignore
    return html`<h1 class="reader-passage-heading" aria-live="polite">${raw(escapedTitle)}</h1>`;
  }
  // One line, as the server has always rendered it.
  // prettier-ignore
  return html`<h1 class="reader-passage-heading" aria-live="polite"><a href="${raw(escapeTocText(href))}" class="reader-heading-link" title="Copy link to this page" aria-label="${raw(escapedTitle)} (copy link to this page)">${raw(escapedTitle)}${raw(COPY_PILL_ICONS)}</a></h1>`;
}

export interface ReaderSettingsPopoverOptions {
  /** Shows the macra toggle; false for editions without macra. */
  hasMacra?: boolean;
}

/**
 * Renders the reader display settings: a modal `<dialog>` (JS-only, like its
 * trigger) anchored under the trigger by <morcus-reader-settings>.
 * When hasMacra is false (e.g. for unmacronized editions), the macra toggle is omitted from the DOM.
 *
 * It must sit inside `<morcus-reader-view>`, which listens for the dialog's
 * `reader-settings-change` events and finds it for the `A` shortcut.
 */
export function renderReaderSettingsPopoverHtml(
  options: ReaderSettingsPopoverOptions = {}
): SafeHtml {
  const hasMacra = options.hasMacra ?? true;
  // prettier-ignore
  const macraToggle = hasMacra
    ? html`<label class="settings-toggle-row">
        <span class="settings-label">Show Macra (vowel length markings: &amacr;, &emacr;, &imacr;, &omacr;, &umacr;)</span>
        <input type="checkbox" id="toggle-macra" class="toggle-checkbox" checked>
      </label>`
    : "";
  // App-wide text appearance lives in the app-bar Appearance menu, so this
  // only links to it. The Side Panel size is reader-only: it applies to every
  // tab, relative to the global text size. Touch Navigation (swipe page turns)
  // is hidden without a touchscreen by reader_page_nav.css.
  // prettier-ignore
  return html`<morcus-reader-settings>
  <dialog class="anchored-popover reader-settings-popover"
      id="reader-settings-popover"
      aria-label="Reader settings">
    <div class="settings-popover-header">
      <h2 class="settings-popover-title">Reader settings</h2>
      <button type="button"
          class="settings-popover-close"
          id="reader-settings-close-btn"
          data-dialog-close
          aria-label="Close reader settings">${raw(SETTINGS_CLOSE_ICON)}</button>
    </div>

    <div class="settings-body">

      <button type="button" class="appearance-link" id="reader-appearance-link">
        <span>Text appearance<span class="appearance-link-hint">Font, size, spacing, contrast, theme</span></span>
        ${raw(PALETTE_ICON)}
      </button>

      <div class="settings-group">
        <h3 class="settings-group-title">Side Panel</h3>
        <div class="settings-row">
          <span class="settings-label">Text Size<span class="settings-hint">Relative to your text size</span></span>
          <div class="stepper">
            <button type="button" class="stepper-btn" id="dict-size-dec" aria-label="Decrease side panel text size">A&minus;</button>
            <span class="stepper-val" id="dict-size-label">${DEFAULT_PANEL_SCALE}%</span>
            <button type="button" class="stepper-btn" id="dict-size-inc" aria-label="Increase side panel text size">A+</button>
          </div>
        </div>
      </div>

      <div class="settings-group">
        <h3 class="settings-group-title">Textual Aids</h3>
        ${raw(macraToggle)}

        <label class="settings-toggle-row">
          <span class="settings-label">Show Section Numbers (&sect;)</span>
          <input type="checkbox" id="toggle-gutter" class="toggle-checkbox" checked>
        </label>
      </div>

      <div class="settings-group settings-touch-nav">
        <h3 class="settings-group-title">Touch Navigation</h3>
        <label class="settings-toggle-row">
          <span class="settings-label">Swipe to turn pages</span>
          <input type="checkbox" id="toggle-swipe-nav" class="toggle-checkbox" checked>
        </label>
      </div>

    </div>

    <div class="settings-popover-footer">
      <button type="button" class="btn btn-secondary settings-reset-btn" id="reader-settings-reset-btn">Reset Defaults</button>
    </div>
  </dialog>
</morcus-reader-settings>`;
}

// ---------------------------------------------------------------------------
// Companion panel
// ---------------------------------------------------------------------------

/** The tabs that sit beside the dictionary in the companion panel. */
export interface ReaderCompanionOptions {
  /** The page's notes (trusted markup), or "" for none. */
  readonly notesHtml: SafeHtml;
  /** The work's About section (trusted markup), or "" for none. */
  readonly aboutHtml: SafeHtml;
  /** Adds the Translation tab. It is JS-only: the view is fetched on demand. */
  readonly hasTranslation: boolean;
}

/** Inputs for {@link renderReaderCompanionPanelHtml}; none is work-specific. */
export interface ReaderCompanionPanelOptions {
  /** The active lookup, or "" when the drawer starts minimized. */
  readonly query: string;
  readonly dictIframeSrc: string;
  /**
   * The No-JS close link target while a lookup is open: the current page,
   * to which `#reader-dict-dismissed` is appended. Omitted by the client
   * reader, which always has JS: its close link is the in-page target.
   */
  readonly closeHref?: string;
  /** Omitted for surfaces with only the dictionary (the tab bar is hidden). */
  readonly companion?: ReaderCompanionOptions;
}

type CompanionTab = "dict" | "notes" | "translation" | "about";

const COMPANION_TABS: readonly {
  id: CompanionTab;
  label: string;
  icon: "book" | "notes" | "translation" | "info";
}[] = [
  { id: "dict", label: "Dictionary", icon: "book" },
  { id: "notes", label: "Notes", icon: "notes" },
  { id: "translation", label: "Translation", icon: "translation" },
  { id: "about", label: "About", icon: "info" },
];

/**
 * One companion tab. It is a plain link to its view, so without JS the view
 * opens via `:target` (reader_panel.css). `ReaderPanelController` adds the
 * tab roles and takes over on upgrade.
 */
function renderCompanionTab(
  tab: (typeof COMPANION_TABS)[number],
  shown: boolean
): string {
  const translation = tab.id === "translation";
  const tabClass = translation
    ? "reader-panel-tab tab-translation"
    : "reader-panel-tab";
  const extra = `${shown ? "" : " hidden"}${
    translation ? " data-js-only" : ""
  }`;
  const icon = renderReaderFrameIconSvg(tab.icon, { size: 14 });
  // prettier-ignore
  return html`<a href="#panel-view-${raw(tab.id)}"
                 class="${raw(tabClass)}"
                 id="panel-tab-${raw(tab.id)}"
                 aria-label="${tab.label}"${raw(extra)}>
                <span class="reader-tab-icon" aria-hidden="true">${raw(icon)}</span>
                <span class="reader-tab-label">${tab.label}</span>
              </a>`;
}

/**
 * The page's notes, as the `notes` page-turn slot. The slot is a wrapper
 * inside `#panel-view-notes` so the view itself (active state, scroll
 * position) survives page turns.
 */
export function renderReaderNotesSlotHtml(notesHtml: SafeHtml): SafeHtml {
  // prettier-ignore
  return html`<div class="reader-notes-slot" ${raw(slotAttr("notes"))}>${raw(notesHtml)}</div>`;
}

/**
 * The desktop splitter plus the dictionary panel (the bottom sheet on
 * mobile) and the drawer button, for any page that hosts the reader frame.
 *
 * `.reader-sheet-bar` is the mobile sheet handle and teaser bar. In
 * `.reader-panel-views` (the companion views), without JS the targeted view
 * shows (else the dictionary); `ReaderPanelController` takes over on upgrade.
 */
export function renderReaderCompanionPanelHtml(
  options: ReaderCompanionPanelOptions
): SafeHtml {
  const { query, dictIframeSrc, closeHref } = options;
  const notesHtml = options.companion?.notesHtml ?? html``;
  const aboutHtml = options.companion?.aboutHtml ?? html``;
  const shown: Record<CompanionTab, boolean> = {
    dict: true,
    notes: notesHtml !== "",
    translation: options.companion?.hasTranslation ?? false,
    about: aboutHtml !== "",
  };
  const hasCompanionTabs = shown.notes || shown.translation || shown.about;
  const panelClass = `reader-dict-panel drawer${
    query ? "" : " drawer-minimized"
  }${hasCompanionTabs ? " has-companion-tabs" : ""}`;
  const unarmedAttr = query ? "" : "\ndata-dict-unarmed";
  const closeIcon = renderReaderFrameIconSvg("close", { size: 16 });
  // prettier-ignore
  const closeLink =
    query && closeHref !== undefined
      ? html`<a href="${text(closeHref)}#reader-dict-dismissed" class="reader-sheet-close" aria-label="Close dictionary panel" title="Close">${raw(closeIcon)}</a>`
      : html`<a href="#reader-dict-dismissed" class="reader-sheet-close reader-sheet-close-target" aria-label="Close dictionary panel" title="Close">${raw(closeIcon)}</a>`;
  const tabsHtml = COMPANION_TABS.map((tab) =>
    renderCompanionTab(tab, shown[tab.id])
  ).join("\n");
  const drawerIcon = renderReaderFrameIconSvg("drawer", { size: 18 });

  // prettier-ignore
  return html`<div class="reader-splitter resize-handle"
             role="separator"
             tabindex="0"
             aria-orientation="vertical"
             aria-label="Resize dictionary sidebar"
             aria-valuemin="300"
             aria-valuemax="750"
             aria-valuenow="420">
          <div class="resize-grip" aria-hidden="true" data-js-only></div>
        </div>

        <aside class="${raw(panelClass)}" id="reader-dict" aria-label="Dictionary">
          <div class="reader-sheet-bar"
               role="separator"
               tabindex="0"
               aria-orientation="horizontal"
               aria-label="Resize dictionary drawer"
               aria-valuemin="18"
               aria-valuemax="88"
               aria-valuenow="${query ? "48" : "0"}">
            <div class="reader-sheet-handle" aria-hidden="true"></div>
            <div class="reader-sheet-teaser">
              <a href="#reader-dict" class="reader-sheet-label reader-sheet-open-link" title="Open Dictionary Search">
                <span class="reader-teaser-nojs" data-nojs-only>Open Dictionary Search &uarr;</span>
                <span class="reader-teaser-js" data-js-only>Tap any word to view definitions</span>
              </a>
              <nav class="reader-panel-tabs" aria-label="Companion panel"${raw(hasCompanionTabs ? "" : " hidden")}>
              ${raw(tabsHtml)}
              </nav>
              ${raw(closeLink)}
            </div>
          </div>

          <div class="reader-panel-views">
            <div class="dict-iframe-container reader-panel-view" id="panel-view-dict">
              <div class="reader-dict-landing" data-js-only>
                <p class="reader-dict-landing-copy"><strong><span class="reader-dict-verb-desktop">Click</span><span class="reader-dict-verb-mobile">Tap</span> any word</strong> in the passage to look it up<span class="reader-dict-landing-shortcut">, or press <kbd class="reader-dict-kbd">/</kbd> to search</span>.</p>
              </div>
              <iframe id="dict-frame"
                      name="dict-frame"
                      src="${text(dictIframeSrc)}"${raw(unarmedAttr)}
                      class="dict-iframe"
                      title="Dictionary Search and Definitions"
                      loading="lazy"></iframe>
            </div>
            <div class="reader-panel-notes reader-panel-view reader-panel-card" id="panel-view-notes" aria-live="polite">
              ${raw(renderReaderNotesSlotHtml(notesHtml))}
            </div>
            <div class="reader-panel-translation reader-panel-view reader-panel-card" id="panel-view-translation" aria-live="polite"></div>
            <div class="reader-panel-about reader-panel-view reader-panel-card" id="panel-view-about">
              ${raw(aboutHtml)}
            </div>
          </div>
          <button type="button"
                  class="reader-dict-back-to-top"
                  aria-label="Scroll dictionary to top"
                  title="Jump to top"
                  data-js-only>
            ${raw(renderReaderFrameIconSvg("chevronUp"))}
          </button>
        </aside>
        <a href="#reader-dict"
           class="reader-drawer-fab"
           aria-label="Open dictionary drawer"
           title="Open dictionary drawer">
          ${raw(drawerIcon)}
        </a>`;
}
