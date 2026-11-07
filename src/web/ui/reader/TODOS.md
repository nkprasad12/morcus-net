# Reader TODOs (`src/web/ui/reader/`)

Known follow-up architectural, performance, and ergonomic work for the library reader topic.
This includes remaining V1 → V2 gaps. See [`README.md`](README.md) for how the directory is organized.

---

## 1. Repaginate Pliny, _Naturalis Historia_

**Status:** deferred edge case.

Pliny's _Naturalis Historia_ paginates one whole book per page and contains **69,113 of the corpus's 85,876 notes**.
Its largest chapter ships ~1.3 MB of footnotes on top of ~0.5 MB of Latin text.
The median page across the corpus has **4** notes; only Pliny's 37 pages are pathological.

- **Root Cause**: Source pagination depth (one entire book per page), not the apparatus pipeline itself.
- **Proposed Solution**: Upstream data preprocessing chunking in `process_work.ts` / `work_preprocessor.ts` to
  subdivide Pliny's books into readable sections/chapters.

---

## 2. 3-panel split-pane view (Latin | English || Dictionary)

**Status:** not started (future workstation mode).

For deep parallel reading on wide desktop displays, explore a 3-panel reading workstation:

- **Left Column**: Latin original text.
- **Middle Column**: English parallel translation.
- **Right Column**: Embedded dictionary and inflection tools.

---

## 3. Zero-JS translation baseline support

**Status:** not started.

Currently, translations are loaded on demand via `/work/:author/:name/:page/translation` when
selecting the companion panel's Translation tab.

- For users with JavaScript disabled, explore an inline collapsible `<details>` fallback or server-rendered
  translation section in page flow, maintaining the Zero-JS baseline principle.

---

## 4. In-work passage text search

**Status:** not started.

The Table of Contents drawer already includes a live filter input.
Extend this capability to search passage text within the current work:

- Search Latin lemmas or exact strings across the preprocessed work rows.
- Display a list of matching section anchors with snippet previews for rapid in-work navigation.

---

## 5. Unified companion panel & pager keyboard shortcuts

**Status:** partially implemented; surfacing and `ArrowLeft` / `ArrowRight` paging open.
See [`../docs/CODE_HEALTH.md`](../docs/CODE_HEALTH.md) for the full UI V2 keyboard shortcut audit table.

- **Current state (`reader_view.client.ts`)**:
  - `[` / `]` (Previous / Next page) and `t` / `T` (Contents & Sections) are implemented and surfaced via `title` tooltips on `#pager-prev`, `#pager-next`, and `#reader-toc-btn`.
  - `/` (Dictionary tab + focus `#dict-q`) is implemented and surfaced via `<kbd>/</kbd>` in the empty Dictionary panel.
  - `n` / `N` (Notes tab), `i` / `I` (About tab), and `a` / `A` (Appearance & Typography `Aa`) are implemented in `reader_view.client.ts`, but **not surfaced** in `title` tooltips or `aria-keyshortcuts` in `reader.server.ts`.
  - **Translation tab**: has no single-key shortcut yet (only reachable via click or `ArrowLeft` / `ArrowRight` when focus is already on `.reader-panel-tabs`).
- **Why `[` / `]` was originally chosen instead of `ArrowLeft` / `ArrowRight` (and how to support arrows safely)**:
  - V1 had **no** `[` / `]` shortcut (`[` / `]` was introduced in V2 commit `43ef7a6c`, likely by analogy with PDF/Vim/GitHub bracket navigation).
  - Binding global `ArrowLeft` / `ArrowRight` to page turns requires guarding 4 browser/widget interactions that `isShortcutBlocked()` (`core/dom/dom.client.ts`) does not block on its own:
    1. **WAI-ARIA controls**: `.reader-panel-tabs` (`role="tablist"`), `#reader-splitter` (`role="separator"`), and `.page-handle` (`role="separator"`) already handle `ArrowLeft` / `ArrowRight` and call `e.preventDefault()`, so checking `e.defaultPrevented` avoids conflicts.
    2. **Horizontal scroll (`Shift+Wheel` / overflow)**: When a passage table or verse line overflows horizontally (`scrollWidth > clientWidth`), native `ArrowLeft` / `ArrowRight` scrolls horizontally.
    3. **Caret & Selection / Find-in-Page**: When the user has an active text selection (`!window.getSelection()?.isCollapsed`), pressing an arrow key collapses the selection rather than turning the page.
    4. **Embedded Dictionary iframe (`#reader-dict-frame`)**: Unlike `/` (which is forwarded from inside the iframe), `ArrowLeft` / `ArrowRight` inside the dictionary iframe must remain reserved for dictionary scrolling and combobox caret movement.

---

## 6. External Reader: share links for pasted text

**Status:** idea, not scheduled. Beyond V1 parity (V1 has no equivalent).

Pasted texts live only in the browser that saved them (`?local=<key>` in `external/`), so sending that
link to someone else opens the "isn't saved in this browser" notice. URL imports already share fine
via `?url=`.

- **Proposal**: a "Copy share link" action that compresses the text (`CompressionStream("deflate-raw")`,
  base64url) into the fragment: `/externalReader#t=<data>`. Browsers never send fragments to the
  server, so the "never sent to Morcus" promise holds. The loader decodes it, renders with the shared
  `external_text.common.ts` renderer, and adopts it like `?local=` (optionally offering to save it).
- **Trade-offs**: the recipient needs JS (the server never sees the text). Links grow with the text;
  Latin compresses ~3×, so a page of text is a few thousand characters. Browsers cope, but some chat and
  email clients may truncate. Suited to passages, not whole works; cap the size and say so in the UI.

---

## 7. External Reader: Web Share Target

**Status:** idea, not scheduled. Beyond V1 parity.

Make Morcus a target in the OS share sheet: select Latin in a PDF, e-book, or another app, then
Share → Morcus to open it in the External Reader. It is declared with a `share_target` entry in the
web app manifest.

- **Prerequisite (done)**: V2 pages link the manifest (`src/web/server/pwa_utils.ts`, no
  `share_target` yet), so V2 is installable.
- **Reach**: it only works for installed apps, mainly Chrome on Android and installed desktop Chrome.
  iOS Safari doesn't support it.
- **Privacy**: the simple `method: "GET"` form puts the shared text in the query string, which
  reaches the server and its logs. That breaks the paste-path promise. Options: have the client read
  the query and immediately `history.replaceState` it away, which still sends the text to the server
  once; or use `POST` intercepted by a service worker, which is private but adds a service worker.
  Shared URLs (rather than text) can map straight to `?url=`.

---

## 8. iOS Safari: momentum scroll capture over the bottom drawer (#603)

**Status:** deferred edge case (accepted iOS platform limitation for now).

When a user flicks the mobile reading passage (`body.body-reader`) and, while the document is still
gliding with momentum, swipes inside the fixed bottom drawer (`.drawer`), iOS Safari routes that
swipe to the decelerating document rather than the drawer's inner scroller. Because the captured
swipe releases with fresh momentum, repeated swipes in the drawer keep re-accelerating the main
passage in a loop until the user either waits for the glide to finish or taps once without dragging.

- **Root Cause**: In WebKit2 on iOS/iPadOS, while the root document scroller (`WKScrollView` in
  Safari's UIProcess) has `isDecelerating == true`, UIKit intercepts any new touch anywhere in the
  viewport at the native OS layer to catch or continue the moving page. During this capture, WebKit
  suppresses DOM `pointerdown` and `touchstart` events across the entire window (verified via raw
  window-level capture counters on iPadOS Safari), so the page gets neither an event target nor
  touch coordinates for the captured gesture.
- **Shipped Mitigation**: Added `overscroll-behavior: contain` to `.drawer`, `.reader-panel-card`,
  `.reader-toc-list`, and the embedded dictionary root (`html:has(> body.body-embedded)`,
  `body.body-embedded`) so boundary scroll chaining at the top/bottom of drawer views no longer leaks
  to the host passage across browsers.
- **Verified on iPhone and iPad (`debug-repro` harness; iPadOS Safari reproduces identically)**:
  - **Drawer `pointerdown` / `touchstart` halts do not fire**: Because UIKit suppresses DOM touch
    events while `document.scrollingElement` is decelerating, handlers attached to `pointerdown` or
    `touchstart` never run on a captured swipe.
  - **`<iframe>` isolation does not help**: Hosting the drawer content in a same-origin `<iframe>`
    (`layout=doc&drawer=iframe`) is still captured by the gliding root document.
  - **`layout=pane` fixes the capture completely, but loses URL-bar collapse**: Scrolling the passage
    inside `.reader-main-column` (with `body.body-reader` set to `height: 100dvh; overflow: hidden`
    and `.app-bar` scrolling inside `.reader-main-column`) eliminates the bug because the decelerating
    scroller is a child `WKChildScrollView` sibling of `.drawer` rather than the root `WKScrollView`.
    However, because `document` no longer scrolls, Safari's URL bar (~8–10% of screen height on
    iPhone) never auto-collapses, which is too steep a UX cost for all mobile reading sessions.
  - **Origin-touch coast tracking can detect and break the loop**: The initial flick on the passage
    _does_ fire `touchstart` and `touchend`, and `window` `scroll` events continue firing every frame
    during the coast and during any captured swipe. By tracking `scroll` deltas while no finger is
    reported down (`after touchend`), a captured swipe is visible as a post-coast direction reversal,
    pause-then-move, or re-acceleration (`accel`), and locking `overflow: hidden` (or pinning
    `window.scrollTo(0, y)`) for ~`180–220ms` inside the `scroll` handler breaks the momentum loop so
    the next swipe reaches the drawer.
  - **False-positive constraints on `accel` detection**: Because iOS hides touch coordinates during a
    coast, a mid-coast `accel` on the drawer looks identical in `scroll` events to (a) a user's finger
    briefly skimming off and back onto the glass at the tail of a single long swipe, or (b) an
    intentional double-flick on the main passage to scroll faster. Unconditionally freezing scroll on
    `accel` would therefore interrupt intentional fast scrolling of the main passage while the drawer
    is open.
- **Future Options if Re-opened**:
  1. **User-education tooltip / toast (lowest risk)**: Instead of freezing scroll on `accel`, use
     origin-touch coast tracking to detect when a user is caught by the bug and show a one-time
     (or `localStorage`-capped) toast above the drawer (_"Tip: tap once to stop the passage before
     scrolling the panel"_). To avoid false positives on `Main Swipe → Intended Main Accel Swipe →
Drawer Swipe`, gate the toast on a coast that saw `> 180ms` post-`touchend` re-acceleration or
     reversal _and_ ended either via an abrupt tap-halt (velocity dropping from mid-speed to `0`
     without normal exponential decay) or multiple consecutive mid-coast accelerations followed
     immediately (`< 250ms`) by a `touchstart` inside `.drawer`.
  2. **Selective coast-breaker**: Only trigger the `200ms` scroll lock after `2+` consecutive
     mid-coast re-accelerations (or direction reversal) with a `> 180ms` post-`touchend` cooldown
     and significant prior decay (`speed < 0.65 × peakSpeed`), so a single long swipe or a single
     follow-up flick on the passage is never interrupted, while repeated frustrated swipes in the
     drawer break out of the loop automatically.

---

## 9. Popover preview for translation (and text) notes

**Status:** not started.

Main-body notes work well in the companion panel (`#panel-view-notes`) because the Latin passage and
the note stay visible side by side. Translation notes live inside the companion panel itself
(`#panel-view-translation`), so following a marker either scrolls away from the passage being read or
switches context inside the same panel (whereas V1 rendered notes in tooltips).

- **Corpus properties**:
  - Notes never contain nested notes.
  - Notes are usually short glosses, but occasionally multi-sentence or paragraph-length.
  - Some works have very high note density (see §1), so duplicating note bodies in HTML for both a
    popover and a panel list would bloat payloads and DOM size.
- **Recommended Approach (Option A — JS-only shared popover enhancement)**:
  - **No-JS baseline**: Keep the current single-copy markup (`<a class="reader-note-ref" href="#note-...">`
    jumping to the rendered note list). If tabs are CSS-driven, `:has(:target)` can also reveal the
    containing tab automatically.
  - **JS enhancement**: Maintain a single shared popover element. Clicking a `.reader-note-ref`
    copies the target `#note-*` body from the existing DOM into the popover and anchors it to the
    marker (or presents it as a bottom sheet on narrow/touch screens).
  - **Long notes**: Cap the popover's height with a bottom fade and a `"Continue in notes panel →"`
    link that jumps to the full note in the panel.
  - **Unified model**: Consider using the same quick-peek popover for main-body notes (`#note-n*`)
    as well, so all notes share one mental model (popover for a quick look, panel for reading at
    length).
- **Alternative (Option B — Native `popover` as the only copy)**:
  - Render translation notes only as native declarative `popover` elements (`popovertarget`) with no
    separate footnote list, scrolling in place when a note exceeds `max-height`.
  - **Trade-offs**: Avoids content duplication and gives No-JS readers popovers too, but loses the
    panel view for reading long notes comfortably (especially on phones).
