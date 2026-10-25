/**
 * Centralized SVG icon paths and renderer for Morcus UI V2.
 * Shared between SSR templates (*.server.ts) and client components (*.client.ts).
 */

import { html, raw, type SafeHtml } from "@/web/ui/core/dom/html.common";

// Icons used by client code are standalone consts: bundlers don't tree-shake
// object properties, so importing `ICON_PATHS` (or `renderIconSvg`) in a
// `*.client.ts` file would ship every path below in common.js. Client code
// must import these consts instead (enforced by eslint.config.mjs).
export const ICON_LINK =
  "M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z";
export const ICON_EDIT =
  "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM21.41 6.34l-3.75-3.75-2.53 2.54 3.75 3.75 2.53-2.54z";
export const ICON_BOOKMARK =
  "M17 3H7a1 1 0 0 0-1 1v16l6-3.2L18 20V4a1 1 0 0 0-1-1z";
export const ICON_CLOSE = "M18 6 6 18M6 6l12 12";

export const ICON_PATHS = {
  tune: "M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z",
  search:
    "M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
  chevronUp: "M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z",
  chevronDown: "M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z",
  flag: "M14.4 6 14 4H5v17h2v-7h5.6l.4 2h7V6z",
  menu: "M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z",
  /** Stroked ×: the one close glyph (dialogs, popovers, sheets, mobile menu). */
  close: ICON_CLOSE,
  /** Material "palette": the app-bar Appearance menu. */
  palette:
    "M12 3a9 9 0 0 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z",
  toc: "M4 6h16M4 12h16M4 18h7",
  link: ICON_LINK,
  check: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  book: "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",
  notes:
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8",
  info: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 16v-4 M12 8h.01",
  translate: "m5 8 6 6 M4 14l6-6 2-3 M2 5h12 M7 2h1 M22 22l-5-10-5 10 M14 18h6",
  translation:
    "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 0a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z M2 12h20",
  drawer:
    "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M3 14h18 M10 17.5h4",
  edit: ICON_EDIT,
  arrowForward: "m12 4-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z",
  /** Outline chevrons (pager, quick jump, corpus guide accordions). */
  strokeChevronLeft: "M15 6l-6 6 6 6",
  strokeChevronRight: "M9 6l6 6-6 6",
  strokeChevronDown: "M6 9l6 6 6-6",
} as const;

type IconName = keyof typeof ICON_PATHS;

/**
 * Outline icons: drawn with `stroke`, not `fill`. `renderIconSvg` gives them
 * stroke presentation attributes, so they render correctly without per-site
 * CSS (which, being CSS, still overrides them where a site sets its own).
 * Every other icon is a filled shape and inherits `fill` from CSS.
 */
const STROKE_ICONS: ReadonlySet<IconName> = new Set<IconName>([
  "close",
  "toc",
  "book",
  "notes",
  "info",
  "translate",
  "translation",
  "drawer",
  "strokeChevronLeft",
  "strokeChevronRight",
  "strokeChevronDown",
]);

interface RenderIconOptions {
  className?: string;
  width?: number;
  height?: number;
  viewBox?: string;
  /** Stroke icons only; defaults to 2. */
  strokeWidth?: number;
  extraAttrs?: string;
}

/**
 * Renders an inline SVG element for the given standard icon.
 */
export function renderIconSvg(
  name: IconName,
  options?: RenderIconOptions
): string {
  const path = ICON_PATHS[name];
  const cls = options?.className ? ` class="${options.className}"` : "";
  const w = options?.width ? ` width="${options.width}"` : "";
  const h = options?.height ? ` height="${options.height}"` : "";
  const vb = options?.viewBox ?? "0 0 24 24";
  const stroke = STROKE_ICONS.has(name)
    ? ` fill="none" stroke="currentColor" stroke-width="${
        options?.strokeWidth ?? 2
      }" stroke-linecap="round" stroke-linejoin="round"`
    : "";
  const extra = options?.extraAttrs ? ` ${options.extraAttrs}` : "";
  return `<svg viewBox="${vb}"${w}${h}${cls} aria-hidden="true"${stroke}${extra}><path d="${path}"></path></svg>`;
}

/**
 * Renders the `.copy-pill-icon` span containing both the link and checkmark
 * SVGs. CSS toggles between `.copy-pill-link` and `.copy-pill-check` when
 * `.is-copied` is set on the enclosing `.copy-pill` or `.reader-heading-link`.
 */
export function renderCopyPillIconsHtml(): string {
  return `<span class="copy-pill-icon" aria-hidden="true">${renderIconSvg(
    "link",
    { className: "copy-pill-glyph copy-pill-link" }
  )}${renderIconSvg("check", {
    className: "copy-pill-glyph copy-pill-check",
  })}</span>`;
}

export interface RenderCopyPillOptions {
  href: string;
  title: string;
  extraClass?: string;
}

/**
 * Renders a `<a class="tab-pill copy-pill ...">` permalink control with the
 * link/check icon pair and a desktop "Copy link" label (hidden on mobile so
 * only the subtle icon renders).
 */
export function renderCopyPillHtml(options: RenderCopyPillOptions): SafeHtml {
  const cls = options.extraClass
    ? `tab-pill copy-pill ${options.extraClass}`
    : "tab-pill copy-pill";
  return html`<a
    href="${options.href}"
    class="${cls}"
    title="${options.title}"
    aria-label="${options.title}"
    >${raw(renderCopyPillIconsHtml())}<span class="copy-pill-label"
      >Copy link</span
    ></a
  >`;
}
