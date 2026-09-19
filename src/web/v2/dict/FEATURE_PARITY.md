# V1 SPA vs V2 Progressively Enhanced SSR: Dictionary Feature Parity

This document outlines the remaining feature gaps between the **V1 UI (SPA)** (`src/web/client/pages/dictionary/`) and the **V2 UI (Progressively Enhanced SSR)** (`src/web/v2/dict/`), focusing on capabilities previously present in V1 that are still missing or degraded in V2.

> [!NOTE]
> Future architectural and performance enhancements (such as entry body fragment caching, pre-computed autocomplete chunks, and TOC scroll-spy) are tracked in [`TODOS.md`](TODOS.md).

---

## 1. Remaining Gaps Matrix

| Feature Area                           | V1 UI (SPA)                                                                                                            | V2 UI (SSR + Progressive Enhancement)                                                                                                         | Parity Status                 |
| :------------------------------------- | :--------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------- |
| **In-Flow "Edit and Report"**          | Sense bullet (`.lsSenseBullet`) opens tooltip menu with "Copy link" **and** "Edit and Report" (`contenteditable` diff) | Section anchor copies URL immediately; no menu, no `contenteditable`, no `userEdit` reporting                                                 | ❌ **Missing in V2**          |
| **Global Multi-Lexicon Entry Summary** | Top-level summary listing all matched entries across dictionaries                                                      | Pinned entry summary in TOC rail (desktop) and drawer (mobile) with chips                                                                     | ✅ **Completed in V2**        |
| **Embedded Reader View Options**       | `hideSearch`, `textScale`, `skipJumpToResult`, isolated settings                                                       | Suppresses app bar & search bar, resolves drawer collision, adds inline lexicon badges, and syncs proportional `textScale` via `--dict-scale` | ✅ **Completed in V2**        |
| **Desktop Table of Contents**          | Dedicated two-column sidebar (`.tocSidebar`)                                                                           | Semantic, sticky two-column rail sidebar (`morcus-dict-toc`) flush at top                                                                     | ✅ **Completed in V2**        |
| **Mobile Drawer Layout**               | Draggable, resizable bottom drawer (`BottomDrawer`)                                                                    | Draggable, resizable bottom drawer (`morcus-dict-toc` + `DrawerController`)                                                                   | ✅ **Completed in V2**        |
| **Mobile Layout Preference**           | Setting toggling between "Drawer" and "Classic" single column                                                          | Unified responsive layout (drawer on mobile, rail on desktop)                                                                                 | ℹ️ **Intentional Streamline** |

---

## 2. Detailed Gap Analysis

### 2.1. In-Flow "Edit and Report" on Senses

- **V1 (`dictionary_utils.tsx:L275-283`, `tooltips.tsx:L210-256`)**:
  - In Lewis & Short (and other structured entries), every sense bullet (`.lsSenseBullet`) was wrapped in `SectionLinkTooltip` with `id={senseId}` and `idToEdit={senseId}`.
  - Clicking the bullet opened a `TooltipMenu` with two actions:
    1. **Copy link**: Copied the deep-link URL to that sense.
    2. **Edit and Report**: Set `contenteditable="true"` directly on the sense element and focused it. On `blur`, if the user modified the text, it submitted `reportIssue({ original, edited, sectionId }, ["userEdit"])`.
- **V2 (`dict_permalink.client.ts`)**:
  - ❌ **Missing**. Clicking `a.section-anchor` immediately calls `copyOrNavigate`, copying the URL to the clipboard with a temporary toast.
  - There is currently no menu affordance on the sense anchor, so there is nowhere to hang an "Edit and Report" action without first introducing a small popover/menu or secondary action.

---

## 3. Remediation Roadmap

1. **Restore In-Flow Edit and Report on Dictionary Senses**:
   - Introduce a lightweight menu or popover on dictionary `a.section-anchor` clicks (offering "Copy link" and "Edit and Report").
   - Port `contenteditable` inline editing and diff submission tagged with `["userEdit"]` via the existing report dialog infrastructure (`report_dialog.client.ts`).
