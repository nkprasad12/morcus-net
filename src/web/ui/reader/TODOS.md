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

## 5. Unified companion panel keyboard shortcuts

**Status:** not started.

Add keyboard shortcuts to switch directly between companion panel tabs (`Dictionary`, `Notes`, `Translation`, `About`) from the reading canvas.

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

## 8. Ovid _Tristia_: section content under the wrong id

**Status:** done. Not a V2 bug.

In the V2 artifact for `hypotactic_Tristia_Ovid`, `sec-1.7.x` held the text of poem 1.8
(e.g. `sec-1.7.1` read "in caput alta suum…", which is 1.8.1; the corpus has "si quis habes
nostri…" for 1.7.1). About 40 _Tristia_ rows differed between the corpus and V2-rendered sections.

**Cause:** the Hypotactic source JSON numbered the eleven poems of _Tristia_ 1 as
`1..7, 7, 8, 9, 10`, and `process_hypotactic.ts` copies `poem number` verbatim, so `ProcessedWork2`
already had two `1.7` pages and 40 duplicate row ids; V2 and the corpus merely inherited them. The
same defect affected Horace _Epodes_ (`16, 16`, no 15) and Martial _De Spectaculis_ (the "b" poems
labelled `5, 15, 20, 24`).

**Done:** corrected the data in the `hypotactic` repo (commit `28bd282765adf7aa317c67e728cc747f9d52803a`:
Tristia 1.8–1.11, Epode 15, Spectacula 6b/16b/21b/25b), pushed and pinned it in
`upstream_sources.lock.json`, rebuilt the library and corpus artifacts, and added uniqueness assertions
to both `process_hypotactic.ts` (`assertUniqueIds`) and `preprocessWorkToV2`
([`src/common/library/preprocess/work_preprocessor.ts`](../../../common/library/preprocess/work_preprocessor.ts))
so duplicate page IDs from any source fail loudly at build time.

---

## 9. iOS Safari: momentum scroll capture over the bottom drawer (#603)

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
