/**
 * Document event that opens the app-bar Appearance menu
 * (`appearance_menu.client.ts`). The "Text appearance" links in the reader and
 * dictionary settings dispatch it, so they don't import the menu itself.
 */
export const OPEN_APPEARANCE_EVENT = "morcus:open-appearance";

/** Optional detail of {@link OPEN_APPEARANCE_EVENT}. */
export interface OpenAppearanceDetail {
  /**
   * Where to anchor the menu, typically the dispatching dialog's own trigger.
   * If it's off screen the menu falls back to the app-bar button.
   */
  anchor?: HTMLElement | null;
}
