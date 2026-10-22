/**
 * Document event that opens the app-bar Appearance menu
 * (`appearance_menu.client.ts`). The "Text appearance" links in the reader and
 * dictionary settings dispatch it, so they don't import the menu itself. The
 * menu is centred in the viewport, so the event carries no detail.
 */
export const OPEN_APPEARANCE_EVENT = "morcus:open-appearance";
