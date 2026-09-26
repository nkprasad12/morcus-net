# Reader In-Flow "Edit and Report" Design (§2.8)

Technical design document for restoring in-flow errata and typo reporting in the **UI V2 Reader** (`src/web/v2/reader/`), addressing feature parity gap [§2.8 in `FEATURE_PARITY.md`](FEATURE_PARITY.md#28-in-flow-edit-and-report).

---

## 1. Background & Problem Statement

In the **V1 UI** (`src/web/client/pages/library/reader.tsx:L1057`, `tooltips.tsx:L215-256`):

- Each section citation anchor (`WorkChunkHeader`) opened a contextual `TooltipMenu` with two actions:
  1. **Copy link**: Copied the canonical permalink to the clipboard.
  2. **Edit and Report**: Made the section text editable in-place via `contenteditable="true"` and focused it.
- When the user blurred the element, V1 compared `updated` vs `original` text. If altered, it automatically dispatched a report to `ReportApi` with `{ original, edited, sectionId }` and tag `["userEdit"]`.
- The backend (`src/web/utils/github.ts`) used `diffWordsWithSpace` to generate a formatted GitHub issue with markdown word diffs (`~~deleted~~` / `**added**`), section citation IDs, commit hashes, and URLs.

### The Value of In-Flow Reporting

Typo reports that require a reader to navigate away, open a generic feedback modal, manually specify where an error occurs within a 500-line Latin passage, and type both versions suffer massive drop-off. Capturing corrections **in context** with the exact section citation ID and before/after diff eliminates friction and generates high-fidelity errata.

### Current V2 Status & Blockers

1. **No Trigger Surface**: In V2 ([`reader_view.client.ts:L321-346`](reader_view.client.ts#L321-L346)), clicking `a.section-anchor` immediately copies the URL to clipboard, triggers a visual flash (`.target-highlight`), saves the reading spot, and displays a toast. There is currently no secondary action or menu surface.
2. **DOM & Tokenization Invariants**: V2 passages are tokenized into `<span class="lat-word">` elements for dictionary lookups, `<span class="reader-line">` for verse, and `<a class="reader-note-ref"><sup>1</sup></a>` for apparatus footnotes. Unconstrained typing inside this DOM tree breaks tokenization and corrupts click delegation.
3. **API Endpoint Omission**: [`src/web/v2/api_routes.server.ts:L90-100`](../api_routes.server.ts#L90-L100) requires `reportText` and drops `editedText` and `tags` support, returning HTTP 400 if `reportText` is omitted.

---

## 2. Technical Evaluation: `contenteditable` vs. In-Place Textarea Swap

| Evaluation Axis           | Raw `contenteditable` (V1 Approach)                                                                       | In-Place Textarea Swap (V2 Proposed)                                                                 |
| :------------------------ | :-------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------- |
| **DOM Invariants**        | ❌ Splinters `<span class="lat-word">`, breaks dictionary lookups, requires re-tokenization.              | ✅ Original passage DOM is preserved intact in memory; zero token corruption.                        |
| **Footnote Isolation**    | ❌ Easy to accidentally delete or edit inline footnote anchors (`<sup>1</sup>`), contaminating the diff.  | ✅ Footnote markers are stripped during plain-text extraction; pure text diff guaranteed.            |
| **Event Collisions**      | ❌ Clicking to place the cursor or drag-selecting text triggers dictionary word lookups.                  | ✅ `<textarea>` isolates all pointer and keyboard events from passage click listeners.               |
| **Mobile & IME Input**    | ⚠️ Unreliable; virtual keyboards and autocomplete trigger erratic DOM mutations across engines.           | ✅ 100% native browser support for mobile keyboards, autocomplete, dictation, and selection handles. |
| **History & Undo**        | ⚠️ Brittle; native browser undo (<kbd>Cmd</kbd>+<kbd>Z</kbd>) frequently breaks across custom span trees. | ✅ Native, reliable undo/redo history out of the box.                                                |
| **Interaction Lifecycle** | ⚠️ V1 relied on raw `blur`, which submits accidentally if a user taps outside or adjusts focus.           | ✅ Explicit transaction model with `[✓ Submit Correction]` and `[✕ Cancel]`.                         |

**Conclusion**: Rather than forcing `contenteditable` onto an intricate tokenized DOM, V2 will execute an **in-place element swap** using an auto-resizing `<textarea>`. Styled with identical typographic CSS variables, it produces the exact same in-flow feeling with complete structural safety.

---

## 3. Architecture & User Experience

```text
1. IDLE / READING
┌────────────────────────────────────────────────────────┐
│  § 1.1   Gallia est omnis divisa in partes tres...     │
└────┬───────────────────────────────────────────────────┘
     │ Click anchor (§ 1.1)
     ▼
2. ANCHORED POPOVER MENU
┌──────────────────────────────┐
│  Section § 1.1               │
├──────────────────────────────┤
│  📋  Copy permalink          │
│  ✏️  Suggest correction       │
└────┬─────────────────────────┘
     │ Click "Suggest correction"
     ▼
3. ACTIVE IN-PLACE EDITING
┌────────────────────────────────────────────────────────┐
│ § 1.1  [ ✏️ Suggesting Correction ]                     │
│ ┌────────────────────────────────────────────────────┐ │
│ │ Gallia est omnis divisa in partes tres, quarum     │ │  <-- Auto-resizing
│ │ unam incolunt Belgae, aliam Aquitani...            │ │      <textarea>
│ └────────────────────────────────────────────────────┘ │
│ [ ✓ Submit Correction ]  [ ✕ Cancel ]                  │  <-- Action bar
└────────────────────────────────────────────────────────┘
```

### 3.1. Trigger: Anchored Section Popover

1. **Trigger Button**: Clicking `a.section-anchor` in `.reader-gutter` opens a compact, floating contextual popover anchored to the gutter element.
2. **Options**:
   - **Copy permalink**: Copies the canonical URL, updates `savedSpotsStore`, shows toast `"Copied permalink: § <secId>"`, and closes the popover.
   - **Suggest correction**: Closes the popover and engages section editing mode.
3. **Accessibility**:
   - `aria-haspopup="menu"`, `aria-expanded="true/false"`.
   - Keyboard accessible via <kbd>Enter</kbd> / <kbd>Space</kbd> on the anchor.
   - Arrow keys / <kbd>Tab</kbd> cycle menu items; <kbd>Escape</kbd> dismisses.
4. **No-JS Baseline**:
   - Without JavaScript, `a.section-anchor` retains its native `<a href="#sec-1.1">` hyperlink functionality, scrolling directly to the section anchor with zero JS dependencies.

### 3.2. Active Section Editing Mode

When "Suggest correction" is selected for section `sec-<secId>`:

1. **Clean Text Extraction**:
   - Clone the target `.reader-passage` element in memory.
   - Remove all apparatus note markers (`.reader-note-ref`).
   - Extract sanitized text content:
     - For prose: normalize whitespace across paragraph/span boundaries.
     - For verse: preserve explicit linebreaks (`\n`) for each `.reader-line`.
   - Store this text as `originalText`.
2. **In-Place Swap**:
   - Hide the rendered `.reader-passage` element (`hidden` attribute).
   - Insert an edit container into the section containing:
     - An auto-resizing `<textarea class="section-edit-input">`, populated with `originalText`.
     - An action micro-toolbar:
       ```html
       <div class="section-edit-actions">
         <span class="section-edit-label">Suggesting correction for § 1.1</span>
         <div class="section-edit-buttons">
           <button type="button" class="reader-btn btn-sm section-edit-cancel">
             Cancel
           </button>
           <button
             type="button"
             class="reader-btn btn-sm btn-primary section-edit-submit">
             Submit Correction
           </button>
         </div>
       </div>
       ```
3. **Styling & Typographic Fidelity**:
   - The `<textarea>` matches the reading canvas typography:
     ```css
     .section-edit-input {
       width: 100%;
       font-family: var(--reader-font-family);
       font-size: var(--reader-font-size);
       line-height: var(--reader-line-height);
       background: var(--surface-bg-subtle);
       color: var(--foreground);
       border: 1px solid var(--border-color-focus);
       border-radius: var(--radius-sm);
       padding: var(--space-2);
       resize: none;
       overflow: hidden;
     }
     ```
   - Automatically adjusts its height to fit text content on mount and input (`scrollHeight`).
4. **Event & Focus Isolation**:
   - Focus is automatically set on the `<textarea>`.
   - Dictionary lookup delegation checks for `.editing-active` or ignore rules and skips lookups inside the active editor.
   - Keyboard shortcuts:
     - <kbd>Cmd</kbd>+<kbd>Enter</kbd> / <kbd>Ctrl</kbd>+<kbd>Enter</kbd>: Submit correction.
     - <kbd>Escape</kbd>: Cancel editing.

---

## 4. Submission & Issue Pipeline Integration

### 4.1. Lifecycle & Validation

1. **Cancel**:
   - Removes the edit container.
   - Restores the original `.reader-passage` element (`removeAttribute("hidden")`).
   - Returns focus to `a.section-anchor`.
   - Zero state mutation or network calls.
2. **Submit**:
   - Reads `editedText = textarea.value.trim()`.
   - If `editedText === originalText.trim()`:
     - Displays toast: `"No changes detected"`.
     - Exits edit mode and restores original view.
   - If changed:
     - Disables buttons and adds loading indicator to the Submit button.
     - Sends asynchronous payload to `/v2/api/report`.
     - On success:
       - Restores original passage view.
       - Displays confirmation toast: `"✓ Correction submitted for § <secId>! Thank you."`
     - On error:
       - Re-enables buttons.
       - Displays error toast: `"Failed to submit correction. Please try again."`
       - Keeps the `<textarea>` open with user's edits preserved so work is not lost.

### 4.2. API & Server Changes

#### Server Route: `src/web/v2/api_routes.server.ts`

Update `postAsync("/api/report")` to accept either `reportText` or `editedText`:

```typescript
// Validate payload: accepts either freeform reportText OR structured editedText
const isObj = typeof body === "object" && body !== null;
const reportText =
  isObj && "reportText" in body && typeof body.reportText === "string"
    ? body.reportText.trim()
    : undefined;

const editedTextRaw =
  isObj &&
  "editedText" in body &&
  typeof body.editedText === "object" &&
  body.editedText !== null
    ? (body.editedText as Record<string, unknown>)
    : undefined;

const editedText =
  editedTextRaw &&
  typeof editedTextRaw.original === "string" &&
  typeof editedTextRaw.edited === "string" &&
  typeof editedTextRaw.sectionId === "string"
    ? {
        original: editedTextRaw.original,
        edited: editedTextRaw.edited,
        sectionId: editedTextRaw.sectionId,
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
  reportText,
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

#### GitHub Issue Formatting

Existing implementation in [`src/web/utils/github.ts:L17-35`](../../../web/utils/github.ts#L17-L35) automatically consumes `editedText`:

- Generates inline word diff via `diffWordsWithSpace`.
- Sets issue title: `User Edit: <sectionId>: <excerpt>`.
- Labels issue with `["userReport", "userEdit"]`.

---

## 5. Verification & Testing Strategy

1. **Unit Tests (`src/web/v2/reader/reader_view.test.ts`)**:
   - Section anchor click reveals popover menu with "Copy permalink" and "Suggest correction".
   - "Copy permalink" retains existing clipboard copy, saved spot persistence, and toast feedback.
   - "Suggest correction" swaps `.reader-passage` for `<textarea>` populated with clean, stripped Latin text.
   - Apparatus footnote markers (`a.reader-note-ref`) are excluded from extracted text.
   - <kbd>Escape</kbd> and Cancel button cancel cleanly and restore original DOM.
   - <kbd>Cmd</kbd>+<kbd>Enter</kbd> and Submit button dispatch expected payload to `/v2/api/report`.
   - Handling of identical text (no changes detected) avoids unnecessary API calls.
2. **Server API Tests (`src/web/v2/api_routes.server.test.ts`)**:
   - Verify `/v2/api/report` accepts `{ editedText: { original, edited, sectionId }, tags: ["userEdit"] }`.
   - Verify 400 rejection when both `reportText` and `editedText` are omitted.
3. **Pre-Commit Check Suite**:
   - `npx eslint --cache src/web/v2`
   - `npm run lint:css`
   - `npx tsc --noEmit`
   - `npm run ts-tests:v2`
