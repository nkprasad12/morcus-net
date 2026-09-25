# V1 SPA vs V2 Progressively Enhanced SSR: Reader Feature Parity

This document outlines the remaining feature gaps between the **V1 UI (SPA)** (`src/web/client/pages/library/`) and the **V2 UI (Progressively Enhanced SSR)** (`src/web/v2/reader/`), focusing on capabilities previously present in V1 that are still missing or degraded in V2.

> [!NOTE]
> Future architectural and performance enhancements (such as translation join guards, Pliny repagination, 3-panel split workstations, and in-work search) are tracked in [`TODOS.md`](TODOS.md).

---

## 1. Remaining Gaps Matrix

| Feature Area                  | V1 UI (SPA)                                                                                    | V2 UI (SSR + Progressive Enhancement)                                                             | Parity Status        |
| :---------------------------- | :--------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------ | :------------------- |
| **In-Flow "Edit and Report"** | Section anchor opens a menu offering "Copy link" **and** "Edit and Report" (`contenteditable`) | Section anchor copies the URL immediately; no menu, no `contenteditable`, no `userEdit` reporting | ❌ **Missing in V2** |
| **External Content Reader**   | Paste text or scrape a URL, then read it with full dictionary word lookup support              | No equivalent route or component exists under `src/web/v2/`                                       | ❌ **Missing in V2** |

---

## 2. Completed Parity Areas (Shipped in V2)

The following core reading surfaces from V1 have achieved full parity or intentional streamlining in V2:

- ✅ **Critical Apparatus Notes**: Numbered, page-scoped footnote links in No-JS flow; eager relocation into the synchronized companion panel **Notes** tab with non-destructive in-place scroll and bidirectional marker highlighting.
- ✅ **Translation Presentation**: Retired legacy dual-column parallel layout; translations load on-demand in the companion panel **Translation** tab with native independent scrolling and parallel fetch coordination on page turns.
- ✅ **Client-Side Page Navigation**: In-place partial page swaps (`X-Requested-With: fetch`), patching sticky bar controls, updating TOC active indicators, dynamic footnote adoption, and scroll restoration without full-page reloads.
- ✅ **Per-Work Macra Preference**: Scoped per work via `macronButton-${workId}` in `storage.client.ts` matching V1 schema; omitted server-side on non-macronized editions.
- ✅ **Saved Reading Position**: Bi-directional `LIBRARY_SPOTS` persistence in reader and corner resume badges with direct jump links on `/v2/library` work cards.
- ✅ **Text Rendition & Verse Layout**: Emitted rendition classes (`.reader-line`, `.indent`, `rendParent`, `overline`, `smallcaps`, `blockquote`) fully styled in `reader_text.css`.
- ✅ **Work Attribution & Provenance**: Retired biblio modal in favor of companion **About** tab and No-JS `<details id="reader-work-about">` colophon in article flow.
- ✅ **Outline / Table of Contents**: Anchored TOC drawer with live search filtering (`ReaderTocController`) and `:target` zero-JS fallback.
- ✅ **Embedded Dictionary**: Resizable split panel on desktop (`ReaderLayoutController`) and draggable bottom drawer on mobile (`DrawerController`).
- ✅ **Section Label Visibility**: `showGutter` preference in reader settings typography popover.
- ✅ **Outer Page Margins**: V1 dragged the outer gutters (`draggables.tsx`); V2 has Narrow / Default / Wide / Full page width presets in the Appearance popover (`GlobalSettings.readerWidth`, applied pre-paint; see `shell/page_width.css`).
- ✅ **Screen Wake Lock**: `WakeLockController` (`core/wake_lock.client.ts`) holds a single `screen` sentinel for the reader's connected lifetime, released after 5 minutes idle. Unlike V1, scrolling (including inner split-pane scrollers), taps, keys, page turns, and dictionary-iframe navigations all count as activity; browser-initiated releases are re-acquired on return, and the lock is released on disconnect. Applies on all form factors with no setting.
- ✅ **Swipe Page Navigation**: `ReaderPageNavController` (`reader_page_nav.client.ts`) on passive touch events (`trackHorizontalSwipe` in `core/gesture.client.ts`). Unlike V1's floating arrow badge, the passage follows the finger, fades as the swipe arms (20% of `min(vw, vh)`, as in V1), then slides out while the next page loads and the new page slides in; short swipes spring back and swipes toward a missing page rubber-band. Swipes starting within 24px of either edge (OS back gestures), while pinch-zoomed, or with text selected are ignored. The toggle lives in the Appearance popover's **Touch Navigation** group (shown only on devices with a touchscreen, `(any-pointer: coarse)`, so touchscreen laptops included) under V1's key (`RD_MB_NAV_SWIPE`, default on), so V1 choices carry over. While swipe turns are live on a touchscreen device, the browser's own history swipe (Chrome's arrow bubble) is suppressed via `overscroll-behavior-x` so one gesture can't both turn the page and navigate history; on touchscreen laptops this also disables trackpad history swipes on reader pages (accepted trade-off). iOS Safari and Android's system back gesture are edge swipes that CSS can't suppress; the 24px edge guard keeps them from overlapping. Slow turns (any path, not just swipe) show a themed spinner after 400ms, keyed off `aria-busy` from `fetchAndSwapPartial`, so fast connections never see it.
- ✅ **Passage Range Highlighting (`matchText`)**: Isomorphic `matchText` parser (`reader_highlight.common.ts`) supporting `id~start~end__id2~start2~end2`. Server routes preserve `matchText` across `?jump=` redirects and resolve the target chapter page from the first section ID in `matchText` when `:page` is omitted, while keeping server-rendered passage HTML 100% static. Client tokenization (`tokenize.client.ts` + `reader_view.client.ts`) tracks 0-based `isWord` token indices per section (excluding `.reader-gap` and note markers to stay aligned with corpus `leaders` offsets), and marks matched words with `.reader-match`, coloured orange text as in V1's `.corpusResult` (`--match-highlight-fg`, `reader_text.css`). JS users are centred on the first match; no-JS users land on its section via a `#sec-<id>` redirect when `:page` is omitted.

### Deliberately Not Ported

These V1 features were reviewed and intentionally left out of V2. Revisit only with a new justification.

- 🚫 **Side-Tap Page Navigation** (V1 `handleSideTap` in `base_reader.tsx`, `RD_MB_NAV_SIDE_TAP`, off by default): tapping the outer 7.5% of the screen turned the page. Not ported because tap-to-turn is already covered by the sticky-bar pager arrows (which also serve screen readers, No-JS, and show first/last-page state) and the footer continuation cards, while swipe covers gesture turning. Cutting it saves ~0.5 kB raw / ~0.23 kB gzipped of JS against the bundle budget (`src/bundler/v2_bundle_budget.ts`), plus a setting and the tap-vs-word/anchor/note-marker precedence rules. V1's stored `RD_MB_NAV_SIDE_TAP` value is ignored.

---

## 3. Detailed Gap Analysis for Remaining Items

### 3.1. In-Flow "Edit and Report"

- **V1 (`tooltips.tsx:L215-256`, `reader.tsx:L744`, `L1057`)**:
  - Section-header anchor opened a `TooltipMenu` offering "Copy link" and "Edit and Report".
  - "Edit and Report" set `contenteditable="true"` on the target section element and focused it.
  - On `blur`, if modified, diffed original against edited text and submitted `reportIssue({ original, edited, sectionId }, ["userEdit"])`.
- **V2 (`reader_view.client.ts:L213-220`)**:
  - ❌ **Missing**. Clicking `a.section-anchor` copies the URL immediately to the clipboard with no menu.
  - Restoring this requires introducing a small menu/popover on section anchors or secondary actions before triggering the inline edit flow.
  - **Design Document**: See [`IN_FLOW_EDITING_DESIGN.md`](IN_FLOW_EDITING_DESIGN.md) for full architecture, anchored popover trigger UX, in-place textarea swap vs `contenteditable` analysis, and `/v2/api/report` pipeline integration.

### 3.2. External Content Reader

- **V1 (`external_content_reader.tsx`, `external_content_storage.tsx`)**:
  - Dedicated reader interface allowing users to paste raw Latin text or fetch from a scraped URL.
  - Persisted external texts locally in `localStorage` and provided the same interactive word lookup and dictionary drawer affordances as library texts.
- **V2**: ❌ **Missing**. No equivalent route, storage, or component exists under `src/web/v2/`.

---

## 4. Open Investigations

Suspected V2 bugs found incidentally. Not yet triaged.

- 🔍 **Ovid _Tristia_: section content under the wrong id** (`hypotactic_Tristia_Ovid`). In the V2 artifact, `sec-1.7.x` appears to hold the text of poem 1.8 (e.g. `sec-1.7.1` reads "in caput alta suum…", which is 1.8.1; the corpus has "si quis habes nostri…" for 1.7.1). Possible causes: duplicate section ids across poems in `v2_preprocessor.ts`, or a stale artifact. Found while comparing corpus rows against V2-rendered sections for `matchText` highlighting; ~40 Tristia rows differ.
- Corpus-side `matchText` alignment issues (words split at inline markup; heading rows without ids) are tracked in [`../corpus/TODO.md`](../corpus/TODO.md).
- 🐞 **Dictionary pane stuck in light mode while the reader is dark** (confirmed). Repro:

  1. Set the OS/browser to dark mode, and have no saved theme (fresh profile, or `localStorage.removeItem("GlobalSettings")`; never touched the theme toggle).
  2. Open any reader page, e.g. `/v2/reader/caesar/de_bello_gallico/1.1`.
  3. The passage renders dark (via `@media (prefers-color-scheme: dark)`), but the dictionary iframe renders light.

  Cause: with no saved preference, `<html>` has no `data-theme` and the dark palette comes from the media query. `initIframeThemeSync` in `reader_view.client.ts` then falls back to `settingsStore.get().darkMode ? "dark" : "light"`, i.e. `"light"`, and `syncIframeTheme` (`core/dom.client.ts`, which also defaults to `"light"`) writes `data-theme="light"` into the iframe, overriding the iframe's own media query. Confirmed with Playwright: under `colorScheme: "dark"`, the parent has `data-theme=null` while the iframe has `data-theme="light"`. Likely fix: when neither `data-theme` nor a saved `darkMode` exists, remove the iframe's `data-theme` (or copy the parent's attribute exactly, including its absence) instead of forcing `"light"`. Once the toggle is used, the saved `darkMode` keeps both in sync, which is why the bug is intermittent.
