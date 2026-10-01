# Reader & Dictionary In-Flow "Edit and Report" Design

> **Archived.** Kept for context only; do not treat it as current guidance or a to-do list.
> Open work: [reader/TODOS.md](../../reader/TODOS.md) and [dict/TODOS.md](../../dict/TODOS.md).
> Commit SHAs, phase numbers, and relative links in this file refer to `lit-prototype` history and may not resolve.

Technical design document for restoring in-flow errata and typo reporting across both the **UI V2 Reader** (`src/web/v2/reader/`) and the **UI V2 Dictionary** (`src/web/v2/dict/`), addressing the remaining feature parity gaps in [`reader/FEATURE_PARITY.md`](FEATURE_PARITY.md#31-in-flow-edit-and-report) and [`dict/FEATURE_PARITY.md`](../dict/FEATURE_PARITY.md#21-in-flow-edit-and-report-on-senses).

---

## 1. Background & Problem Statement

In the **V1 UI** (`src/web/client/pages/library/reader.tsx:L1057`, `src/web/client/pages/dictionary/dictionary_utils.tsx:L275-283`, `src/web/client/pages/tooltips.tsx:L201-256`):

- Both **Reader section citation anchors** (`WorkSectionHeader`) and **Dictionary sense bullets** (`.lsSenseBullet` in Lewis & Short, Smith & Hall, Gaffiot, Georges, and Riddle & Arnold) wrapped their anchor in `SectionLinkTooltip` / `CopyLinkTooltip` with `idToEdit`:
  1. **Copy link**: Copied the canonical permalink to the clipboard.
  2. **Edit and Report**: Set `contenteditable="true"` on `document.getElementById(idToEdit)` and focused it.
- Note that dictionary **article-level** header links (`forArticle` in V1, `a.copy-pill` in V2) did **not** pass `idToEdit` and remained single-action copy links.
- When the user blurred the `contenteditable` element, V1 compared `updated` vs `original` text (`innerText`). If altered, it dispatched a report to `ReportApi` with `{ original, edited, sectionId }` and tag `["userEdit"]`.
- The backend ([`src/web/utils/github.ts`](../../../web/utils/github.ts)) used `diffWordsWithSpace` to create a formatted GitHub issue with markdown word diffs (`~~deleted~~` / `**added**`), section/sense IDs, commit hashes, and URLs.

### The Value of In-Flow Reporting

Typo reports that require a reader to navigate away, open a generic feedback modal, manually specify where an error occurs within a 500-line Latin passage or a 60-sense Lewis & Short entry, and type both versions suffer massive drop-off. Capturing corrections **in context** with the exact section or sense ID and a before/after diff eliminates friction and produces directly actionable errata.

### Current V2 Status & Blockers

1. **No Trigger Menu**: In V2, both the Reader ([`reader_view.client.ts:L366-391`](reader_view.client.ts#L366-L391)) and the Dictionary ([`dict_permalink.client.ts:L30-44`](../dict/dict_permalink.client.ts#L30-L44)) bind `a.section-anchor` to immediately copy the URL to the clipboard, flash the target, and show a toast. Neither surface offers a secondary action to enter edit mode.
2. **DOM & Tokenization Invariants**:
   - **Reader**: Passages are tokenized into `<span class="lat-word">` elements for dictionary lookups, `<span class="reader-line">` for verse, and `<a class="reader-note-ref"><sup>[1]</sup></a>` for apparatus footnotes.
   - **Dictionary**: Entry bodies (`.entry-content`) are tokenized into `<a class="lat-word">` links, `.dLink` cross-references, and `.lsHover[tabindex="0"]` abbreviation spans. Clicking inside a dictionary entry delegates to `chooseSuggestion(word)` ([`dict_search.client.ts:L213-239`](../dict/dict_search.client.ts#L213-L239)).
3. **Bundle Size Budget** (as of writing; the client has since been split into route chunks, where `core/` code ships once in `common.js`): `v2_bundle.js` bundles both `reader/` and `dict/` (`129.9 kB` raw / `36.7 kB` gzip against a `135 / 38 kB` budget in [`v2_bundle_budget.ts`](../../../bundler/v2_bundle_budget.ts)). Duplicating popover + editor logic across both slices would waste budget; sharing one primitive in `src/web/v2/core/` serves both at half the byte cost.
4. **API Endpoint Omission**: [`src/web/v2/api_routes.server.ts:L90-100`](../api_routes.server.ts#L90-L100) currently requires `reportText` and drops `editedText` and `tags` support, returning HTTP 400 if `reportText` is omitted.

---

## 2. Technical Evaluation: `contenteditable` vs. In-Place Textarea Swap

| Evaluation Axis           | Raw `contenteditable` (V1 Approach)                                                                       | In-Place `<textarea>` Swap (V2 Proposed)                                                             |
| :------------------------ | :-------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------- |
| **DOM Invariants**        | ❌ Splinters `.lat-word`, `.lsHover`, and `.reader-line` spans; corrupts tokenization.                    | ✅ Original passage/sense DOM is preserved intact (`hidden`); zero token or markup corruption.       |
| **Widget Isolation**      | ❌ Easy to accidentally delete or edit footnote anchors (`<sup>[1]</sup>`) or sense bullets (`I.`).       | ✅ Non-text widgets (`.reader-note-ref`, `.mateo-embed-pane`) are stripped during text extraction.   |
| **Event Collisions**      | ❌ Clicking to place the caret in a dictionary sense or reader passage triggers a word lookup.            | ✅ `<textarea>` isolates all pointer and keyboard events from word-lookup click delegation.          |
| **Mobile & IME Input**    | ⚠️ Unreliable; virtual keyboards and autocomplete trigger erratic DOM mutations across engines.           | ✅ 100% native browser support for mobile keyboards, autocomplete, dictation, and selection handles. |
| **History & Undo**        | ⚠️ Brittle; native browser undo (<kbd>Cmd</kbd>+<kbd>Z</kbd>) frequently breaks across custom span trees. | ✅ Native, reliable undo/redo history out of the box.                                                |
| **Interaction Lifecycle** | ⚠️ V1 relied on raw `blur`, which submitted a GitHub issue accidentally if a user clicked away to cancel. | ✅ Explicit transaction model with `[Submit Correction]` and `[Cancel]`.                             |

**Conclusion**: Rather than setting `contenteditable="true"` on tokenized DOM trees, V2 executes an **in-place element swap** using an auto-resizing `<textarea>` managed by a shared controller in `src/web/v2/core/`.

---

## 3. Unified Architecture (`src/web/v2/core/`)

Both Reader and Dictionary already use `a.section-anchor` for section/sense permalinks (while dictionary article headers use `a.copy-pill`, which remains a 1-click copy). A single shared controller in `src/web/v2/core/` handles the popover menu, the in-place `<textarea>` lifecycle, and the `POST /v2/api/report` submission, parameterized by a lightweight adapter per slice:

| Concern                               | Shared Core (`core/`)                                                                                 | Reader Adapter ([`reader_view.client.ts`](reader_view.client.ts))                                                                                                                                                                         | Dictionary Adapter ([`dict_permalink.client.ts`](../dict/dict_permalink.client.ts))                                                                                                                       |
| :------------------------------------ | :---------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Trigger (`a.section-anchor`)**      | Opens anchored popover menu with **Copy permalink** and **Suggest correction**                        | Enabled when `data-work` is present on `<morcus-reader-view>`. On **External Reader** (`/v2/externalReader`), `data-work` is absent, so clicks stay copy-only (preserving the _"Never sent to Morcus"_ privacy promise for pasted texts). | Enabled on `a.lsSenseBullet.section-anchor` inside `article.entry[id]`. Works identically on standalone `/v2/dicts` and inside the reader's embedded dictionary iframe.                                   |
| **Copy Action**                       | Copies URL, flashes target, shows toast, closes menu                                                  | Copies `${origin}${pathname}${search}#sec-${secId}`, calls `saveCurrentSpot(secId)`, highlights `#sec-${secId}`, toasts `"Copied permalink: § ${secId}"`.                                                                                 | Copies `${origin}/v2/dicts/id/${articleId}#${senseId}`, flashes sense, adds `.is-copied`, toasts `"Copied link to this section"`.                                                                         |
| **DOM Swap Scope**                    | Keeps `a.section-anchor` visible, hides target content nodes, inserts `.section-edit-box`             | **Sibling layout**: `.reader-gutter` (`a.section-anchor`) and `.reader-passage` are siblings inside `.reader-section#sec-${secId}`. Hides `.reader-passage`; gutter label stays visible.                                                  | **Inline-child layout**: `a.section-anchor` is the first child inside `anchor.parentElement`. Keeps `a.section-anchor` (and any nested sub-sense blocks) visible; hides the sense's own content siblings. |
| **Clean Text Extraction**             | Clones target content, strips non-editorial UI widgets, normalizes whitespace                         | Strips `.reader-note-ref` (`<sup>[1]</sup>`); joins `.reader-line` with `\n` for verse, normalizes whitespace for prose.                                                                                                                  | Excludes `a.section-anchor` (the bullet), `.mateo-embed-pane` (facsimile iframe), `.forc-action-btn`, and any nested sub-sense containers.                                                                |
| **Report Payload (`/v2/api/report`)** | `POST /v2/api/report` with `{ editedText: { original, edited, sectionId }, tags: ["userEdit"], url }` | `sectionId`: `secId` (e.g. `"1.1"`), `url`: reader page URL with `#sec-${secId}`.                                                                                                                                                         | `sectionId`: `senseId` (e.g. `"n20077.1"`), `url`: canonical `/v2/dicts/id/${articleId}#${senseId}` (so reports from embedded iframes still link to the canonical entry).                                 |

---

## 4. Dictionary DOM Edge Cases (`anchor.parentElement` vs. `getElementById`)

In V1 (`tooltips.tsx:L236`), "Edit and Report" resolved the target element via `document.getElementById(senseId)`. Auditing the 5 structured lexicons that emit `.lsSenseBullet.section-anchor` in V2 reveals three DOM edge cases where `document.getElementById(senseId)` is broken or selects the wrong scope, and why resolving relative to `anchor.parentElement` fixes all of them:

1. **Smith & Hall Blurb ID Collision ([`sh_display.ts:L305-320`](../../../common/smith_and_hall/sh_display.ts#L305-L320) & [`entry_view.server.ts:L200`](../dict/entry_view.server.ts#L200))**:
   - The outer `<article class="entry" id="sh57">` and the inner blurb `<div id="sh57">` carry the exact same `id="sh57"`.
   - Calling `document.getElementById("sh57")` returns the entire `<article>` (including the entry header, Outline, Inflections, and every sense), whereas `anchor.parentElement` is always the exact `<div id="sh57">` blurb container.
2. **Riddle & Arnold Self-Targeted Bullet ([`process_riddle_arnold.ts:L49-67`](../../../common/dictionaries/riddle_arnold/process_riddle_arnold.ts#L49-L67) & [`xml_to_html.server.ts:L125-130`](../dict/xml_to_html.server.ts#L125-L130))**:
   - R&A sense `<div>`s do not carry an `id` attribute in the serialized XML; `xml_to_html.server.ts` places `id="ra_dog.1"` directly on the `<a class="lsSenseBullet section-anchor">` itself so `#ra_dog.1` has an anchor target.
   - `document.getElementById("ra_dog.1")` returns only the `" 1. "` bullet link (`<a>`), whereas `anchor.parentElement` is the enclosing `<div>` containing the sense text.
3. **Georges Nested Sub-Senses ([`process_georges.ts:L60-88`](../../../common/dictionaries/georges/process_georges.ts#L60-L88))**:
   - Lewis & Short, Smith & Hall, and Gaffiot emit child `<ol>` lists outside the parent sense's text container (`<li id="...">` or `<span id="...">`), but Georges nests child `<div id="grg123.I.1">` directly inside parent `<div id="grg123.I">`.
   - When extracting text and hiding nodes inside `anchor.parentElement`, excluding child elements that contain their own `a.section-anchor` (as well as child `<ol>` lists) ensures editing a parent sense in Georges only edits that sense's own text and leaves its sub-senses untouched.

---

## 5. User Experience & Interaction Flow

```text
1. IDLE / READING (Reader or Dictionary)
┌────────────────────────────────────────────────────────┐
│  § 1.1   Gallia est omnis divisa in partes tres...     │
└────┬───────────────────────────────────────────────────┘
     │ Click anchor (§ 1.1 or sense bullet I.)
     ▼
2. ANCHORED POPOVER MENU
┌──────────────────────────────┐
│  🔗  Copy permalink          │
│  ✏️  Suggest correction      │
└────┬─────────────────────────┘
     │ Click "Suggest correction"
     ▼
3. ACTIVE IN-PLACE EDITING
┌────────────────────────────────────────────────────────┐
│ § 1.1  Suggesting correction for § 1.1                 │
│ ┌────────────────────────────────────────────────────┐ │
│ │ Gallia est omnis divisa in partes tres, quarum     │ │  <-- Auto-resizing
│ │ unam incolunt Belgae, aliam Aquitani...            │ │      <textarea>
│ └────────────────────────────────────────────────────┘ │
│ [ Submit Correction ]  [ Cancel ]                      │  <-- Action bar
└────────────────────────────────────────────────────────┘
```

### 5.1. Trigger: Anchored Section Popover

1. **Trigger**: Clicking `a.section-anchor` opens a compact floating popover menu (`.anchored-popover`) positioned near the anchor.
2. **Menu Actions**:
   - **Copy permalink**: Runs the slice's copy handler (copies canonical URL, flashes target, saves spot in Reader, shows toast) and closes the popover.
   - **Suggest correction**: Closes the popover and opens the in-place editor for that section or sense.
3. **Accessibility & Dismissal**:
   - `aria-haspopup="menu"`, `aria-expanded="true/false"` on the active trigger.
   - Dismisses on <kbd>Escape</kbd>, outside click (`bindDismissable`), scroll/page turn, or opening another popover (`morcus:popover-will-open`).
4. **No-JS Baseline**:
   - Without JavaScript, `a.section-anchor` retains its native `<a href="#...">` hyperlink behavior, scrolling directly to the section or sense anchor.

### 5.2. Active In-Place Editing Mode

When **Suggest correction** is chosen:

1. **Outside-Click Dismissal & Single Active Editor (`bindDismissable`)**:
   - Clicking anywhere outside `.section-edit-box` (whether on the background or on another section's anchor) evaluates whether the editor has unsaved edits (`textarea.value.trim() !== originalText.trim()`):
     - **Unmodified**: Auto-closes the editor and restores the original DOM immediately.
     - **Modified (dirty)**: Keeps the editor open so typed changes are never lost on a stray click, and displays a toast (`"Submit or cancel your current edit first"`). Attempting to open another section's editor while a dirty editor is open follows the exact same rule.
2. **Clean Text Extraction (`originalText`)**:
   - **Reader**: Clones `.reader-passage`, removes `.reader-note-ref` elements, and extracts plain text (joining `.reader-line` elements with `\n` for verse; normalizing inline whitespace for prose).
   - **Dictionary**: Iterates the child nodes of `anchor.parentElement` after `anchor`, skipping `.mateo-embed-pane`, `.forc-action-btn`, `<ol>`, and any nested sub-sense containers (`:has(a.section-anchor)`), and normalizes inline whitespace.
3. **In-Place DOM Swap**:
   - Hides the original content nodes (`hidden` attribute on `.reader-passage` in Reader, or a temporary wrapper/hidden state on the sense content nodes in Dictionary) while keeping `a.section-anchor` visible.
   - Inserts `.section-edit-box`:
     ```html
     <div class="section-edit-box">
       <div class="section-edit-header">
         <span class="section-edit-label">Suggesting correction for § 1.1</span>
       </div>
       <textarea
         class="section-edit-input"
         rows="2"
         aria-label="Suggest correction for § 1.1"></textarea>
       <div class="section-edit-actions">
         <button
           type="button"
           class="btn btn-sm btn-secondary section-edit-cancel">
           Cancel
         </button>
         <button
           type="button"
           class="btn btn-sm btn-primary section-edit-submit">
           Submit Correction
         </button>
       </div>
     </div>
     ```
4. **Styling & Design Tokens ([`variables.css`](../shell/variables.css), [`components.css`](../core/components.css))**:

   - Uses UI V2's standard tokens and `.btn` classes so it adapts to light/dark themes, reader font scale (`--reader-font`, `--reader-scale`), and dictionary scale (`--dict-scale`):

     ```css
     .section-edit-box {
       display: flex;
       flex-direction: column;
       gap: var(--space-2);
       width: 100%;
       margin-top: var(--space-1);
     }

     .section-edit-input {
       width: 100%;
       box-sizing: border-box;
       font: inherit;
       line-height: inherit;
       background: var(--input-bg);
       color: var(--text);
       border: 1px solid var(--border-focus);
       border-radius: var(--radius-md);
       padding: var(--space-2) var(--space-3);
       resize: vertical;
       overflow-y: hidden;
     }

     .section-edit-input:focus-visible {
       outline: none;
       box-shadow: var(--focus-ring);
     }
     ```

5. **Event & Focus Isolation**:
   - Focus is placed inside `<textarea>` on open; height auto-adjusts on `input` (`scrollHeight`).
   - Word-lookup click handlers in both `MorcusReaderView` and `MorcusDictSearch` ignore clicks inside `.section-edit-box` (and `<textarea>` contains no `.lat-word` elements).
   - Keyboard shortcuts inside `<textarea>`:
     - <kbd>Cmd</kbd>+<kbd>Enter</kbd> / <kbd>Ctrl</kbd>+<kbd>Enter</kbd>: Submit correction.
     - <kbd>Escape</kbd>: Explicitly cancel editing and restore focus to `a.section-anchor`.
   - Reader single-key shortcuts (`[`, `]`, `ArrowLeft`, `ArrowRight`, `d`, `n`, `t`) already ignore events originating from `TEXTAREA` ([`reader_view.client.ts`](reader_view.client.ts)), so typing in the editor cannot accidentally turn pages or switch tabs.

---

## 6. Submission & Issue Pipeline Integration

### 6.1. Dismiss / Cancel / Submit Lifecycle

1. **Outside Click (Background Dismissal)**:
   - If `textarea.value.trim() === originalText.trim()`, closes the editor and restores the original DOM.
   - If modified, keeps the editor open and shows toast `"Submit or cancel your current edit first"`.
2. **Explicit Cancel (`Cancel` Button or <kbd>Escape</kbd>)**:
   - Always removes `.section-edit-box` (even if modified), unhides the original content nodes, and restores focus to `a.section-anchor`.
3. **Submit (`Submit Correction` Button or <kbd>Cmd/Ctrl</kbd>+<kbd>Enter</kbd>)**:
   - Reads `editedText = textarea.value.trim()`.
   - If `!editedText || editedText === originalText.trim()`:
     - Shows toast `"No changes to submit"`, exits edit mode, and restores original view without making a network request.
   - If modified:
     - Disables buttons while in flight (`Submitting...`).
     - Sends `POST /v2/api/report` with `{ editedText: { original: originalText, edited: editedText, sectionId }, tags: ["userEdit"], url }`.
     - **On success**: Restores original DOM and shows toast `"✓ Correction submitted! Thank you."`.
     - **On error**: Re-enables buttons, shows toast `"Failed to submit correction. Please try again."`, and keeps `.section-edit-box` open with the user's text preserved.

### 6.2. Server Route: [`src/web/v2/api_routes.server.ts`](../api_routes.server.ts)

Update `postAsync("/api/report")` to accept either freeform `reportText` (from `<morcus-report-dialog>`) or structured `editedText` (from in-flow section/sense edits), plus optional `tags`:

```typescript
const isObj = typeof body === "object" && body !== null;
const reportText =
  isObj && "reportText" in body && typeof body.reportText === "string"
    ? body.reportText.trim()
    : undefined;

const editedRaw =
  isObj &&
  "editedText" in body &&
  typeof body.editedText === "object" &&
  body.editedText !== null
    ? (body.editedText as Record<string, unknown>)
    : undefined;

const editedText =
  editedRaw &&
  typeof editedRaw.original === "string" &&
  typeof editedRaw.edited === "string" &&
  typeof editedRaw.sectionId === "string" &&
  editedRaw.original.trim() !== "" &&
  editedRaw.edited.trim() !== "" &&
  editedRaw.sectionId.trim() !== ""
    ? {
        original: editedRaw.original,
        edited: editedRaw.edited,
        sectionId: editedRaw.sectionId.trim(),
      }
    : undefined;

if (!reportText && !editedText) {
  res
    .status(400)
    .json({ error: "Either reportText or editedText is required" });
  return;
}

const tags =
  isObj && "tags" in body && Array.isArray(body.tags)
    ? body.tags.filter((t): t is string => typeof t === "string")
    : undefined;

const reportRequest: ReportApiRequest = {
  reportText: reportText || undefined,
  editedText,
  tags,
  commit: process.env.COMMIT_ID ?? "undefined",
  url:
    isObj && "url" in body && typeof body.url === "string"
      ? body.url
      : undefined,
  userAgent: req.headers["user-agent"],
};
```

Existing logic in [`src/web/utils/github.ts:L16-35`](../../../web/utils/github.ts#L16-L35) already formats `editedText` with `diffWordsWithSpace` (`~~removed~~` / `**added**`), titles the issue `User Edit: <sectionId>: <excerpt>`, and applies labels `["userReport", "userEdit"]`.

---

## 7. Verification & Testing Strategy

1. **Shared Core & Slice Unit Tests (`core/`, `reader/reader_view.test.ts`, `dict/dict_permalink.test.ts`)**:
   - Clicking `a.section-anchor` in Reader and Dictionary opens the 2-item popover menu (`Copy permalink` and `Suggest correction`).
   - External Reader (`<morcus-reader-view>` without `data-work`) does not expose "Suggest correction".
   - Dictionary article header `a.copy-pill` remains a direct 1-click copy without opening an edit menu.
   - Text extraction strips `.reader-note-ref` in Reader and excludes `.section-anchor`, `.mateo-embed-pane`, `.forc-action-btn`, and nested sub-senses in Dictionary.
   - Dictionary target resolution via `anchor.parentElement` handles Smith & Hall duplicate blurb IDs (`#sh57`), Riddle & Arnold self-targeted anchors (`#ra_dog.1`), and Georges nested sense `<div>`s (`#grg123.I`).
   - Clicking outside `.section-edit-box` auto-closes an unmodified editor, and keeps a modified editor open with a `"Submit or cancel your current edit first"` toast.
   - <kbd>Escape</kbd> and Cancel restore the original DOM and focus `a.section-anchor` with zero network calls (even when modified).
   - <kbd>Cmd/Ctrl</kbd>+<kbd>Enter</kbd> and Submit send `{ editedText, tags: ["userEdit"], url }` to `/v2/api/report` and restore the DOM on success.
   - Unchanged text skips the network call and shows a toast.
2. **Server API Tests (`src/web/v2/v2_router.test.ts` / `api_routes`)**:
   - Verify `/v2/api/report` accepts `{ editedText: { original, edited, sectionId }, tags: ["userEdit"], url }`.
   - Verify HTTP 400 when both `reportText` and `editedText` are missing or empty.
3. **Pre-Commit Check Suite**:
   - `npx eslint --cache src/web/v2`
   - `npm run lint:css`
   - `npx tsc --noEmit`
   - `npm run tsnp src/bundler/v2.rsbuild.ts -- --minify` (verify bundle stays within `v2_bundle_budget.ts`)
   - `npm run ts-tests:v2`
   - `npx prettier --cache src/web/v2 --check`
