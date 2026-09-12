# V1 SPA vs V2 Progressively Enhanced SSR: Dictionary Feature Parity

This document outlines the remaining feature gaps between the **V1 UI (SPA)** (`src/web/client/pages/dictionary/`) and the **V2 UI (Progressively Enhanced SSR)** (`src/web/v2/dict/`), focusing on capabilities previously present in V1 that are still missing or degraded in V2.

> **Note on Intentional Architecture Decisions**:
>
> - **No-JS Definition Word Clicks**: In V2 SSR, definition text nodes are delivered as clean semantic HTML text without upfront server linkification. Latin word lookup enhancement is handled progressively on the client via `MorcusDictSearch.enhanceWords()`. This was an intentional performance and HTML payload optimization.
> - **No-JS Autocomplete**: Autocomplete suggestions are deliberately deferred to client-side JS enhancement (`/v2/api/completions` + `<morcus-dict-suggestions>`) without a No-JS `<datalist>` fallback.

---

### 1. Remaining Gaps Matrix

| Feature Area                           | V1 UI (SPA)                                                       | V2 UI (SSR + Progressive Enhancement)                           | Parity Status        |
| :------------------------------------- | :---------------------------------------------------------------- | :-------------------------------------------------------------- | :------------------- |
| **Global Multi-Lexicon Entry Summary** | Top-level summary listing all matched entries across dictionaries | Jump links only inside local card headers                       | ❌ **Missing in V2** |
| **Embedded Reader View Options**       | `hideSearch`, `textScale`, `skipJumpToResult`, isolated settings  | Only hides app bar (`embedded=1`)                               | ⚠️ **Partial in V2** |
| **Desktop Table of Contents**          | Dedicated two-column sidebar (`.tocSidebar`)                      | Segmented per-entry tab pill dropdown                           | ❌ **Missing in V2** |
| **Mobile Drawer Layout**               | Draggable, resizable bottom drawer (`BottomDrawer`)               | Inline segmented tab pills                                      | ❌ **Missing in V2** |
| **Mobile Layout Preference**           | Setting toggling between "Drawer" and "Classic" single column     | Fixed single-column layout only                                 | ❌ **Missing in V2** |

---

## 2. Detailed Gap Analysis

### 2.1. Entry Results & Navigation

1. **Top-Level Consolidated Entry Summary**:

   - **V1 (`dictionary_v2.tsx:L472-518`)**: `SummarySection` provided a global list of all matched headwords across all lexica at the top of the page, with `ToEntryButton` chips.
   - **V2 (`dict_page.server.ts:L161-185`)**: Quick-jump links exist only within individual dictionary cards (`.v2-entry-nav`). There is no cross-lexicon summary list at the top.

---

### 2.2. Embedded Reader Controls

1. **Embedded Reader Mode Options**:

   - **V1 (`dict_context.tsx`)**: Supported options for embedded contexts (e.g. reader drawers and popovers):
     - `hideSearch`: Suppressed search bar when space was constrained.
     - `textScale`: Scaled font sizes across definitions and icons.
     - `skipJumpToResult`: Suppressed auto-scrolling.
     - `embeddedInflectedSearch`: Decoupled inflection settings for reader embeds.
   - **V2 (`v2_router.ts:L97-101`, `dict_page.server.ts:L281`)**: `embedded=1` only hides the top site app bar. The search bar is always present, and text scaling / separate settings are absent.

---

### 2.3. Table of Contents & Responsive Layout

1. **Desktop Sidebar Table of Contents**:

   - **V1 (`dictionary_v2.tsx:L444-470`, `table_of_contents_v2.tsx`)**: Two-column layout on desktop with a dedicated `.tocSidebar`. Users could navigate hierarchical sections (ordinals, sense summaries) while reading definitions side-by-side.
   - **V2 (`entry_view.server.ts`, `dictionary.css`)**: Single-column layout. Outlines are collapsed inside per-entry `<details class="v2-tool-pane"><summary class="v2-tab-pill">Outline</summary></details>` tabs within each entry card.

2. **Mobile Draggable Drawer (`BottomDrawer`)**:

   - **V1 (`dictionary_v2.tsx:L409-442`)**: On narrow viewports, ancillary content (outlines/inflections) was housed in a draggable, height-adjustable bottom sheet.
   - **V2**: Bottom drawer eliminated; mobile relies on inline `<details>` dropdowns.

3. **Mobile Layout Preferences**:

   - **V1 (`dictionary_search.tsx:L123-151`)**: Provided a setting allowing mobile users to choose between "Drawer" mode and "Classic" single-column mode.
   - **V2**: No layout preference setting.

---

## 3. Recommended Remediation Roadmap

Prioritized enhancements for remaining gaps:

### High Priority

1. **Global Multi-Lexicon Entry Summary** (§2.1):
   - Render a top-of-page summary with quick jump buttons across all matched dictionaries (mirroring V1's `SummarySection`), speeding up navigation when queries match multiple lexica.
2. **Embedded Reader Mode Controls** (§2.2):
   - Support `hideSearch`, `textScale`, `skipJumpToResult`, and isolated search parameters for embedded reader contexts.

### Open Design Decisions

3. **Table of Contents & Responsive Layout** (§2.3):
   - Decide whether a dedicated two-column desktop sidebar is needed or if V2's semantic inline tab pills (`<details class="v2-tool-pane">`) intentionally supersede the V1 sidebar and mobile bottom drawer.
