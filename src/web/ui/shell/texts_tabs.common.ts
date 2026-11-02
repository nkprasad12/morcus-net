/**
 * Shared contract for the unified **Texts** section tab bar
 * (**Library · Experimental · Custom**).
 *
 * Rendered by `renderTextsTabBar(activeTab)` in
 * `src/web/ui/shell/texts_tabs.server.ts` and styled in
 * `src/web/ui/library/library.css`.
 */

/**
 * Identifier for each of the three tabs under the top-bar **Texts** section:
 * - `"library"`: Curated Morcus Library (`/library`)
 * - `"experimental"`: Uncurated Experimental catalog (`/experimentalTexts`)
 * - `"external"`: User-supplied URL / pasted / saved texts (`/externalReader`)
 */
export type TextsTabId = "library" | "experimental" | "external";

/**
 * Static specification for a single tab in the **Texts** section header.
 */
export interface TextsTabSpec {
  readonly id: TextsTabId;
  /** Tab label (`"Library"`, `"Experimental"`, `"Custom"`). */
  readonly label: string;
  /** Canonical tab href (`"/library"`, `"/experimentalTexts"`, `"/externalReader"`). */
  readonly href: string;
  /** Default tier hint shown as the tab's tooltip (`"curated"`, `"uncurated"`). */
  readonly defaultBadge?: string;
}

/**
 * Ordered specification of the three **Texts** tabs.
 */
export const TEXTS_TABS: readonly TextsTabSpec[] = [
  {
    id: "library",
    label: "Library",
    href: "/library",
    defaultBadge: "curated",
  },
  {
    id: "experimental",
    label: "Experimental",
    href: "/experimentalTexts",
    defaultBadge: "uncurated",
  },
  {
    id: "external",
    label: "Custom",
    href: "/externalReader",
  },
];
