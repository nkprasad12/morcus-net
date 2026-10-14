# Reader TODOs (`src/web/v2/reader/`)

Known follow-up architectural, performance, and ergonomic work for the library reader topic.
This includes remaining V1 → V2 gaps. See [`README.md`](README.md) for how the directory is organized.

---

## 1. Guard the translation join

**Status:** done.

In `reader.server.ts` / `v2_preprocessor.ts`, `translationRowsByDotId.get(dotId)` matches Latin
citation IDs with translation rows. When the granularity of translation divisions differs from the
Latin text, the lookup fails silently to an empty cell.

**Done:** `preprocessWorkToV2` now matches translations by page, as V1's `findMatchPage` did (with
a small `TRANSLATION_PAGE_ALIASES` table for `1.pr`/`38b`/`2.9a`-style id mismatches), and renders
the translation page's own rows; a page with no matching translation shows "No translation
available for this page." Remaining data gap: Watson's Sallust folds chapters 35 and 57 into the
ends of 34 and 56, so pages 35 and 57 show the empty state.

---

## 2. Repaginate Pliny, _Naturalis Historia_

**Status:** deferred edge case.

Pliny's _Naturalis Historia_ paginates one whole book per page and contains **69,113 of the corpus's 85,876 notes**.
Its largest chapter ships ~1.3 MB of footnotes on top of ~0.5 MB of Latin text.
The median page across the corpus has **4** notes; only Pliny's 37 pages are pathological.

- **Root Cause**: Source pagination depth (one entire book per page), not the apparatus pipeline itself.
- **Proposed Solution**: Upstream data preprocessing chunking in `process_work.ts` / `v2_preprocessor.ts` to
  subdivide Pliny's books into readable sections/chapters.

---

## 3. 3-panel split-pane view (Latin | English || Dictionary)

**Status:** not started (future workstation mode).

For deep parallel reading on wide desktop displays, explore a 3-panel reading workstation:

- **Left Column**: Latin original text.
- **Middle Column**: English parallel translation.
- **Right Column**: Embedded dictionary and inflection tools.

---

## 4. Zero-JS translation baseline support

**Status:** not started.

Currently, translations are loaded on demand via `/v2/reader/:author/:name/:page/translation` when
selecting the companion panel's Translation tab.

- For users with JavaScript disabled, explore an inline collapsible `<details>` fallback or server-rendered
  translation section in page flow, maintaining the Zero-JS baseline principle.

---

## 5. In-work passage text search

**Status:** not started.

The Table of Contents drawer already includes a live filter input.
Extend this capability to search passage text within the current work:

- Search Latin lemmas or exact strings across the preprocessed work rows.
- Display a list of matching section anchors with snippet previews for rapid in-work navigation.

---

## 6. External Reader: share links for pasted text

**Status:** idea, not scheduled. Beyond V1 parity (V1 has no equivalent).

Pasted texts live only in the browser that saved them (`?local=<key>` in `external/`), so sending that
link to someone else opens the "isn't saved in this browser" notice. URL imports already share fine
via `?url=`.

- **Proposal**: a "Copy share link" action that compresses the text (`CompressionStream("deflate-raw")`,
  base64url) into the fragment: `/v2/externalReader#t=<data>`. Browsers never send fragments to the
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

**Status:** root-caused and fixed upstream; local artifacts need a rebuild. Not a V2 bug.

In the V2 artifact for `hypotactic_Tristia_Ovid`, `sec-1.7.x` held the text of poem 1.8
(e.g. `sec-1.7.1` read "in caput alta suum…", which is 1.8.1; the corpus has "si quis habes
nostri…" for 1.7.1). About 40 _Tristia_ rows differed between the corpus and V2-rendered sections.

**Cause:** the Hypotactic source JSON numbered the eleven poems of _Tristia_ 1 as
`1..7, 7, 8, 9, 10`, and `process_hypotactic.ts` copies `poem number` verbatim, so `ProcessedWork2`
already had two `1.7` pages and 40 duplicate row ids; V2 and the corpus merely inherited them. The
same defect affected Horace _Epodes_ (`16, 16`, no 15) and Martial _De Spectaculis_ (the "b" poems
labelled `5, 15, 20, 24`).

**Done:** corrected the data in the `hypotactic` repo (commit `28bd282`: Tristia 1.8–1.11, Epode 15,
Spectacula 6b/16b/21b/25b) and added `assertUniqueIds` to `process_hypotactic.ts` so a future data
refresh fails the build instead of shipping colliding ids.

**Remaining:** push the `hypotactic` commit, then rebuild the processed library, the V2 artifacts
and the corpus (its `rowIds` carry the old numbering). Separately, `resolvePageInWork` in
`reader_loader.server.ts` picks the first page by `findIndex`, so a duplicated page id would be
unreachable by deep link; a defensive uniqueness check in `preprocessWorkToV2` would make that
failure loud if some other source ever produces one.
