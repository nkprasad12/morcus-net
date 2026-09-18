# V1 SPA vs V2 Progressively Enhanced SSR: Reader Feature Parity

This document outlines the remaining feature gaps between the **V1 UI (SPA)** (`src/web/client/pages/library/`) and the **V2 UI (Progressively Enhanced SSR)** (`src/web/v2/reader/`), focusing on capabilities previously present in V1 that are still missing or degraded in V2.

> **Note on Intentional Architecture Decisions**:
>
> - **Unified Responsive Layout**: V1 offered several mobile layout preferences. V2 unifies on a desktop resizable splitter (`ReaderLayoutController`) plus a mobile bottom drawer (`DrawerController`), matching the approach already taken in `dict/`.
> - **In-Work Text Search Was Never Shipped**: V1 declares a `TextSearch` sidebar tab but leaves it commented out (`reader.tsx:L332`). It is a _planned_ feature in both UIs, not a V2 regression — do not file it as one.

> [!NOTE] > **Companion Panel Translation Shipped**: The legacy dual-column parallel layout has been retired. For translated works, translations are presented via an on-demand, independently scrollable **Translation** tab inside the companion panel. See [§2.9](#29-companion-panel-translation-tab) for architecture and future roadmap.

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
| **Translation Presentation**      | Independently scrollable `Translation` sidebar tab                                               | Companion panel `Translation` tab with on-demand lazy loading and native scrolling          | ✅ **Completed in V2** |
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

#### 2.1.1. Synchronized Notes Companion Panel (JS Progressive Enhancement)

**Shipped.** The JS enhancement (`reader_panel.client.ts`, `reader_panel.css`, wired into `reader_view.client.ts`) relocates footnotes into a synchronized companion tab panel:

1. **Eager Relocation on Connect**:
   - For pages with critical apparatus notes, the server-rendered `.reader-notes` subtree is eagerly moved into `#panel-view-notes` inside the companion panel.
   - For pages without notes, no tab strip is rendered, keeping the dictionary-only UI clean with 0 visual regression churn.
2. **Tab Arbitration Rules**:
   - **Rule A1 (Word Priority)**: Clicking any Latin word in the passage force-switches the companion panel back to the **Dictionary** tab and looks up the word.
   - **Rule A4 (Dismissal Reset)**: Dismissing the dictionary/panel resets the active tab back to **Dictionary** and clears active highlights.
3. **Synchronized Markers & Teaser Labels**:
   - Clicking `a.reader-note-ref` keeps the reader at their reading scroll position (`scrollY` unchanged), highlights the marker (`marker-active`), switches the panel to the Notes tab, and scrolls to/highlights the note (`note-active`).
   - Clicking backrefs in the panel (`a.reader-note-backref`) highlights the corresponding marker in the text.
   - Mobile bottom drawer updates its teaser label dynamically (`Note [1]` or `Notes (13)`).
4. **Keyboard Affordances & Accessibility**:
   - `n` / `N` toggles between the Dictionary and Notes tabs when notes exist.
   - Roving `tabindex` and arrow keys cycle tabs; Home/End jumps to first/last tab.
   - Keyboard activation (Enter/Space on marker) moves focus directly to the note in the panel; the companion container carries `role="tabpanel"` linked to the tab via `aria-labelledby`.

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

**Shipped.** Retired the inaccessible `<dialog class="reader-biblio-dialog">` modal in favor of the footnote adoption pattern:

- **No-JS Baseline**: Renders `#reader-work-about` as a native collapsed `<details>` at the bottom of the article and provides an anchor link directly next to the title in the header metadata (`<a href="#reader-work-about" class="reader-about-link" title="About this text" aria-label="About this text"><span aria-hidden="true">ⓘ</span></a>`). This keeps the bottom pagination cards unobtrusive while offering zero-JS jump navigation to the colophon and license.
- **JS Companion Tab**: `ReaderPanelController` adopts `#reader-work-about` into `#panel-view-about` as an `About` tab (`Dictionary` | `Notes` | `About`), available in both desktop sidebar and mobile bottom drawer.
- **Mobile Active Expands Pill**: Uses 12px (`0.75rem`) base font and custom feathered SVG icons (`book`, `notes`, `info`), collapsing inactive labels and expanding the active pill to prevent overflow on mobile.
- **Full V1 Scholarly Parity**: Carries `Author`, `Editor`, `Translator`, `Funder`, `Sponsor`, `ID`, `Source(s)`, and full provenance attribution notices (`ATTRIBUTION_MAP`), omitting preprocessor internal details like structural hierarchy.
- **Keyboard & Click Parity**: Clicking the header icon link or pressing `i` / `I` toggles the About tab without page scroll shift. Full ARIA tablist keyboard navigation (`ArrowLeft`/`ArrowRight`/`Home`/`End`).

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

### 2.9. Companion Panel Translation Tab

**Status: Shipped.** The dual-column parallel layout (`?view=parallel`, `.reader-parallel-content`, `.section-parallel`) and sticky bar `Single | Parallel` toggle have been retired.

Instead, translations are integrated directly into the reader's **Companion Panel** (`ReaderPanelController`):

1. **Strictly Single-Column Latin Baseline**: The primary reading canvas is always a single column of Latin text, preserving consistent typographic focus and reading rhythm across all works.
2. **Companion Panel 4th Tab**: For works with translations (`work.hasTranslation === true`), the companion panel adds a 4th tab: `[📖 Dictionary] [📝 Notes] [🌐 Translation] [ⓘ About]`.
3. **On-Demand Lazy Loading**: Initial SSR payloads carry **0 bytes** of translation markup. Selecting the `Translation` tab sends an asynchronous request to `/v2/reader/:author/:name/:page/translation`, caching results in memory per page.
4. **Native Scrolling & Page Synchronization**: The translation container scrolls natively (`overflow-y: auto`), preserved across tab switches on the same page and reset cleanly to top upon page navigation. During client-side page navigation (`swapPage`), if the Translation tab is currently active, the new page's translation is fetched in parallel with the page partial.
5. **Mobile Viewport Optimization**: Under the "Active Expands Pill" pattern on 390px screens, inactive tabs show only 14×14 icons while the active tab expands to show icon and label, comfortably fitting all 4 tabs (~184px total) without horizontal overflow.

#### Future Architecture Roadmap & Planned Enhancements

- `// TODO(reader-canvas): 3-panel split-pane view (Latin | English || Dictionary).` Dedicated multi-column desktop reading workstation for deep parallel study.
- `// TODO(reader-nojs): Zero-JS translation baseline support.` Inline collapsible `<details>` or server-rendered fallback for clients without JavaScript.
- `// TODO(reader-shortcuts): Unified companion panel keyboard shortcuts.` Global shortcut affordance to cycle through all companion panel views.

### 2.10. Client-Side Page Navigation

- **V1 (`reader.tsx:L179`, `L125-135`)**: the work was fetched **once** on mount into `useState`, and every page turn after that — arrows, TOC entries, `navigateToSection` — was an in-SPA state change routed through `router_v2`'s `nav.to`. No document reload, no refetch, and the dictionary sidebar's contents survived the turn.
- **V2**: ✅ **Shipped**. Restores fast in-place page navigation with progressive enhancement:
  - Clicks on pager arrows (`#pager-prev`, `#pager-next`), continuation cards, and TOC links are intercepted by `reader_view.client.ts`. External links, modified clicks (`ctrl`/`meta`/`shift`/`alt`), disabled arrows, and same-page hashes pass through unmodified.
  - Browser back/forward navigation (`popstate`) is intercepted and synchronized through `QueryParamSync` (`onNavigate` / `updatePath`).
  - Partial requests fetch only the `.reader-text-card` fragment (`X-Requested-With: fetch`), keeping payload sizes minimal.
  - Swaps DOM nodes via `fetchAndSwapPartial`, with a graceful 200ms ease-in opacity ramp affordance on `.reader-text-panel`.
  - Sticky bar controls (`#pager-prev`, `#pager-next`, and jump input) are patched in place without DOM re-creation, preserving focus and input states.
  - Table of Contents updates active item markers and auto-expands parent section `<details>` trees.
  - Embedded Notes are dynamically adopted (`adoptNotes`), recalculating count badges and gracefully defaulting to the Dictionary tab if a new page has no footnotes.
  - Full passage re-hydration occurs seamlessly: tokenization (`enhancePassage`), typography preferences, saved spots recording, and scroll restoration (top of passage or preserved scroll position on popstate).
  - Mobile dictionary/notes drawer is automatically minimized on page turn to let passage text shine.

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
- ~~**Notes panel as the JS enhancement**~~ — shipped; footnote marker clicks reveal and scroll to notes in the synchronized Notes tab of the companion panel / drawer, with dynamic note adoption across page turns (§2.1).
- ~~**Companion panel translation tab**~~ — shipped; retired dual-column parallel layout and sticky bar view toggle, added 4th tab to companion panel (`reader_panel.client.ts`), on-demand lazy loading endpoint (`/reader/.../translation`), and parallel fetch coordination on page turns (§2.9).
- ~~**Client-side page navigation**~~ — shipped; in-place partial swaps with progressive enhancement, sticky bar patching, TOC active synchronization, dynamic note adoption, and scroll restoration (§2.10).
- ~~**Make attribution reachable without JavaScript**~~ — shipped; retired biblio modal in favor of companion About tab and No-JS `<details>` colophon in page flow (§2.5).

### Medium Priority (Feature Restoration)

1. **Restore in-flow Edit and Report** — introduce a small menu on `a.section-anchor` (Copy link / Edit and Report) and port `onEditRequest` plus the `["userEdit"]` report tag. Blocked on the menu decision, not on the reporting plumbing, which already exists.

### Low Priority (Larger Scope)

3. **Swipe / tap navigation** — requires touch gesture handling; `DrawerController` already contains comparable drag/velocity logic to borrow from.
4. **External content reader** — the largest missing surface, and effectively a new vertical slice rather than a port.

### Cleanups (independent of any decision above)

5. **Guard the translation join** — `translationRowsByDotId.get(dotId)` fails silently to an empty cell when citation granularities differ; fall back to the nearest ancestor ID, or at minimum surface the mismatch at build time (§2.9).

### Deferred / Edge Cases (Post-Parity)

11. **Repaginate Pliny, _Naturalis Historia_** — deferred edge case; handling of notes is not a settled issue. Pliny paginates one whole book per page (identical to V1) and contains 69,113 notes. Under the zero-JS footnote baseline, this inflates page payload for Pliny's 37 books. Revisit in upstream data processing once overall note presentation is finalized.
