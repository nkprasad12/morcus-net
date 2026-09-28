/**
 * The regions of the reader that change on a page turn, shared by the server
 * (full page and partial) and `MorcusReaderView.swapPage`.
 *
 * Everything else in the reader frame (the TOC drawer and its trigger, the
 * settings button, the companion panel's tabs and views, the dictionary
 * iframe) persists across turns and sits outside every slot.
 */
export const READER_PAGE_SLOTS = [
  /** The text card: heading, passage, continuation links. */
  "text",
  /** The sticky bar's previous-page link. */
  "pager-prev",
  /** The sticky bar's next-page link. */
  "pager-next",
  /** The page id shown inside the TOC trigger. */
  "page-label",
  /** The page's notes, inside the companion panel's Notes view. */
  "notes",
] as const;

export type ReaderPageSlot = (typeof READER_PAGE_SLOTS)[number];
