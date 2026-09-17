# V1 SPA vs V2 Progressively Enhanced SSR: Reader Feature Parity

This document outlines the remaining feature gaps between the **V1 UI (SPA)** (`src/web/client/pages/library/`) and the **V2 UI (Progressively Enhanced SSR)** (`src/web/v2/reader/`), focusing on capabilities previously present in V1 that are still missing or degraded in V2.

> **Note on Intentional Architecture Decisions**:
>
> - **Unified Responsive Layout**: V1 offered several mobile layout preferences. V2 unifies on a desktop resizable splitter (`ReaderLayoutController`) plus a mobile bottom drawer (`DrawerController`), matching the approach already taken in `dict/`.
> - **In-Work Text Search Was Never Shipped**: V1 declares a `TextSearch` sidebar tab but leaves it commented out (`reader.tsx:L332`). It is a _planned_ feature in both UIs, not a V2 regression — do not file it as one.

> [!IMPORTANT] > **Open question, not a settled decision**: the replacement of V1's translation sidebar tab with V2's two-column parallel view is **not** yet agreed to be an upgrade. It is better for some works and clearly worse for others. See [§2.9](#29-open-question-parallel-view-vs-translation-sidebar) before treating the current design as final.

---

### 1. Remaining Gaps Matrix

| Feature Area                      | V1 UI (SPA)                                                                                      | V2 UI (SSR + Progressive Enhancement)                                                       | Parity Status          |
| :-------------------------------- | :----------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------ | :--------------------- |
| **Critical Apparatus Notes**      | `TextNote` resolves `work.notes[i]` and renders a tooltip                                        | Markers link to per-page numbered footnotes rendered after the passage; no JS required      | ✅ **Completed in V2** |
| **Text Rendition / Verse Layout** | CSS-in-JS rules for `.l`, `.blockquote`, `.indent`; handles `overline`, `rend="7"`, `rendParent` | All emitted rendition classes styled in `reader_text.css`, including `rendParent`           | ✅ **Completed in V2** |
| **In-Flow "Edit and Report"**     | Section anchor opens a menu offering Copy link **and** Edit and Report                           | Section anchor copies the URL immediately; no menu, no `contenteditable`, no `userEdit`     | ❌ **Missing in V2**   |
| **External Content Reader**       | Paste text or scrape a URL, then read it with full dictionary support                            | No equivalent route or component                                                            | ❌ **Missing in V2**   |
| **Saved Reading Position**        | `LibrarySavedSpot` persists last section per work; library offers resume                         | Bi-directional `LIBRARY_SPOTS` persistence in reader + corner resume badge on library cards | ✅ **Completed in V2** |
| **Swipe / Tap Page Navigation**   | Touch swipe paging with a progress overlay (`SwipeFeedback`)                                     | Arrows, `[` / `]` shortcuts, and footer continuation cards only                             | ❌ **Missing in V2**   |
| **Per-Work Macra Preference**     | Stored per work (`macronButton-${workId}`)                                                       | Scoped per work via `macronButton-${workId}`                                                | ✅ **Completed in V2** |
| **Translation Presentation**      | Independently scrollable `Translation` sidebar tab                                               | Two-column parallel view, linkable via `?view=parallel`; columns share one scroll           | ❓ **Open Question**   |
| **Outline / Table of Contents**   | `Outline` sidebar tab (`WorkNavigationSection`)                                                  | Anchored TOC drawer with live filter (`ReaderTocController`), `:target` No-JS fallback      | ✅ **Completed in V2** |
| **Embedded Dictionary**           | Dictionary sidebar tab                                                                           | Resizable split panel (desktop) / draggable bottom drawer (mobile) with embedded iframe     | ✅ **Completed in V2** |
| **Section Label Visibility**      | `LabelsButton` toggling `hideLabels`                                                             | `showGutter` preference in reader settings                                                  | ✅ **Completed in V2** |
| **Client-Side Page Navigation**   | Whole work fetched once; page turns are in-SPA state changes with no document reload             | Every page turn is a full document load; no partial swap exists despite the README claim    | ❌ **Missing in V2**   |

---

## 2. Detailed Gap Analysis

### 2.1. Critical Apparatus Notes

Shipped. The note bodies now reach the page, and the markers that carry them are links rather than dead controls.

- **V1 (`reader.tsx:L1141-1166`)**: `TextNote` reads the `noteId` attribute, looks up `work.notes[i]`, and renders the note body in a toggleable tooltip via `renderTooltip`.
- **V2**: notes travel the whole pipeline:

  1. [`process_work.ts:L435-462`](../../../common/library/process_work.ts) (shared by both UIs) hoists note bodies into a work-level `notes` array and leaves positional `<note noteId="N"/>` markers in the tree. Unchanged.
  2. [`v2_preprocessor.ts`](../../../common/library/v2/v2_preprocessor.ts) resolves each marker against that array while rendering a page, emitting `<a class="reader-note-ref" href="#note-n3"><sup>3</sup></a>` and accumulating the bodies it referenced.
  3. Those bodies are rendered into [`V2PreprocessedPage.notesHtml`](../../../common/library/v2/v2_types.ts) as an endnote list, which [`reader.server.ts`](reader.server.ts) places between the passage and the pagination footer.

**Design decisions worth knowing before changing this:**

- **Numbered footnotes, not tooltips.** At ~12 notes per page (Ammianus) a per-marker tooltip does not scale, and a list in page flow is the scholarly convention, prints, and works with no JavaScript. A synchronized Notes _panel_ remains the intended JS enhancement — see [`UX_STRUCTURE.md`](UX_STRUCTURE.md) §6 — but it is now an enhancement over a working baseline rather than the only way to read the apparatus.
- **Markers are renumbered per page**, not per work: a page opening at work-level note 2,314 still labels its first marker "1". The `noteId` in the source data remains work-global; only the display label and the DOM ids are page-scoped.
- **Translation notes are lettered** (`a`, `b`, …) and listed under their own subheading, so a parallel row never shows two unrelated markers both labelled "3". Six of the translated works carry notes of their own (465 in Vergil's, 363 in another), which is why this case is handled rather than dropped.
- **A marker with no resolvable body renders nothing at all.** Emitting a marker that points nowhere is the defect this replaced.

**Result across `build/library_processed/*.v2.json.gz`:**

| Metric                                    |               Before |                 After |
| :---------------------------------------- | -------------------: | --------------------: |
| Note markers shipped                      |               85,876 |                85,876 |
| ...of them inert `<button>` dead controls |               85,876 |                 **0** |
| Note bodies reaching the reader           |                **0** |            **85,876** |
| Works affected                            |                   48 |                    48 |
| Ammianus _Res Gestae_ (`14.1`)            | 13 markers, 0 bodies | 13 markers, 13 bodies |

> [!WARNING] > **Pliny is the one work where this is expensive.** _Naturalis Historia_ paginates one whole book per page and carries 69,113 of the 85,876 notes, so its worst page now ships ~1.3 MB of footnotes on top of ~0.5 MB of text. The median page across the corpus has **4** notes and the 90th percentile has **10**; only Pliny's 37 pages are pathological, and the root cause is the pagination depth, not the apparatus. Deferred for future pipeline tuning once note presentation is finalized.

**Content recovered** is genuine editorial commentary, not just sigla — e.g. _"These summaries, which are not the work of Ammianus but of some early editor, are put for convenience at the beginning of each chapter…"_

### 2.2. External Content Reader

- **V1 (`external_content_reader.tsx`, `external_content_storage.tsx`)**: A separate reader accepting pasted text or a scraped URL (`ScrapeUrlApi`), persisting saved documents locally (`useSavedExternalContent`) and offering the same word-lookup affordances as the library reader.
- **V2**: ❌ **Missing**. No route, component, or storage equivalent exists under `src/web/v2/`.

### 2.3. Saved Reading Position

**Shipped.** Bi-directional parity with V1's `LIBRARY_SPOTS` is now implemented across reader and library views without regressions.

- **V1 (`saved_spots.ts`)**: `LibrarySavedSpot` maps `workId → { sectionId: string }` in `localStorage` under `LIBRARY_SPOTS`, letting the library page offer "resume where you left off".
- **V2 (`saved_spots.client.ts`, `reader_view.client.ts`, `library_view.client.ts`)**:
  - `savedSpotsStore` provides typed, validated reading spot persistence using the exact same `LIBRARY_SPOTS` key and schema as V1 for seamless interoperability across versions.
  - Reader automatically records spots on mount, page turns, and section anchor clicks.
  - Reader routes accept `?jump=<secId>` and redirect with the fragment identifier (`#sec-<secId>`) for instant in-page anchoring.
  - Library view client-side progressively enhances work cards when a saved spot exists: prepends an unobtrusive corner badge (`§ X.Y saved`) and repoints card navigation directly to the jump URL.

### 2.4. Swipe / Tap Page Navigation

- **V1 (`reader.tsx:L286-310, L417-452`)**: Touch swipe paging with a live progress overlay (`SwipeFeedback`) showing direction and a "Release to turn" threshold, plus tap-zone navigation and an explanatory `NavigationInfoBlurb`.
- **V2**: ❌ **Missing**. Page turns are available via the sticky bar arrows, the `[` / `]` keyboard shortcuts, and the footer continuation cards, but there is no touch gesture support.

### 2.5. Work Attribution & Provenance

- **V1 (`reader.tsx:L960-1009`)**: `WorkInfo` and `SourceRefInfo` render inside a persistent `Attribution` sidebar tab, alongside the dictionary and outline.
- **V2 (`reader_dialogs.server.ts:L8-82`)**: ⚠️ **Degraded**. The same fields are rendered into a `<dialog>` opened only through `setupModalDialog`. Consequences:
  - A `<dialog>` without `open` is `display: none` per the UA stylesheet, so with JavaScript disabled the block is **present in the HTML but unreachable**.
  - Dialog content does not appear in print output.
  - This includes the license line, which [`v2_preprocessor.ts:L275-281`](../../../common/library/v2/v2_preprocessor.ts) sets to `"Creative Commons Attribution-ShareAlike 3.0"` for all Perseus texts. Attribution for a CC BY-SA work should not depend on JavaScript.

### 2.6. Per-Work Macra Preference

**Shipped.** V2 now stores macra visibility per work matching V1's `macronButton-${workId}` localStorage schema seamlessly.

- **V1 (`reader.tsx:L627-648`)**: `MacronButton` persists per work under `macronButton-${workId}` (wrapped in `{ w: boolean }` RPC envelope, default: `off` / `false`).
- **V2 (`reader_settings.client.ts`, `reader_view.client.ts`, `storage.client.ts`)**:
  - `storage.getBoolean` and `setBoolean` support both raw string booleans and legacy V1 `{ w: boolean }` envelopes for seamless cross-version compatibility.
  - `getWorkMacra(workId)`, `setWorkMacra(workId, show)`, and `removeWorkMacra(workId)` directly access `macronButton-${workId}`.
  - `showMacra` is **not** stored in global `morcus_reader_settings` (which strictly tracks global layout/font preferences), eliminating dead or cross-contaminating state.
  - **Intentional default flip**: V1 defaulted macra to `off` (`false`). V2 defaults to `on` (`true`) to match server-side rendered text and avoid a jarring Flash of Modified Content on client hydration.
  - Reset Defaults cleans up the per-work override in storage and restores defaults.
  - **Server-side omission on non-macronized editions**: For texts lacking vowel length markings in source data (`work.hasMacra === false` across 101 of 126 works), `renderReaderSettingsDialog({ hasMacra })` omits the toggle row entirely from the server HTML, avoiding displaying an inoperable control. Client hydration and text processing also bypass macra DOM mutations when `data-has-macra="false"`.

### 2.7. Text Rendition & Verse Layout

**Shipped.** The preprocessor always preserved the rendition semantics; nothing downstream consumed them. [`reader_text.css`](reader_text.css) §5 now does.

Ovid, _Amores_ 1.1.1–2 used to render as a redundant nest with no styling behind it:

```html
<!-- before -->
<span class="reader-line">Arma gravi numero violentaque bella parabam</span>
<span class="reader-line"
  ><span class="reader-line indent"
    >Edere, materia conveniente modis.</span
  ></span
>

<!-- after -->
<span class="reader-line">Arma gravi numero violentaque bella parabam</span>
<span class="reader-line indent">Edere, materia conveniente modis.</span>
```

- **V1 (`styles.tsx:L795-830`)**: the equivalent rules lived in CSS-in-JS, e.g. `".readerMain .blockquote": { display: "block", … }` and `".readerMain .block .l": { display: "block" }`, with parallel `.readerSide` variants.
- **V2**: every emitted class now has a rule, scoped under `.reader-passage` so the generic names (`italic`, `bold`, `indent`) cannot leak into the dictionary views that share the stylesheet. Lengths are in `em`, so indentation tracks the reader's font-size preference rather than ignoring it.

Three behaviours that V1 had were also restored **in the preprocessor**, not just in CSS:

| `rend` value         | V1                                                                    | V2 now                                                        |
| :------------------- | :-------------------------------------------------------------------- | :------------------------------------------------------------ |
| `overline`           | `text-decoration: overline`                                           | Same, via an `overline` class (901 occurrences, all numerals) |
| `"7"`                | Mapped to uppercase                                                   | Mapped to the `smallcaps` class (129 occurrences)             |
| `rendParent === "p"` | Indents only the **first line** for paragraphs, whole block otherwise | Same, via an extra `indent-para` class                        |

> [!NOTE]
> One deliberate divergence from V1: `smallcaps` renders as `font-variant-caps: small-caps` rather than `text-transform: uppercase`. The affected text is inscriptional and legal quotation that the source sets in lowercase (`pro consvle`, `tribvno plebi`), which is exactly what small caps is for. `rend="uppercase"` — two occurrences, both an epitaph — keeps the uppercase transform and now has its own class instead of being folded into `smallcaps`.

Also fixed while here: the redundant nested `reader-line` span above, and the `blockquote` rendition, which emitted a real `<blockquote>` inside the wrapping `<p class="reader-paragraph">`. That is invalid HTML and the browser silently reparents it; it is now a `<span class="blockquote">` made block-level by CSS, as it was in V1.

### 2.8. In-Flow "Edit and Report"

- **V1 (`tooltips.tsx:L215-256`)**: the section-header anchor opens a `TooltipMenu` with a **Copy link** item and, when `idToEdit` is set, an **Edit and Report** item. `onEditRequest` sets `contenteditable="true"` on the target element and focuses it; on `blur` it diffs the original against the edited `innerText` and, if changed, calls `reportIssue({ original, edited, sectionId }, ["userEdit"])`. Wired up from `reader.tsx:L744`, `reader.tsx:L1057` (`WorkChunkHeader`), and `external_content_reader.tsx:L213`.
- **V2**: ❌ **Missing**. There is no `contenteditable` and no `userEdit` tag anywhere under `src/web/v2/`.

The blocker is structural rather than mechanical. V2 already has a general feedback surface in [`report_dialog.client.ts`](../dialog/report_dialog.client.ts) (`morcus-report-dialog`), but [`reader_view.client.ts:L213-220`](reader_view.client.ts) handles `a.section-anchor` clicks by calling `navigator.clipboard.writeText(fullUrl)` **immediately, with no menu**. So there is presently nowhere to hang a second per-section action — restoring this feature means first giving the section anchor a small menu, which is a UX decision, not just a port.

> [!NOTE]
> The value of this feature is that it captures the correction _in context_ with the exact section ID and the before/after text, which a generic feedback dialog cannot do. Typo reports that require the reader to describe where the typo is are reports that mostly do not get filed.

### 2.9. Open Question: Parallel View vs Translation Sidebar

**Status: unresolved.** This was previously recorded here as a settled upgrade. It is not. The parallel view is genuinely better for line-aligned verse and genuinely worse for chapter-granularity prose, and the current design offers no way to opt into the other behaviour.

- **V1 (`reader.tsx`)**: translations lived in a `Translation` sidebar panel — a **separately scrolling** surface next to the text.
- **V2 ([`v2_preprocessor.ts:L221-238`](../../../common/library/v2/v2_preprocessor.ts), [`reader_text.css:L305-314`](reader_text.css))**: each section becomes one CSS-grid row, `grid-template-columns: 1fr 1fr`, Latin left and English right, inside the normal document flow. On mobile ([`reader_text.css:L384-392`](reader_text.css)) the same row becomes `flex-direction: column` — Latin stacked above English.

**Two structural consequences follow directly from that markup, and neither is tunable today:**

1. **The columns cannot scroll independently.** They are grid cells in one document, not two scroll containers. The pairing is re-synchronized at every section boundary, which is why alignment never _drifts_ — but it also means the only unit of alignment available is the citation section, whatever size that happens to be.
2. **Row height is `max(latin, english)`.** Whichever column is shorter is padded with whitespace to the bottom of the row.

**Measured over every work that currently has a translation** (`build/library_processed/`, character counts of rendered text):

| Work                        | Verse | Sections / page | Avg Latin | Avg English | Eng ÷ Lat | Largest single row (Lat / Eng) |
| :-------------------------- | :---- | --------------: | --------: | ----------: | --------: | -----------------------------: |
| Ovid, _Amores_              | yes   |            47.3 |        88 |          54 |  **0.61** |                       124 / 91 |
| Livy, _Ab Urbe Condita_     | no    |            11.5 |       223 |          95 |  **0.42** |                    583 / 1,192 |
| Cicero, _De Lege Agraria_   | no    |            51.0 |       679 |         926 |  **1.36** |                  1,160 / 1,684 |
| Cicero, _Laelius_           | no    |         **1.0** |       648 |         832 |  **1.28** |                  1,166 / 1,637 |
| Cicero, _Pro Rabirio_       | no    |         **1.0** |       673 |         882 |  **1.31** |                  1,475 / 1,910 |
| Sallust, _Bellum Catilinae_ | no    |         **1.0** |     1,295 |       1,754 |  **1.35** |              **7,053 / 9,977** |

This confirms both of your observations and adds a third:

- **Prose English is systematically longer than the Latin** — 1.28× to 1.36×, remarkably consistent across four independent works. So in prose the right column essentially _always_ overruns the left, and every row ends with dead whitespace under the Latin. (Verse inverts this: Amores runs 0.61.)
- **Section size is the real variable, and it is set by the edition, not by us.** Amores pairs a single verse line (88 chars) with a single translated line (54) — the parallel view is excellent here. Sallust pairs an entire chapter with an entire chapter: **one grid row holding 7,053 characters of Latin beside 9,977 characters of English**. On a 390px phone that one section stacks to something on the order of forty screenfuls of Latin followed by forty of English. Seeing a sentence next to its translation is not merely inconvenient there; it is impossible.
- **Three of the six translated works have exactly one section per page**, so for half the corpus "parallel view" degenerates to "the whole chapter, then the whole chapter again".

**Minor implementation notes** surfaced while measuring, worth fixing regardless of how the larger question resolves:

- The translator credit (`<span class="reader-trans-author">`) was originally emitted **once per section** — 20,296 times in Livy. It is now omitted entirely from the passage canvas to keep the parallel text clean, with the translator credit housed in the Info modal / bibliographical metadata.
- The translation join is an exact citation-ID match (`translationRowsByDotId.get(dotId)`) with **no fallback**: a translation whose citation granularity is coarser than the Latin's yields an empty English cell. No shipped work hits this today (0 blanks across all six), but nothing guards against it either, and the failure mode is silent.

**Options worth weighing (none chosen):**

| Option                                             | Helps with                                           | Costs                                                                         |
| :------------------------------------------------- | :--------------------------------------------------- | :---------------------------------------------------------------------------- |
| Keep parallel as-is                                | Verse, and any fine-grained citation scheme          | Unusable for chapter-granularity prose, especially on mobile                  |
| Restore a sidebar/drawer panel as a **third** view | Independent scrolling; long sections                 | A third view mode to explain; competes with the dictionary for the panel      |
| Per-section disclosure (translation under Latin)   | Mobile; keeps pairing local                          | Loses at-a-glance comparison; extra interaction per section                   |
| Sub-section alignment (sentence-level pairing)     | The root cause — makes rows small regardless of work | Needs real alignment data; a data problem, not a CSS one                      |
| Choose the default per work from measured ratio    | Cheap; uses data we already compute                  | Heuristic; a reader on a 27" monitor and one on a phone want different things |

> [!NOTE]
> The dictionary panel already solves the "independently scrollable companion surface" problem on both form factors (`ReaderLayoutController` splitter + `DrawerController`). If a sidebar translation returns, it should almost certainly reuse that machinery rather than introduce a third layout pattern — which also means the two features would be competing for the same panel, and that competition is itself part of the open question.

### 2.10. Client-Side Page Navigation

- **V1 (`reader.tsx:L179`, `L125-135`)**: the work was fetched **once** on mount into `useState`, and every page turn after that — arrows, TOC entries, `navigateToSection` — was an in-SPA state change routed through `router_v2`'s `nav.to`. No document reload, no refetch, and the dictionary sidebar's contents survived the turn.
- **V2**: ❌ **Missing**. Every page turn is a full document load. The sticky bar arrows and continuation cards are plain `<a href>`, the TOC entries likewise, and there is no `fetchAndSwapPartial` call anywhere under `src/web/v2/reader/`.

> [!WARNING] > [`README.md`](README.md) currently documents a "With JS: Partial Page Swap" branch in its request-lifecycle diagram, including an `X-Requested-With: fetch` round trip and a `history.pushState`. **That branch does not exist in the client.** The server half is real — [`reader_routes.server.ts`](reader_routes.server.ts) honours `isPartialRequest` and `renderReaderContentHtml` will happily return a fragment — but nothing ever asks it to.

So the infrastructure is half-built already: the route serves partials, and `fetchAndSwapPartial` exists in [`core/partial.client.ts`](../core/partial.client.ts) and is used elsewhere in V2. What is missing is the reader-side controller that intercepts the navigation links, swaps `<morcus-reader-view>`'s contents, and re-runs the enhancement passes.

The cost is not the fetch; it is that a swap invalidates everything hydrated against the old passage. Anything holding a node reference across the swap has to be re-established: tokenization (`enhancePassage`), the per-work macra pass, saved-spot recording, the TOC's active-page marker, and — once it lands — whatever the companion panel is holding. That argues for doing the swap **after** the panel work rather than before it, so there is one re-hydration contract to write instead of two.

---

## 3. Recommended Remediation Roadmap

### Done

- ~~**Port the rendition CSS**~~ — shipped, along with the missing `overline` / `rend="7"` / `rendParent` mappings and the redundant nested `reader-line` span (§2.7).
- ~~**Render note markers as links, not dead buttons**~~ — shipped; 0 dead controls remain (§2.1).
- ~~**Plumb note bodies into V2**~~ — shipped via page-scoped `notesHtml` (§2.1).
- ~~**Saved reading position**~~ — shipped; bi-directional V1 `LIBRARY_SPOTS` compatibility, reader auto-save on connect/turn/section anchor click, `#sec-*` jump anchoring, and progressive corner badge with direct jump in `/v2/library` (§2.3).
- ~~**Per-work macra scoping**~~ — shipped; scoped per work via `macronButton-${workId}` (§2.6).
- ~~**Omit macra toggle on non-macronized editions**~~ — shipped; server omits the toggle row when `work.hasMacra === false`, avoiding exposing a dead toggle on the ~80% of works without macra (§2.6).

- ~~**Omit translator credit from passage sections**~~ — shipped; previously emitted `<span class="reader-trans-author">` on every single section (20,296 times in Livy). Omitted entirely from the passage canvas to eliminate repetitive DOM nodes and visual clutter; translator attribution is housed cleanly in the Info modal / bibliographical metadata (§2.9).

### High Priority (Correctness / Dead Controls)

1. **Make attribution reachable without JavaScript** — move the provenance/license block into page flow (e.g. a colophon in `reader-passage-footer`) so it survives No-JS and appears in print.

### Medium Priority (Feature Restoration)

2. **Notes panel as the JS enhancement** — the footnote baseline is in place (§2.1), so the remaining work is the synchronized Notes tab: marker click reveals the note in the side panel without losing the reading position. Under JS the list is **relocated** into the panel rather than duplicated, so the in-flow footnotes remain the No-JS path only. This is the first real content for the panel model in [`UX_STRUCTURE.md`](UX_STRUCTURE.md) §6.
3. **Restore in-flow Edit and Report** — introduce a small menu on `a.section-anchor` (Copy link / Edit and Report) and port `onEditRequest` plus the `["userEdit"]` report tag. Blocked on the menu decision, not on the reporting plumbing, which already exists.

### Low Priority (Larger Scope)

6. **Swipe / tap navigation** — requires touch gesture handling; `DrawerController` already contains comparable drag/velocity logic to borrow from.
7. **External content reader** — the largest missing surface, and effectively a new vertical slice rather than a port.
8. **Client-side page navigation (§2.10)** — restore SPA-feel page turns by intercepting the pager, TOC, and continuation links and swapping the passage via the partial route that `reader_routes.server.ts` already serves. Sequence this **after** the notes panel: a swap invalidates every hydration pass held against the old passage, and doing it once with the panel in place means writing one re-hydration contract rather than two. Fix the `README.md` lifecycle diagram, which documents this as though it already exists.

### Cleanups (independent of any decision above)

8. **Guard the translation join** — `translationRowsByDotId.get(dotId)` fails silently to an empty cell when citation granularities differ; fall back to the nearest ancestor ID, or at minimum surface the mismatch at build time (§2.9).

### Blocked on a Product Decision

10. **Translation presentation (§2.9)** — do not build against the current parallel view as though it were final. The measurement in §2.9 is intended as input to that decision, not a recommendation.

### Deferred / Edge Cases (Post-Parity)

11. **Repaginate Pliny, _Naturalis Historia_** — deferred edge case; handling of notes is not a settled issue. Pliny paginates one whole book per page (identical to V1) and contains 69,113 notes. Under the zero-JS footnote baseline, this inflates page payload for Pliny's 37 books. Revisit in upstream data processing once overall note presentation is finalized.
