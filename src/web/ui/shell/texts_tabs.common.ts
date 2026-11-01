/**
 * Shared contract for the unified **Texts** section tab bar
 * (**Library · Open Texts · Custom**; Decisions #13, #14, #15, #16).
 *
 * Consumed by:
 * - C4 (`tabs`): Implements `renderTextsTabBar(activeTab, options)` in
 *   `src/web/ui/shell/texts_tabs.server.ts` + styles in `src/web/ui/library/library.css`,
 *   renames top-bar `Library` link label to `Texts` in `page_shell.server.ts`,
 *   and renders the tab bar on `/library` and `/externalReader` (landing).
 * - C5 (`catalog`): Calls `renderTextsTabBar("opentexts", ...)` on `/opentexts`
 *   (catalog listing view) and sets `activePage: "library"` in `renderPageShell`
 *   so **Texts** stays highlighted in the top navigation bar.
 */

import type { SafeHtml } from "@/web/ui/core/dom/html.common";

/**
 * Identifier for each of the three tabs under the top-bar **Texts** section:
 * - `"library"`: Curated Morcus Library (`/library`)
 * - `"opentexts"`: Uncurated Open Texts catalog (`/opentexts`)
 * - `"external"`: User-supplied URL / pasted / saved texts (`/externalReader`)
 */
export type TextsTabId = "library" | "opentexts" | "external";

/**
 * Canonical route paths for the three **Texts** tabs (Decision #15).
 */
export const TEXTS_TAB_PATHS: Readonly<Record<TextsTabId, string>> = {
  library: "/library",
  opentexts: "/opentexts",
  external: "/externalReader",
};

/**
 * Static specification for a single tab in the **Texts** section header.
 */
export interface TextsTabSpec {
  readonly id: TextsTabId;
  /** Full desktop tab label (`"Library"`, `"Open Texts"`, `"Custom"`). */
  readonly label: string;
  /** Compact mobile tab label (`"Library"`, `"Open"`, `"Custom"`). */
  readonly shortLabel: string;
  /** Canonical tab href (`"/library"`, `"/opentexts"`, `"/externalReader"`). */
  readonly href: string;
  /** Default badge / subtitle hint shown when no dynamic count is passed. */
  readonly defaultBadge?: string;
}

/**
 * Ordered specification of the three **Texts** tabs (Decision #14).
 * Matches the target mockup (`read_section_mockup.html`).
 */
export const TEXTS_TABS: readonly TextsTabSpec[] = [
  {
    id: "library",
    label: "Library",
    shortLabel: "Library",
    href: TEXTS_TAB_PATHS.library,
    defaultBadge: "curated",
  },
  {
    id: "opentexts",
    label: "Open Texts",
    shortLabel: "Open",
    href: TEXTS_TAB_PATHS.opentexts,
    defaultBadge: "uncurated",
  },
  {
    id: "external",
    label: "Custom",
    shortLabel: "Custom",
    href: TEXTS_TAB_PATHS.external,
  },
];

/**
 * Optional per-tab badge text override (e.g. work count `"366"` on Library or
 * `"1,200+"` on Open Texts).
 */
export interface TextsTabBarOptions {
  readonly badges?: Readonly<Partial<Record<TextsTabId, string>>>;
}

/**
 * Signature of the server-side tab bar renderer implemented by C4 in
 * `src/web/ui/shell/texts_tabs.server.ts`.
 */
export type RenderTextsTabBarFn = (
  activeTab: TextsTabId,
  options?: TextsTabBarOptions
) => SafeHtml;
