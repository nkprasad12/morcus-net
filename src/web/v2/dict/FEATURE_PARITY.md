# V1 SPA vs V2 Progressively Enhanced SSR: Dictionary Feature Parity

This document outlines the remaining feature gaps between the **V1 UI (SPA)** (`src/web/client/pages/dictionary/`) and the **V2 UI (Progressively Enhanced SSR)** (`src/web/v2/dict/`), focusing on capabilities previously present in V1 that are still missing or degraded in V2.

> **Note on Intentional Architecture Decisions**:
>
> - **No-JS Definition Word Clicks**: In V2 SSR, definition text nodes are delivered as clean semantic HTML text without upfront server linkification. Latin word lookup enhancement is handled progressively on the client via `MorcusDictSearch.enhanceWords()`. This was an intentional performance and HTML payload optimization.
> - **No-JS Autocomplete**: Autocomplete suggestions are deliberately deferred to client-side JS enhancement (`/v2/api/completions` + `<morcus-dict-suggestions>`) without a No-JS `<datalist>` fallback.

---

### 1. Remaining Gaps Matrix

| Feature Area                           | V1 UI (SPA)                                                       | V2 UI (SSR + Progressive Enhancement)                                                                                                            | Parity Status                 |
| :------------------------------------- | :---------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------- |
| **Global Multi-Lexicon Entry Summary** | Top-level summary listing all matched entries across dictionaries | Pinned entry summary in TOC rail (desktop) and drawer (mobile) with chips                                                                        | ✅ **Completed in V2**        |
| **Embedded Reader View Options**       | `hideSearch`, `textScale`, `skipJumpToResult`, isolated settings  | Suppresses app bar & search bar, resolves drawer collision, adds inline lexicon badges, and syncs proportional `textScale` via `--v2-dict-scale` | ✅ **Completed in V2**        |
| **Desktop Table of Contents**          | Dedicated two-column sidebar (`.tocSidebar`)                      | Semantic, sticky two-column rail sidebar (`morcus-dict-toc`) flush at top                                                                        | ✅ **Completed in V2**        |
| **Mobile Drawer Layout**               | Draggable, resizable bottom drawer (`BottomDrawer`)               | Draggable, resizable bottom drawer (`morcus-dict-toc` + `DrawerController`)                                                                      | ✅ **Completed in V2**        |
| **Mobile Layout Preference**           | Setting toggling between "Drawer" and "Classic" single column     | Unified responsive layout (drawer on mobile, rail on desktop)                                                                                    | ℹ️ **Intentional Streamline** |

---

## 2. Detailed Gap Analysis

### 2.1. Entry Results & Navigation

1. **Top-Level Consolidated Entry Summary**:

   - **V1 (`dictionary_v2.tsx:L472-518`)**: `SummarySection` provided a global list of all matched headwords across all lexica at the top of the page, with `ToEntryButton` chips.
   - **V2 (`dict_toc.server.ts`, `dict_toc.css`)**: ✅ **Completed in V2**. Rather than consuming vertical space above the fold in the main reading column, multi-lexicon entry navigation is pinned at the top of the Table of Contents rail on desktop (`.v2-toc-entries-summary`) and the draggable bottom drawer on mobile. When `totalEntries > 1`, `hasDictToc` gates the TOC layout and renders compact entry chips (`.v2-toc-entry-chip`) displaying dictionary acronym badges and headwords with direct jump anchors (`#${entryAnchorId}`). On desktop this sticky rail remains accessible alongside definitions as the user scrolls; on mobile the chips wrap responsively inside the drawer. Local card header quick-jump links (`.v2-entry-nav`) continue to provide in-card navigation.

---

### 2.2. Embedded Reader Controls

1. **Embedded Reader Mode Options**:

   - **V1 (`dict_context.tsx`)**: Supported options for embedded contexts (e.g. reader drawers and popovers):
     - `hideSearch`: Suppressed search bar when space was constrained.
     - `textScale`: Scaled font sizes across definitions and icons.
     - `skipJumpToResult`: Suppressed auto-scrolling.
     - `embeddedInflectedSearch`: Decoupled inflection settings for reader embeds.
   - **V2 (`dict_page.server.ts`, `reader_view.client.ts`, `dictionary.css`)**: ✅ **Completed in V2**.
     - `embedded=1`: Automatically suppresses the site app bar, footer, and search bar (`hideSearch`), maximizing reading area in constrained iframe containers.
     - **TOC & Drawer De-duplication**: Suppresses the outer Table of Contents rail and mobile bottom drawer when embedded, eliminating "drawer-in-a-drawer" collisions with the Reader's native desktop sidebar and mobile draggable bottom sheet.
     - **Hairline Card Dividers & Inline Lexicon Badges**: Dictionary card headers collapse into slim hairline demarcation dividers (`.v2-dict-header-slim`), while each entry displays an inline lexicon origin badge (`.v2-dict-badge`, e.g. `[LS]`, `[OLD]`) directly in its segmented toolbar.
     - **Proportional Font Scaling (`textScale`)**: Reader settings modal provides a "Dictionary font size" stepper (70% to 140%). Scale is applied via the `--v2-dict-scale` CSS variable and `?scale=` query param (SSR rendered as `<style>:root { --v2-dict-scale: ...; }</style>`), scaling headwords, definitions, toolbars, inflections, subsection match notes, and attribution popovers.

---

### 2.3. Table of Contents & Responsive Layout

1. **Desktop Sidebar Table of Contents**:

   - **V1 (`dictionary_v2.tsx:L444-470`, `table_of_contents_v2.tsx`)**: Two-column layout on desktop with a dedicated `.tocSidebar`. Users could navigate hierarchical sections (ordinals, sense summaries) while reading definitions side-by-side.
   - **V2 (`dict_toc.server.ts`, `dict_toc.css`)**: ✅ **Completed in V2**. Renders a semantic, No-JS accessible Table of Contents rail. On wide viewports (>= 1080px), `.v2-results-layout.has-toc` displays a 240px sticky left rail sidebar alongside the primary reading column, sticking flush to the top edge of the viewport when scrolled down.

2. **Mobile Draggable Drawer (`BottomDrawer`)**:

   - **V1 (`dictionary_v2.tsx:L409-442`)**: On narrow viewports, ancillary outline content was housed in a draggable, height-adjustable bottom sheet.
   - **V2 (`dict_toc.server.ts`, `dict_toc.client.ts`, `dict_toc.css`)**: ✅ **Completed in V2**. Renders as a bottom sheet drawer docked at the viewport bottom, with native `<details>` Zero-JS baseline disclosure and progressive touch drag enhancement (`MorcusDictToc` + `DrawerController`) supporting snap points (54px peek, 48dvh default, 88dvh expanded) and keyboard accessibility.

3. **Mobile Layout Preferences**:

   - **V1 (`dictionary_search.tsx:L123-151`)**: Provided a setting allowing mobile users to choose between "Drawer" mode and "Classic" single-column mode.
   - **V2**: ℹ️ **Intentional Streamline**. Mobile unifies into the bottom-docked drawer pattern with a 54px peek handle, avoiding unnecessary setting complexity while preserving single-column content flow.

---

## 3. Recommended Remediation Roadmap

Prioritized enhancements for remaining gaps:

### Medium Priority (Enhancements)

1. **Table of Contents Scroll Tracking (Scroll-Spy)**:
   - Implement `IntersectionObserver` in `MorcusDictToc` to dynamically highlight the active sense/section in the TOC outline as the user scrolls the dictionary page, keeping the active item in view within the TOC scroll body. See `TODOS.md §7`.
