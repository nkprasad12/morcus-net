# V1 SPA vs V2 Progressively Enhanced SSR: Reader Feature Parity

This document outlines the remaining feature gaps between the **V1 UI (SPA)** (`src/web/client/pages/library/`) and the **V2 UI (Progressively Enhanced SSR)** (`src/web/v2/reader/`), focusing on capabilities previously present in V1 that are still missing or degraded in V2.

> **Note on Intentional Architecture Decisions**:
>
> - **Unified Responsive Layout**: V1 offered several mobile layout preferences. V2 unifies on a desktop resizable splitter (`ReaderLayoutController`) plus a mobile bottom drawer (`DrawerController`), matching the approach already taken in `dict/`.
> - **In-Work Text Search Was Never Shipped**: V1 declares a `TextSearch` sidebar tab but leaves it commented out (`reader.tsx:L332`). It is a _planned_ feature in both UIs, not a V2 regression — do not file it as one.

> [!IMPORTANT] > **Open question, not a settled decision**: the replacement of V1's translation sidebar tab with V2's two-column parallel view is **not** yet agreed to be an upgrade. It is better for some works and clearly worse for others. See [§2.9](#29-open-question-parallel-view-vs-translation-sidebar) before treating the current design as final.

---

### 1. Remaining Gaps Matrix

| Feature Area                      | V1 UI (SPA)                                                                                      | V2 UI (SSR + Progressive Enhancement)                                                   | Parity Status          |
| :-------------------------------- | :----------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------- | :--------------------- |
| **Critical Apparatus Notes**      | `TextNote` resolves `work.notes[i]` and renders a tooltip                                        | Marker buttons render with correct `data-note-id`; note bodies never reach the client   | ❌ **Missing in V2**   |
| **Text Rendition / Verse Layout** | CSS-in-JS rules for `.l`, `.blockquote`, `.indent`; handles `overline`, `rend="7"`, `rendParent` | Preprocessor emits 12 rendition classes; **none of them have any CSS rule at all**      | ❌ **Missing in V2**   |
| **In-Flow "Edit and Report"**     | Section anchor opens a menu offering Copy link **and** Edit and Report                           | Section anchor copies the URL immediately; no menu, no `contenteditable`, no `userEdit` | ❌ **Missing in V2**   |
| **External Content Reader**       | Paste text or scrape a URL, then read it with full dictionary support                            | No equivalent route or component                                                        | ❌ **Missing in V2**   |
| **Saved Reading Position**        | `LibrarySavedSpot` persists last section per work; library offers resume                         | No equivalent                                                                           | ❌ **Missing in V2**   |
| **Swipe / Tap Page Navigation**   | Touch swipe paging with a progress overlay (`SwipeFeedback`)                                     | Arrows, `[` / `]` shortcuts, and footer continuation cards only                         | ❌ **Missing in V2**   |
| **Work Attribution / Provenance** | Persistent `Attribution` sidebar tab (`WorkInfo`, `SourceRefInfo`)                               | `<dialog>` modal opened only via JS; unreachable with no JS and absent from print       | ⚠️ **Degraded in V2**  |
| **Per-Work Macra Preference**     | Stored per work (`macronButton-${workId}`)                                                       | Single global `showMacra` in `morcus_reader_settings`                                   | ⚠️ **Degraded in V2**  |
| **Translation Presentation**      | Independently scrollable `Translation` sidebar tab                                               | Two-column parallel view, linkable via `?view=parallel`; columns share one scroll       | ❓ **Open Question**   |
| **Outline / Table of Contents**   | `Outline` sidebar tab (`WorkNavigationSection`)                                                  | Anchored TOC drawer with live filter (`ReaderTocController`), `:target` No-JS fallback  | ✅ **Completed in V2** |
| **Embedded Dictionary**           | Dictionary sidebar tab                                                                           | Resizable split panel (desktop) / draggable bottom drawer (mobile) with embedded iframe | ✅ **Completed in V2** |
| **Section Label Visibility**      | `LabelsButton` toggling `hideLabels`                                                             | `showGutter` preference in reader settings                                              | ✅ **Completed in V2** |

---

## 2. Detailed Gap Analysis

### 2.1. Critical Apparatus Notes

**This is the largest single gap, and it is user-visible today as dead controls.**

- **V1 (`reader.tsx:L1141-1166`)**: `TextNote` reads the `noteId` attribute, looks up `work.notes[i]`, and renders the note body in a toggleable tooltip via `renderTooltip`.
- **V2**: ❌ **Missing**. The pipeline breaks in three places:

  1. [`process_work.ts:L435-462`](../../../common/library/process_work.ts) (shared by both UIs) hoists note bodies into a `notes` array on the work and leaves positional `<note noteId="N"/>` markers in the tree. This half works correctly for V2.
  2. [`v2_preprocessor.ts:L64-68`](../../../common/library/v2/v2_preprocessor.ts) emits `<button type="button" class="reader-note-ref" data-note-id="N"><sup>*</sup></button>` — the marker is correct and carries the right ID — but the `notes` array is **never copied onto `V2PreprocessedWork`**.
  3. [`V2PreprocessedPage.notesHtml`](../../../common/library/v2/v2_types.ts) is declared (`/** Critical apparatus notes for this page if available */`) and **never assigned**.

  There is additionally no client handler and no CSS for `.reader-note-ref`.

**Measured impact** (over `build/library_processed/*.v2.json.gz`):

| Metric                                       |                                         Value |
| :------------------------------------------- | --------------------------------------------: |
| Inert note buttons shipped to users          |                                    **85,876** |
| Works affected                               |                                        **48** |
| Ammianus _Res Gestae_ (`stoa0023.stoa001`)   | **2,525** markers across 216 pages (~12/page) |
| Note bodies present in V1 data for that work |                                     **2,526** |
| Note bodies reaching V2                      |                                         **0** |

> [!WARNING]
> The marker is a `<button type="button">` with no handler attached — a dead control repeated 85,876 times, and invisible to the No-JS baseline by construction. Changing it to `<a href="#note-N">` makes it functional with zero JavaScript once the note bodies are rendered into the page, and costs nothing.

**Content being dropped** is genuine editorial commentary, not just sigla — e.g. _"These summaries, which are not the work of Ammianus but of some early editor, are put for convenience at the beginning of each chapter…"_

### 2.2. External Content Reader

- **V1 (`external_content_reader.tsx`, `external_content_storage.tsx`)**: A separate reader accepting pasted text or a scraped URL (`ScrapeUrlApi`), persisting saved documents locally (`useSavedExternalContent`) and offering the same word-lookup affordances as the library reader.
- **V2**: ❌ **Missing**. No route, component, or storage equivalent exists under `src/web/v2/`.

### 2.3. Saved Reading Position

- **V1 (`saved_spots.ts`)**: `LibrarySavedSpot` maps `workId → sectionId` in `localStorage` under `LIBRARY_SPOTS`, letting the library page offer "resume where you left off".
- **V2**: ❌ **Missing**. Reader URLs are fully addressable, so the data model supports this trivially — the gap is purely the persistence and the resume affordance on the library page.

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

- **V1 (`reader.tsx:L627-648`)**: `MacronButton` persists per work under `macronButton-${workId}`, so macra can be shown for an unmacronized edition and hidden for a macronized one independently.
- **V2 (`reader_settings.client.ts`)**: ⚠️ **Degraded**. `showMacra` is a single global flag. Note that `hasMacra` already exists on `V2PreprocessedWork` (true only for `hypotactic` texts), so V2 has the metadata needed to scope or auto-default this per work.

### 2.7. Text Rendition & Verse Layout

**This is a pure CSS gap, not a data gap.** The preprocessor preserves the rendition semantics faithfully; nothing downstream consumes them.

Ovid, _Amores_ 1.1.1–2 renders in V2 as:

```html
<span class="reader-line">Arma gravi numero violentaque bella parabam</span>
<span class="reader-line"
  ><span class="reader-line indent"
    >Edere, materia conveniente modis.</span
  ></span
>
```

The pentameter correctly carries `indent`. It is simply never styled, so the elegiac couplet loses its traditional alternating indentation and reads as a flat block of equal-length lines.

- **V1 (`styles.tsx:L795-830`)**: the equivalent rules live in CSS-in-JS, e.g. `".readerMain .blockquote": { display: "block", margin: "0.25em 0", fontStyle: "italic", marginLeft: "1em" }` and `".readerMain .block .l": { display: "block" }`, with parallel `.readerSide` variants.
- **V2**: ❌ **Missing**. Every one of the twelve classes emitted by [`v2_preprocessor.ts:L41-110`](../../../common/library/v2/v2_preprocessor.ts) has **zero** matching rules anywhere under `src/web/v2/**/*.css`:

  `indent` · `reader-line` · `reader-block` · `line-space` · `reader-gap` · `reader-subheading` · `reader-list` · `superscript` · `smallcaps` · `blockquote` · `italic` · `bold`

  `.section-verse`, emitted on verse sections, is likewise unstyled — [`reader_text.css`](reader_text.css) only defines `.reader-gutter`, `.cite-prefix`, and `.hide-gutter`.

> [!NOTE]
> Verse lines still _appear_ to break correctly, but only by accident: each line is its own `.reader-section` div with its own citation gutter, so the block separation comes from the section wrapper rather than from `.reader-line`. Any structure where multiple rendition spans share a section — blockquotes, lists, sub-headings, inline emphasis — degrades to undifferentiated running text.

Three rendition behaviours are additionally dropped **before** CSS, in the preprocessor's `rend` mapping ([`v2_preprocessor.ts:L85-95`](../../../common/library/v2/v2_preprocessor.ts) vs `reader.tsx:L1215-1245`):

| `rend` value         | V1                                                                    | V2                             |
| :------------------- | :-------------------------------------------------------------------- | :----------------------------- |
| `overline`           | Rendered                                                              | Dropped silently               |
| `"7"`                | Mapped to smallcaps                                                   | Dropped silently               |
| `rendParent === "p"` | Indents only the **first line** for paragraphs, whole block otherwise | No `rendParent` concept exists |

**Minor oddity worth cleaning up while here**: the nested `<span class="reader-line"><span class="reader-line indent">` above is redundant markup from the same mapping.

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

- The translator credit (`<span class="reader-trans-author">`) is emitted **once per section** — 20,296 times in Livy — rather than once per page.
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

---

## 3. Recommended Remediation Roadmap

### High Priority (Correctness / Dead Controls)

1. **Port the rendition CSS** — add rules for the twelve emitted classes (and `.section-verse`) to `reader_text.css`, using `styles.tsx:L795-830` as the reference. This is the cheapest high-value fix in this document: it is self-contained, touches no data pipeline, needs no JavaScript, and repairs a text-quality regression that affects every verse work in the corpus. Fold in the missing `overline` / `rend="7"` mappings and drop the redundant nested `reader-line` span at the same time.
2. **Render note markers as links, not dead buttons** — change `v2_preprocessor.ts` to emit `<a href="#note-N">` so the marker is inert-but-honest today and functional the moment note bodies land. Small, independent, and removes 85,876 non-functional controls.
3. **Plumb note bodies into V2** — copy `notes` onto `V2PreprocessedWork` (or populate the existing `V2PreprocessedPage.notesHtml` stub, scoped per page to avoid shipping the whole array with every page). **The fix must start in the preprocessor**; wiring a client handler first has nothing to resolve against.
4. **Make attribution reachable without JavaScript** — move the provenance/license block into page flow (e.g. a colophon in `reader-passage-footer`) so it survives No-JS and appears in print.

### Medium Priority (Feature Restoration)

5. **Note presentation** — at ~12 notes per page, V1's per-marker tooltip does not scale. Prefer numbered footnotes at the end of the passage for the No-JS baseline (the scholarly convention, and printable), enhancing to a synchronized notes surface for JS users. This is the first case that justifies giving the reader's side panel a second tab.
6. **Restore in-flow Edit and Report** — introduce a small menu on `a.section-anchor` (Copy link / Edit and Report) and port `onEditRequest` plus the `["userEdit"]` report tag. Blocked on the menu decision, not on the reporting plumbing, which already exists.
7. **Saved reading position** — restore `LibrarySavedSpot` equivalence and surface a resume link on the V2 library page.
8. **Per-work macra scoping** — key the preference by `workId`, or auto-default from the existing `hasMacra` flag.

### Low Priority (Larger Scope)

9. **Swipe / tap navigation** — requires touch gesture handling; `DrawerController` already contains comparable drag/velocity logic to borrow from.
10. **External content reader** — the largest missing surface, and effectively a new vertical slice rather than a port.

### Cleanups (independent of any decision above)

11. **Hoist the translator credit** — emit `reader-trans-author` once per page instead of once per section (§2.9).
12. **Guard the translation join** — `translationRowsByDotId.get(dotId)` fails silently to an empty cell when citation granularities differ; fall back to the nearest ancestor ID, or at minimum surface the mismatch at build time (§2.9).

### Blocked on a Product Decision

13. **Translation presentation (§2.9)** — do not build against the current parallel view as though it were final. The measurement in §2.9 is intended as input to that decision, not a recommendation.
