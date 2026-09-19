# V1 SPA vs V2 Progressively Enhanced SSR: Reader Feature Parity

This document outlines the remaining feature gaps between the **V1 UI (SPA)** (`src/web/client/pages/library/`) and the **V2 UI (Progressively Enhanced SSR)** (`src/web/v2/reader/`), focusing on capabilities previously present in V1 that are still missing or degraded in V2.

> [!NOTE]
> Future architectural and performance enhancements (such as translation join guards, Pliny repagination, 3-panel split workstations, and in-work search) are tracked in [`TODOS.md`](TODOS.md).

---

## 1. Remaining Gaps Matrix

| Feature Area                                 | V1 UI (SPA)                                                                                       | V2 UI (SSR + Progressive Enhancement)                                                                           | Parity Status        |
| :------------------------------------------- | :------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------- | :------------------- |
| **Screen Wake Lock**                         | `useWakeLock` requests `navigator.wakeLock` to prevent display timeout while reading on mobile    | No wake lock helper or sentinel management in V2                                                                | ❌ **Missing in V2** |
| **In-Flow "Edit and Report"**                | Section anchor opens a menu offering "Copy link" **and** "Edit and Report" (`contenteditable`)    | Section anchor copies the URL immediately; no menu, no `contenteditable`, no `userEdit` reporting               | ❌ **Missing in V2** |
| **Swipe & Side-Tap Page Navigation**         | Touch swipe paging with gesture progress overlay, plus edge-tap navigation (`handleSideTap`)      | Arrows, `[` / `]` keyboard shortcuts, and footer continuation cards only; no touch gestures or margin tap zones | ❌ **Missing in V2** |
| **Passage Range Highlighting (`matchText`)** | `matchText=id~start~end` query parameter highlights specific word token ranges across the passage | Anchor hash (`#sec-*`) and `?jump=` jump to section, but cannot highlight multi-word phrase ranges              | ❌ **Missing in V2** |
| **External Content Reader**                  | Paste text or scrape a URL, then read it with full dictionary word lookup support                 | No equivalent route or component exists under `src/web/v2/`                                                     | ❌ **Missing in V2** |

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

---

## 3. Detailed Gap Analysis for Remaining Items

### 3.1. Screen Wake Lock (`useWakeLock`)

- **V1 (`src/web/client/mobile/wake_lock.tsx`, `base_reader.tsx:L138-153`)**:
  - Uses `navigator?.wakeLock?.request("screen")` to keep the device screen illuminated while reading.
  - Automatically requests a timed lock (10 minutes, `EXTENSION_MS = 600,000`).
  - Extends/renews the lock on user interaction (looking up words, resizing drawer, switching tabs).
  - Re-acquires the lock automatically on `visibilitychange` when returning to the tab (`document.visibilityState === "visible"`).
  - Releases sentinel cleanly on teardown.
- **V2**: ❌ **Missing**. No wake lock logic exists in `reader_view.client.ts`. Readers on mobile devices experience screen dimming/sleep while reading long Latin passages.

### 3.2. In-Flow "Edit and Report"

- **V1 (`tooltips.tsx:L215-256`, `reader.tsx:L744`, `L1057`)**:
  - Section-header anchor opened a `TooltipMenu` offering "Copy link" and "Edit and Report".
  - "Edit and Report" set `contenteditable="true"` on the target section element and focused it.
  - On `blur`, if modified, diffed original against edited text and submitted `reportIssue({ original, edited, sectionId }, ["userEdit"])`.
- **V2 (`reader_view.client.ts:L213-220`)**:
  - ❌ **Missing**. Clicking `a.section-anchor` copies the URL immediately to the clipboard with no menu.
  - Restoring this requires introducing a small menu/popover on section anchors or secondary actions before triggering the inline edit flow.

### 3.3. Swipe & Side-Tap Page Navigation

- **V1 (`src/web/client/mobile/gestures.tsx`, `base_reader.tsx:L209-220`)**:
  - **Swipe**: Touch swipe paging with live direction/progress feedback and a release-to-turn threshold.
  - **Side Tap**: Clicking the outer 7.5% margins of the screen (`edgeDistance < 0.075`) triggered an instant page turn (left edge $\rightarrow$ previous page, right edge $\rightarrow$ next page).
  - **Settings**: Exposed checkboxes for `swipeNavigation` (`SWIPE_NAV_KEY`) and `tapNavigation` (`TAP_NAV_KEY`) in mobile settings.
- **V2**: ❌ **Missing**. Page turns only support keyboard shortcuts (`[`, `]`), sticky bar arrow buttons, and footer continuation cards.

### 3.4. Passage Range Highlighting (`matchText`)

- **V1 (`src/web/client/pages/library/reader_url.ts`, `reader.tsx:L1081-1090`)**:
  - URL parameter `matchText=id~start~end__id2~start2~end2` parsed token start/end indices per section.
  - Rendered word spans within `[start, end)` with a distinct highlight class.
  - Enabled external search results and citations to deep-link directly to highlighted sentence or phrase ranges.
- **V2**: ❌ **Missing**. Supports `#sec-<id>` and `?jump=<id>`, but has no mechanism for range highlighting via URL parameters.

### 3.5. External Content Reader

- **V1 (`external_content_reader.tsx`, `external_content_storage.tsx`)**:
  - Dedicated reader interface allowing users to paste raw Latin text or fetch from a scraped URL.
  - Persisted external texts locally in `localStorage` and provided the same interactive word lookup and dictionary drawer affordances as library texts.
- **V2**: ❌ **Missing**. No equivalent route, storage, or component exists under `src/web/v2/`.
