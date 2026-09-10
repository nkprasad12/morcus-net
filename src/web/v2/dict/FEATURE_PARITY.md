# V1 SPA vs V2 Progressively Enhanced SSR: Dictionary Feature Parity

This document outlines feature parity between the **V1 UI (SPA)** (`src/web/client/pages/dictionary/`) and the **V2 UI (Progressively Enhanced SSR)** (`src/web/v2/dict/`), with a particular focus on capabilities previously present in V1 that are missing or degraded in V2.

> **Note on Intentional Architecture Decisions**:
>
> - **No-JS Definition Word Clicks**: In V2 SSR, definition text nodes are delivered as clean semantic HTML text without upfront server linkification. Latin word lookup enhancement is handled progressively on the client via `MorcusDictSearch.enhanceWords()`. This was an intentional performance and HTML payload optimization.
> - **No-JS Autocomplete**: Autocomplete suggestions are deliberately deferred to client-side JS enhancement (`/v2/api/completions` + `<morcus-dict-suggestions>`) without a No-JS `<datalist>` fallback.

---

## 1. Parity Matrix

| Feature Area                             | V1 UI (SPA)                                                               | V2 UI (SSR + Progressive Enhancement)        | Parity Status         |
| :--------------------------------------- | :------------------------------------------------------------------------ | :------------------------------------------- | :-------------------- |
| **Inflected Search Toggle**              | Explicit UI control (`Latin inflected forms`) & status badge              | Server hardcodes `mode: 1`; no UI toggle     | ❌ **Missing in V2**  |
| **Search Bar Status Badges**             | Shows active source languages (`In La En`) & inflection status (`On/Off`) | Replaced with plain settings icon button     | ❌ **Missing in V2**  |
| **Suffix Autocomplete**                  | Supported queries starting with `-` (e.g. `-arum`, `-ibus`)               | Treated as literal prefix lookup             | ❌ **Missing in V2**  |
| **Orthographic Prefix Expansion**        | Expands Latin `u`/`v`, `i`/`j`, and German `ß`/`ss`                       | Verbatim prefix matching only                | ❌ **Missing in V2**  |
| **Autocomplete Language Chips**          | Suggestions show language tags (`[La]`, `[En]`, `[De]`, `[Es]`)           | Plain string array without language metadata | ❌ **Missing in V2**  |
| **Vowel Length Merging & Deduplication** | Merges compatible macrons using Gaffiot as leader                         | Set-based exact string deduplication         | ❌ **Missing in V2**  |
| **Subsection Match Notes**               | Explicit compound/inflection subsection banner with jump arrows           | Ignored; subsections not rendered            | ❌ **Missing in V2**  |
| **Global Multi-Lexicon Entry Summary**   | Top-level summary listing all matched entries across dictionaries         | Jump links only inside local card headers    | ❌ **Missing in V2**  |
| **Desktop Table of Contents**            | Dedicated two-column sidebar (`.tocSidebar`)                              | Segmented per-entry tab pill dropdown        | ❌ **Missing in V2**  |
| **Mobile Drawer Layout**                 | Draggable, resizable bottom drawer (`BottomDrawer`)                       | Inline segmented tab pills                   | ❌ **Missing in V2**  |
| **Mobile Layout Preference**             | Setting toggling between "Drawer" and "Classic" single column             | Fixed single-column layout only              | ❌ **Missing in V2**  |
| **Section Link Copying**                 | Tooltip allowing copy of permalink / section ID                           | Anchor jump only (`#hash`)                   | ⚠️ **Degraded in V2** |
| **Greek Query Interception**             | Greek detection, Logeion embed & auto-open setting                        | Treated as 0-result Latin search             | ❌ **Missing in V2**  |
| **Usage Guide & Typographical Legend**   | Expandable guide with typography legend and bug report links              | Omitted                                      | ❌ **Missing in V2**  |
| **Rich Landing State**                   | Active dictionaries breakdown, language directions, search tips           | Single placeholder text sentence             | ❌ **Missing in V2**  |
| **Embedded Reader View Options**         | `hideSearch`, `textScale`, `skipJumpToResult`, isolated settings          | Only hides app bar (`embedded=1`)            | ⚠️ **Partial in V2**  |

---

## 2. Detailed Gap Analysis

### 2.1. Search Bar, Query Parsing, & Settings

1. **Inflected Search Toggle (`Latin inflected forms`)**:

   - **V1 (`dictionary_search.tsx:L92-113`)**: Users could toggle inflection searching on or off in the settings dialog. URL routing supported `o=1` for inflected searches and `o=undefined` for exact headword matches.
   - **V2 (`v2_router.ts:L151`, `search_bar.server.ts`, `dict_settings.client.ts`)**: The Express backend hardcodes `mode: 1` (`fusedDict.getEntry({ query, dicts: dictKeys, mode: 1 })`). There is no checkbox in the settings popover, no hidden form input, and no URL parameter allowing headword-only lookups.

2. **Search Bar Preview Badges**:
   - **V1 (`dictionary_search.tsx:L317-370`)**: The search input displayed clickable badges directly inline showing active search languages (`In [La] [En]...`) and inflection mode (`Inflection [On] / [Off]`), giving immediate visibility into search behavior.
   - **V2 (`search_bar.server.ts`)**: Replaced by a single Material Design tune/sliders icon button.

---

### 2.2. Autocomplete & Suggestions (Client JS Mode)

1. **Suffix Autocomplete (`-suffix`)**:

   - **V1 (`autocomplete_options.ts:L94-101`)**: Supported suffix search (queries starting with `-`, e.g. `-arum`, `-ibus`) by bypassing single-character prefix chunking and requesting suffix matches directly.
   - **V2 (`dict_search.client.ts`, `v2_router.ts`)**: Queries starting with `-` are treated as literal prefixes; suffix completion is unsupported.

2. **Orthographic Equivalence & Multi-Character Expansion**:

   - **V1 (`autocomplete_options.ts:L16-35`)**: Handled standard Latin orthographic alternates (`u` <-> `v`, `i` <-> `j`) via `EXTRA_KEY_LOOKUP` and German `ß` <-> `ss`, expanding query branches up to depth 25.
   - **V2 (`v2_router.ts:L65-89`)**: Queries are passed verbatim to `fusedDict.getCompletions()`. Searching `ivst...` will not suggest `justus`, and vice versa.

3. **Language Origin Chips**:

   - **V1 (`dictionary_search.tsx:L209-235`)**: Every autocomplete suggestion was tagged with its source language (`[DictLang, string]`) and rendered with a distinct colored `LangChip` (`La`, `En`, `De`, `Es`), preventing ambiguity between homographs across languages.
   - **V2 (`dict_suggestions.client.ts`)**: Autocomplete returns a flat list of strings rendered as plain text without language tags.

4. **Macron Compatibility & Vowel Length Grouping**:

   - **V1 (`autocomplete_options.ts:L131-160`)**: Grouped suggestions with `Vowels.haveCompatibleLength()`, selecting Gaffiot as canonical leader to eliminate duplicate vowel-length variations.
   - **V2 (`v2_router.ts:L78-83`)**: Deduplicates suggestions via a plain JavaScript `Set<string>`, leading to potential duplication across dictionaries with differing macron conventions.

5. **Suggestion Limit & In-Memory Caching**:
   - **V1 (`autocomplete_options.ts:L85`, `fused_autocomplete_fetcher.ts`)**: Supported up to 200–300 suggestions with client-side prefix caching.
   - **V2 (`v2_router.ts:L84`)**: Hardcoded to 10 suggestions (`slice(0, 10)`), with no client-side caching.

---

### 2.3. Entry Results, Morphological Subsections, & Navigation

1. **Subsection Match Notes (`SubsectionNote`)**:

   - **V1 (`dictionary_v2.tsx:L601-663`)**: When a query matched an inflected form or subsection of a compound/larger article (`DictSubsectionResult`), V1 rendered an explicit callout:
     > _"Found matches for [word] [#1, #2], which is part of a larger entry."_
     - Included downward jump arrows to scroll directly to the matched subsection.
     - Provided a collapsible `<details>` section: _"Inflections of [word]"_ with morphological analysis for that specific matched subsection.
   - **V2 (`entry_view.server.ts`)**: Ignores `result.subsections`. Users searching inflected forms are dropped at the head of large multi-page articles without guidance on where the match occurred.

2. **Top-Level Consolidated Entry Summary**:
   - **V1 (`dictionary_v2.tsx:L472-518`)**: `SummarySection` provided a global list of all matched headwords across all lexica at the top of the page, with `ToEntryButton` chips.
   - **V2 (`dict_page.server.ts:L161-185`)**: Quick-jump links exist only within individual dictionary cards (`.v2-entry-nav`). There is no cross-lexicon summary list at the top.

---

### 2.4. Table of Contents & Responsive Layout

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

### 2.5. Word Interactivity & Rich Markup

1. **Section Link Copy-to-Clipboard**:
   - **V1 (`dictionary_utils.tsx:L268-284`)**: `SectionLinkTooltip` on sense bullets provided an interactive popover with a copy-to-clipboard action.
   - **V2 (`xml_to_html.server.ts:L101-110`)**: Sense bullets are rendered as `<a href="#senseId" class="v2-section-anchor">`. Clicking jumps and highlights the target via CSS `:target`, but there is no copy-to-clipboard button.

---

### 2.6. Greek Terms & External Lexica

1. **Greek Word Interception & Logeion Integration**:
   - **V1 (`dictionary_v2.tsx:L97-153`)**: `hasGreek()` intercepted Greek queries:
     - Displayed notice: _"This site does not (yet) support Greek."_
     - Direct link to `https://logeion.uchicago.edu/<word>`.
     - Toggleable inline `70vh` iframe embed.
     - Persisted user setting: _"Automatically open embedded Logeion searches"_.
   - **V2**: Greek words pass through to Latin lexica, returning a generic _"No dictionary entries found"_ with no Logeion banner or embed option.

---

### 2.7. Documentation, Landing Page, & Embedded Reader Controls

1. **Usage Guide (`HelpSection` / `DictHelpSection`)**:

   - **V1 (`dictionary_utils.tsx:L40-134`)**: Expandable `"Usage guide ⓘ"` containing:
     - Typographical legend explaining headwords (`.lsOrth`), grammar notes (`.lsGrammar`), citations (`.lsBibl`), quotes (`.lsQuote`), and underlined abbreviations (`.lsHover`).
     - Tips on section permalinks and bug reporting.
   - **V2**: Omitted.

2. **Rich Landing State Breakdown**:

   - **V1 (`dictionary_v2.tsx:L201-247`)**: When no query was present, `LandingContent` showed an expandable breakdown of all active dictionaries, language pairs (e.g. from German to Latin), and search capabilities.
   - **V2 (`dict_page.server.ts:L61-65`)**: Shows only a single generic placeholder line.

3. **Embedded Reader Mode Options**:
   - **V1 (`dict_context.tsx`)**: Supported options for embedded contexts (e.g. reader drawers and popovers):
     - `hideSearch`: Suppressed search bar when space was constrained.
     - `textScale`: Scaled font sizes across definitions and icons.
     - `skipJumpToResult`: Suppressed auto-scrolling.
     - `embeddedInflectedSearch`: Decoupled inflection settings for reader embeds.
   - **V2 (`v2_router.ts:L97-101`, `dict_page.server.ts:L281`)**: `embedded=1` only hides the top site app bar. The search bar is always present, and text scaling / separate settings are absent.

---

## 3. Recommended Remediation Roadmap

To bring the V2 Dictionary to full functional parity with V1, prioritize the following enhancements:

### High Priority

1. **Inflection Search Toggle**:
   - Add an inflection checkbox to `<morcus-dict-settings>` and the SSR `<form>`.
   - Pass `inflected=0|1` to `/v2/dicts` and configure `fusedDict.getEntry({ mode: inflected ? 1 : 0 })`.
2. **Subsection Match Notes**:
   - Port `SubsectionNote` into `entry_view.server.ts` so inflected and compound searches surface which subsections matched inside long entries.
3. **Greek Query Fallback**:
   - Re-introduce `hasGreek()` query inspection on the server and render the Logeion fallback banner and embed.

### Medium Priority

4. **Autocomplete Refinements**:
   - Add language origin chips (`LangChip`) to suggestions in `dict_suggestions.client.ts`.
   - Restore suffix lookup (`-`) and `u`/`v` / `i`/`j` prefix expansion.
5. **Search Bar Preview Badges**:
   - Render active language and inflection state pills alongside the settings button in `search_bar.server.ts`.
6. **Usage Guide**:
   - Add the typographical legend and usage guide `<details>` block to the dictionary landing page and results footer.
