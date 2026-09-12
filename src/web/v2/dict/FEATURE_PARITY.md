# V1 SPA vs V2 Progressively Enhanced SSR: Dictionary Feature Parity

This document outlines the remaining feature gaps between the **V1 UI (SPA)** (`src/web/client/pages/dictionary/`) and the **V2 UI (Progressively Enhanced SSR)** (`src/web/v2/dict/`), focusing on capabilities previously present in V1 that are still missing or degraded in V2.

> **Note on Intentional Architecture Decisions**:
>
> - **No-JS Definition Word Clicks**: In V2 SSR, definition text nodes are delivered as clean semantic HTML text without upfront server linkification. Latin word lookup enhancement is handled progressively on the client via `MorcusDictSearch.enhanceWords()`. This was an intentional performance and HTML payload optimization.
> - **No-JS Autocomplete**: Autocomplete suggestions are deliberately deferred to client-side JS enhancement (`/v2/api/completions` + `<morcus-dict-suggestions>`) without a No-JS `<datalist>` fallback.

---

## 1. Remaining Gaps Matrix

| Feature Area                             | V1 UI (SPA)                                                       | V2 UI (SSR + Progressive Enhancement)                           | Parity Status        |
| :--------------------------------------- | :---------------------------------------------------------------- | :-------------------------------------------------------------- | :------------------- |
| **Suffix Autocomplete**                  | Supported queries starting with `-` (e.g. `-arum`, `-ibus`)       | Leading `-` preserved and dispatched to backend suffix search   | ✅ **Done in V2**    |
| **Orthographic Prefix Expansion**        | Expands Latin `u`/`v`, `i`/`j`, and German `ß`/`ss`               | Language-aware multi-branch prefix expansion on server          | ✅ **Done in V2**    |
| **Autocomplete Language Chips**          | Suggestions show language tags (`[La]`, `[En]`, `[De]`, `[Es]`)   | Colored language origin badges rendered in suggestions dropdown | ✅ **Done in V2**    |
| **Vowel Length Merging & Deduplication** | Merges compatible macrons using Gaffiot as leader                 | Vowel-length clustering with Gaffiot canonical leader           | ✅ **Done in V2**    |
| **Suggestion Limit & In-Memory Caching** | Cached up to 200–300 suggestions on client with prefix tree       | 2-letter chunk caching + 0 ms local filtering & re-clustering   | ✅ **Done in V2**    |
| **Global Multi-Lexicon Entry Summary**   | Top-level summary listing all matched entries across dictionaries | Jump links only inside local card headers                       | ❌ **Missing in V2** |
| **Desktop Table of Contents**            | Dedicated two-column sidebar (`.tocSidebar`)                      | Segmented per-entry tab pill dropdown                           | ❌ **Missing in V2** |
| **Mobile Drawer Layout**                 | Draggable, resizable bottom drawer (`BottomDrawer`)               | Inline segmented tab pills                                      | ❌ **Missing in V2** |
| **Mobile Layout Preference**             | Setting toggling between "Drawer" and "Classic" single column     | Fixed single-column layout only                                 | ❌ **Missing in V2** |
| **Embedded Reader View Options**         | `hideSearch`, `textScale`, `skipJumpToResult`, isolated settings  | Only hides app bar (`embedded=1`)                               | ⚠️ **Partial in V2** |

---

## 2. Detailed Gap Analysis

### 2.1. Autocomplete & Suggestions (Client JS Mode)

1. **Suffix Autocomplete (`-suffix`)**: ✅ **Parity reached.**

   - **V1 (`autocomplete_options.ts:L94-101`)**: Supported suffix search (queries starting with `-`, e.g. `-arum`, `-ibus`) by bypassing single-character prefix chunking and requesting suffix matches directly.
   - **V2 (`dict_completions.server.ts`, `dict_completions.common.ts`, `v2_router.ts`)**: Parity achieved. `cleanCompletionQuery` preserves leading hyphens on suffix queries (preventing `trimRawQuery` punctuation truncation) and dispatches them directly to backend suffix completion across active dictionaries.

2. **Orthographic Equivalence & Multi-Character Expansion**: ✅ **Parity reached.**

   - **V1 (`autocomplete_options.ts:L16-35`)**: Handled standard Latin orthographic alternates (`u` <-> `v`, `i` <-> `j`) via `EXTRA_KEY_LOOKUP` and German `ß` <-> `ss`, expanding query branches up to depth 25.
   - **V2 (`dict_completions.server.ts`, `dict_clustering.common.ts`)**: Parity achieved. Queries are partitioned by dictionary language; Latin queries expand `u`/`v` and `i`/`j` concurrently, and German queries expand `ß`/`ss`. Searching `ivst` properly returns completions for both `justus` and `iustus`.

3. **Language Origin Chips**: ✅ **Parity reached.**

   - **V1 (`dictionary_search.tsx:L209-235`)**: Every autocomplete suggestion was tagged with its source language (`[DictLang, string]`) and rendered with a distinct colored `LangChip` (`La`, `En`, `De`, `Es`), preventing ambiguity between homographs across languages.
   - **V2 (`dict_suggestions.client.ts`, `search.css`)**: Parity achieved. `<morcus-dict-suggestions>` renders a colored `<span class="v2-lang-chip v2-lang-chip-{lang}">` badge alongside each suggestion word, visually disambiguating homographs across lexica in both light and dark themes.

4. **Macron Compatibility & Vowel Length Grouping**: ✅ **Parity reached.**

   - **V1 (`autocomplete_options.ts:L131-160`)**: Grouped suggestions with `Vowels.haveCompatibleLength()`, selecting Gaffiot as canonical leader to eliminate duplicate vowel-length variations.
   - **V2 (`dict_clustering.common.ts`)**: Parity achieved. `clusterAndDeduplicate` groups candidates by language and clean base form, clusters compatible vowel lengths via `Vowels.haveCompatibleLength`, and selects Gaffiot (`GAF`) as canonical macron leader for Latin.

5. **Suggestion Limit & In-Memory Caching**: ✅ **Parity reached.**

   - **V1 (`autocomplete_options.ts:L85`, `fused_autocomplete_fetcher.ts`)**: Supported up to 200–300 suggestions with client-side prefix caching.
   - **V2 (`dict_chunk_cache.client.ts`, `dict_search.client.ts`, `v2_router.ts`)**: Parity achieved. Overhauled `/v2/api/completions` to return combined 2-letter dictionary chunk payloads with public HTTP caching. Client caches chunks in-memory (`DictChunkCache`) with in-flight request deduplication, filtering and clustering matching suggestions instantly (0 ms) on typing and re-clustering with 0 network calls when toggling dictionaries.

---

### 2.2. Entry Results & Navigation

1. **Top-Level Consolidated Entry Summary**:

   - **V1 (`dictionary_v2.tsx:L472-518`)**: `SummarySection` provided a global list of all matched headwords across all lexica at the top of the page, with `ToEntryButton` chips.
   - **V2 (`dict_page.server.ts:L161-185`)**: Quick-jump links exist only within individual dictionary cards (`.v2-entry-nav`). There is no cross-lexicon summary list at the top.

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

### 2.4. Embedded Reader Controls

1. **Embedded Reader Mode Options**:

   - **V1 (`dict_context.tsx`)**: Supported options for embedded contexts (e.g. reader drawers and popovers):
     - `hideSearch`: Suppressed search bar when space was constrained.
     - `textScale`: Scaled font sizes across definitions and icons.
     - `skipJumpToResult`: Suppressed auto-scrolling.
     - `embeddedInflectedSearch`: Decoupled inflection settings for reader embeds.
   - **V2 (`v2_router.ts:L97-101`, `dict_page.server.ts:L281`)**: `embedded=1` only hides the top site app bar. The search bar is always present, and text scaling / separate settings are absent.

---

## 3. Recommended Remediation Roadmap

Prioritized enhancements for remaining gaps:

### High Priority

1. **Global Multi-Lexicon Entry Summary** (§2.2.1):
   - Render a top-of-page summary with quick jump buttons across all matched dictionaries (mirroring V1's `SummarySection`), speeding up navigation when queries match multiple lexica.
2. **Embedded Reader Mode Controls** (§2.4.1):
   - Support `hideSearch`, `textScale`, `skipJumpToResult`, and isolated search parameters for embedded reader contexts.

### Medium Priority

3. **Per-Entry Collapse** _(new V2 ergonomic enhancement)_:
   - Make individual entry headers/headwords collapsible via the decoupled `<details class="v2-entry-toggle">` pattern, mirroring dictionary card collapse.
   - Add a `.v2-entry` case to `expandAncestorDisclosures` in `v2_bundle.ts` so anchor deep-links automatically expand collapsed entries.
4. **Autocomplete Refinements** (§2.1):
   - Add language origin chips (`LangChip`) to suggestions in `dict_suggestions.client.ts`.
   - Restore suffix lookup (`-`), orthographic prefix expansion (`u`/`v`, `i`/`j`), macron compatibility merging, and client-side prefix caching.

### Open Design Decisions

5. **Table of Contents & Responsive Layout** (§2.3):
   - Decide whether a dedicated two-column desktop sidebar is needed or if V2's semantic inline tab pills (`<details class="v2-tool-pane">`) intentionally supersede the V1 sidebar and mobile bottom drawer.
