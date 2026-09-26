import * as he from "he";
import { renderPageShell } from "@/web/v2/shell/page_shell.server";

export interface NotFoundOptions {
  /** The work identifier or path that was not found, e.g. "author/work" */
  workSlug?: string;
  /** Optional custom title; defaults to "Classical Work Not Found" */
  title?: string;
  /** Optional custom description */
  description?: string;
}

/**
 * Renders the standalone empty-state HTML fragment for not-found pages.
 */
export function renderNotFoundContentHtml(
  options: NotFoundOptions = {}
): string {
  const title = options.title ?? "Classical Work Not Found";
  const descHtml = options.description
    ? he.escape(options.description)
    : options.workSlug
    ? `Could not locate classical work <em>${he.escape(
        options.workSlug
      )}</em> in the library catalog.`
    : "Could not locate the requested resource in the library catalog.";

  return `
    <div class="empty-state empty-state-standalone library-empty-state not-found-state">
      <h2 class="empty-state-title library-empty-title">${he.escape(title)}</h2>
      <p class="empty-state-desc library-empty-desc">${descHtml}</p>
      <a href="/v2/library" class="btn btn-primary">Browse Full Library</a>
    </div>
  `.trim();
}

/**
 * Renders the full standalone 404 page document with App Bar.
 */
export function renderNotFoundPageHtml(options: NotFoundOptions = {}): string {
  const contentHtml = renderNotFoundContentHtml(options);
  return renderPageShell({
    title: "Work Not Found - Morcus Latin Tools",
    activePage: "library",
    contentHtml,
  });
}
