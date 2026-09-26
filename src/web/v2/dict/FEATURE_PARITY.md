# V1 SPA vs V2 Progressively Enhanced SSR: Dictionary Feature Parity

This document outlines the remaining feature gaps between the **V1 UI (SPA)** (`src/web/client/pages/dictionary/`) and the **V2 UI (Progressively Enhanced SSR)** (`src/web/v2/dict/`), focusing on capabilities previously present in V1 that are still missing or degraded in V2.

> [!NOTE]
> Future architectural and performance enhancements (such as entry body fragment caching, pre-computed autocomplete chunks, and TOC scroll-spy) are tracked in [`TODOS.md`](TODOS.md).

---

## 1. Remaining Gaps Matrix

| Feature Area                           | V1 UI (SPA)                                                                                                            | V2 UI (SSR + Progressive Enhancement)                                                                                                                             | Parity Status                 |
| :------------------------------------- | :--------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------- |
| **In-Flow "Edit and Report"**          | Sense bullet (`.lsSenseBullet`) opens tooltip menu with "Copy link" **and** "Edit and Report" (`contenteditable` diff) | Sense bullet (`a.section-anchor`) opens anchored popover menu with "Copy permalink" and "Suggest correction" (in-place `<textarea>` swap + `/v2/api/report` diff) | ✅ **Completed in V2**        |
| **Global Multi-Lexicon Entry Summary** | Top-level summary listing all matched entries across dictionaries                                                      | Pinned entry summary in TOC rail (desktop) and drawer (mobile) with chips                                                                                         | ✅ **Completed in V2**        |
| **Embedded Reader View Options**       | `hideSearch`, `textScale`, `skipJumpToResult`, isolated settings                                                       | Suppresses app bar & search bar, resolves drawer collision, adds inline lexicon badges, and syncs proportional `textScale` via `--dict-scale`                     | ✅ **Completed in V2**        |
| **Desktop Table of Contents**          | Dedicated two-column sidebar (`.tocSidebar`)                                                                           | Semantic, sticky two-column rail sidebar (`morcus-dict-toc`) flush at top                                                                                         | ✅ **Completed in V2**        |
| **Mobile Drawer Layout**               | Draggable, resizable bottom drawer (`BottomDrawer`)                                                                    | Draggable, resizable bottom drawer (`morcus-dict-toc` + `DrawerController`)                                                                                       | ✅ **Completed in V2**        |
| **Mobile Layout Preference**           | Setting toggling between "Drawer" and "Classic" single column                                                          | Unified responsive layout (drawer on mobile, rail on desktop)                                                                                                     | ℹ️ **Intentional Streamline** |

---

## 2. Shipped In-Flow "Edit and Report" on Senses

- **Unified Design & Implementation**: See [`../reader/IN_FLOW_EDITING_DESIGN.md`](../reader/IN_FLOW_EDITING_DESIGN.md), [`core/section_edit.client.ts`](../core/section_edit.client.ts), and [`dict_permalink.client.ts`](dict_permalink.client.ts).
- Clicking `a.section-anchor` inside `article.entry[id]` opens the shared 2-item `.section-action-menu` (`Copy permalink` and `Suggest correction`), while article-level `a.copy-pill` remains a 1-click copy.
- Resolves editable sense scope from `anchor.parentElement` (handling Smith & Hall blurb ID collisions, Riddle & Arnold self-targeted anchors, and Georges nested sub-senses) and submits diffs tagged with `["userEdit"]` to `/v2/api/report`.
