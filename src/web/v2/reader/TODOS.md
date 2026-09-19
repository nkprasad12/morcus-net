# Reader TODOs (`src/web/v2/reader/`)

Known follow-up architectural, performance, and ergonomic work for the library reader topic.
See [`README.md`](README.md) for how the directory is organized and [`FEATURE_PARITY.md`](FEATURE_PARITY.md)
for V1 → V2 parity gaps.

---

## 1. Guard the translation join

**Status:** not started.

In `reader.server.ts` / `v2_preprocessor.ts`, `translationRowsByDotId.get(dotId)` matches Latin
citation IDs with translation rows. When the granularity of translation divisions differs from the
Latin text, the lookup fails silently to an empty cell.

- **Proposed Solution**: Fall back to the nearest ancestor citation ID when an exact ID match is missing.
- At minimum, log or surface citation granularity mismatches during build-time preprocessing.

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
