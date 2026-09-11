# V1 SPA vs V2 Progressively Enhanced SSR: Dictionary Feature Parity

This document outlines feature parity between the **V1 UI (SPA)** (`src/web/client/pages/dictionary/`) and the **V2 UI (Progressively Enhanced SSR)** (`src/web/v2/dict/`), with a particular focus on capabilities previously present in V1 that are missing or degraded in V2.

> **Note on Intentional Architecture Decisions**:
>
> - **No-JS Definition Word Clicks**: In V2 SSR, definition text nodes are delivered as clean semantic HTML text without upfront server linkification. Latin word lookup enhancement is handled progressively on the client via `MorcusDictSearch.enhanceWords()`. This was an intentional performance and HTML payload optimization.
> - **No-JS Autocomplete**: Autocomplete suggestions are deliberately deferred to client-side JS enhancement (`/v2/api/completions` + `<morcus-dict-suggestions>`) without a No-JS `<datalist>` fallback.

---

## 1. Parity Matrix

| Feature Area                             | V1 UI (SPA)                                                               | V2 UI (SSR + Progressive Enhancement)                                            | Parity Status         |
| :--------------------------------------- | :------------------------------------------------------------------------ | :------------------------------------------------------------------------------- | :-------------------- |
| **Search Bar Status Badges**             | Shows active source languages (`In La En`) & inflection status (`On/Off`) | Replaced with plain settings icon button                                         | ❌ **Missing in V2**  |
| **Suffix Autocomplete**                  | Supported queries starting with `-` (e.g. `-arum`, `-ibus`)               | Treated as literal prefix lookup                                                 | ❌ **Missing in V2**  |
| **Orthographic Prefix Expansion**        | Expands Latin `u`/`v`, `i`/`j`, and German `ß`/`ss`                       | Verbatim prefix matching only                                                    | ❌ **Missing in V2**  |
| **Autocomplete Language Chips**          | Suggestions show language tags (`[La]`, `[En]`, `[De]`, `[Es]`)           | Plain string array without language metadata                                     | ❌ **Missing in V2**  |
| **Vowel Length Merging & Deduplication** | Merges compatible macrons using Gaffiot as leader                         | Set-based exact string deduplication                                             | ❌ **Missing in V2**  |
| **Subsection Match Notes**               | Explicit compound/inflection subsection banner with jump arrows           | Always-visible banner with numbered jump chips + in-body match markers           | ✅ **Done in V2**     |
| **Global Multi-Lexicon Entry Summary**   | Top-level summary listing all matched entries across dictionaries         | Jump links only inside local card headers                                        | ❌ **Missing in V2**  |
| **Desktop Table of Contents**            | Dedicated two-column sidebar (`.tocSidebar`)                              | Segmented per-entry tab pill dropdown                                            | ❌ **Missing in V2**  |
| **Mobile Drawer Layout**                 | Draggable, resizable bottom drawer (`BottomDrawer`)                       | Inline segmented tab pills                                                       | ❌ **Missing in V2**  |
| **Mobile Layout Preference**             | Setting toggling between "Drawer" and "Classic" single column             | Fixed single-column layout only                                                  | ❌ **Missing in V2**  |
| **Article & Section Permalinks**         | Direct `/dicts/id/:id` link, copy permalink tooltip                       | Local `#hash` anchor jump only; no copy action                                   | ⚠️ **Degraded in V2** |
| **Greek Query Interception**             | Greek detection, Logeion embed & auto-open setting                        | Detected server-side; direct Logeion link, toggleable embed, & auto-open setting | ✅ **Feature Parity** |
| **Embedded Reader View Options**         | `hideSearch`, `textScale`, `skipJumpToResult`, isolated settings          | Only hides app bar (`embedded=1`)                                                | ⚠️ **Partial in V2**  |

---

## 2. Detailed Gap Analysis

### 2.1. Search Bar, Query Parsing, & Settings

1. **Search Bar Preview Badges**:
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

1. **Subsection Match Notes (`SubsectionNote`)** — ✅ **implemented in V2**:

   - **V1 (`dictionary_v2.tsx:L601-663`)**: When a query matched an inflected form or subsection of a compound/larger article (`DictSubsectionResult`), V1 rendered an explicit callout:
     > _"Found matches for [word] [#1, #2], which is part of a larger entry."_
     - Included downward jump arrows to scroll directly to the matched subsection.
     - Provided a collapsible `<details>` section: _"Inflections of [word]"_ with morphological analysis for that specific matched subsection.
   - **V2 (`subsection_note.server.ts`, wired in `entry_view.server.ts`)**: Renders an always-visible `<aside class="v2-subsection-note">` immediately below the entry header (and above the entry body, even for entries with no tools bar):
     - Reads `result.subsections` as-is — no backend, RPC, or router changes were needed.
     - Matches are deduplicated by id and then grouped by subsection name. A group whose name equals the entry's `mainKey` renders its headword inline (no redundant chip); other groups render numbered jump chips.
     - Chips are plain `<a href="#id">`, so the **no-JS baseline gets native anchor navigation for free**. With JS, the existing delegated handler in `v2_bundle.ts` adds smooth scrolling, ancestor `<details>` expansion, and the `v2-target-active` flash — zero new client code.
     - A `chevronUp` / `chevronDown` icon indicates whether the target is above or below the banner.
     - Subsection-specific inflections render as an inline one-liner for a single analysis, or a collapsible `<details>` table for multiple.
     - The matched elements in the body are tagged with `v2-subsection-hit` + `aria-current="location"`. The visual marker is an **absolutely positioned `::before` bar**, so it introduces **zero horizontal layout shift** — sibling senses at the same nesting level stay aligned (with a `left: 0` guard for top-level elements that have no left gutter).
   - **Dead-anchor handling**: L&S merges the first sense into the opening blurb when an entry has a single level-1 sense (`ls_display.ts` `displayEntryFree`), so the recorded `senseId` of `{entryId}.0` is never emitted as an element. `resolveSubsectionAnchor` falls back to `{entryId}.blurb`, then to the entry root. This resolved 100% of measured cases (~21% of subsection anchors were otherwise dead links — a bug V1 still has).

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

### 2.5. Article Permalinks, Word Interactivity & Rich Markup

1. **Direct Article Permalinks (`/dicts/id/:id`)**:

   - **V1 (`dictionary_v2.tsx:L520-550,688`, `tooltips.tsx:L298-322`, `dictionary_routing.ts:L92-101`)**: Clicking or copying the permalink icon on an entry header generated a direct URL to that specific article (`/dicts/id/:id`, e.g. `/dicts/id/n20077`). This executed an ID lookup (`mode: 2`), retrieving and displaying strictly that single article rather than a broad search query matching multiple homographs across dictionaries.
   - **V2 (`entry_view.server.ts:L48-53`, `v2_router.ts:L221`)**: Although the backend route `GET /v2/dicts/id/:id` exists and supports `mode: 2`, the UI in `entry_view.server.ts` renders headword permalinks as in-page local hash jumps (`<a href="#${entryAnchorId}" class="v2-entry-headword">`). There is no UI link pointing to `/v2/dicts/id/${result.key}` and no easy way to copy or open the direct single-article URL.

2. **Section Link Copy-to-Clipboard**:
   - **V1 (`dictionary_utils.tsx:L268-284`, `tooltips.tsx:L307-312`)**: `SectionLinkTooltip` on sense bullets and section headers provided an interactive popover with a copy-to-clipboard action that generated a fully qualified URL to `/dicts/id/:articleId#:sectionId`.
   - **V2 (`xml_to_html.server.ts:L101-110`)**: Sense bullets are rendered as plain `<a href="#senseId" class="v2-section-anchor">`. Clicking jumps and highlights the target via CSS `:target`, but does not copy the permalink or include the article ID base.

---

### 2.6. Greek Terms & External Lexica

1. **Greek Word Interception & Logeion Integration**:
   - **V1 (`dictionary_v2.tsx:L97-153`)**: `hasGreek()` intercepted Greek queries:
     - Displayed notice: _"This site does not (yet) support Greek."_
     - Direct link to `https://logeion.uchicago.edu/<word>`.
     - Toggleable inline `70vh` iframe embed.
     - Persisted user setting: _"Automatically open embedded Logeion searches"_.
   - **V2 (`dict_greek.common.ts`, `dict_greek.server.ts`, `dict_greek.client.ts`, `v2_router.ts`)**: Parity achieved. Server intercepts Greek queries before Latin dict lookup, renders semantic SSR fallback with badge and direct Logeion link, and progressively enhances with `<morcus-greek-embed>` providing toggleable iframe viewer and persisted auto-open preference. Autocomplete endpoint returns empty array for Greek queries without wasting Latin database lookups.

---

### 2.7. Embedded Reader Controls

1. **Embedded Reader Mode Options**:
   - **V1 (`dict_context.tsx`)**: Supported options for embedded contexts (e.g. reader drawers and popovers):
     - `hideSearch`: Suppressed search bar when space was constrained.
     - `textScale`: Scaled font sizes across definitions and icons.
     - `skipJumpToResult`: Suppressed auto-scrolling.
     - `embeddedInflectedSearch`: Decoupled inflection settings for reader embeds.
   - **V2 (`v2_router.ts:L97-101`, `dict_page.server.ts:L281`)**: `embedded=1` only hides the top site app bar. The search bar is always present, and text scaling / separate settings are absent.

---

## 3. Recommended Remediation Roadmap

To bring the V2 Dictionary to full functional parity with V1, prioritize the following enhancements:

### Completed

1. ~~**Subsection Match Notes**~~ — shipped. See §2.3.1. Implemented in `subsection_note.server.ts` + `inflection_table.server.ts`, wired through `entry_view.server.ts` and `xml_to_html.server.ts`.

### Medium Priority

2. **Autocomplete Refinements**:
   - Add language origin chips (`LangChip`) to suggestions in `dict_suggestions.client.ts`.
   - Restore suffix lookup (`-`) and `u`/`v` / `i`/`j` prefix expansion.
3. **Search Bar Preview Badges**:
   - Render active language and inflection state pills alongside the settings button in `search_bar.server.ts`.
4. **Direct Article Permalinks & Link Copying**:
   - Update `entry_view.server.ts` to link headwords to `/v2/dicts/id/:id` (matching V1's `DICT_BY_ID` behavior).
   - Add client-side copy-to-clipboard button/tooltip for article permalinks and sense section URLs.
