# UI V2 Code Health Backlog

Open code-quality and refactoring work for `src/web/v2/`. Cross-cutting gaps in `core/` primitives
live in [`FRAMEWORK_GAPS.md`](FRAMEWORK_GAPS.md); feature work lives in each slice's `TODOS.md`.

**How to use this file**

- Each item is scoped to be **one small, independently landable change**.
- Sizes: 🟢 < 30 min · 🟡 an hour or two · 🔴 half a day+
- When adding new debt, add it here rather than a TODO comment, so it stays reviewable.
- When an item lands, **delete it**. Record what you learned as a comment at the code (or a lint
  rule or test) where the mistake would be made. Only if it is likely to recur and nothing there
  would catch it, add one or two sentences to [`DESIGN_TRAPS.md`](DESIGN_TRAPS.md).

---

## Client DOM construction outside `core/`

Client code outside `core/` that builds or rewrites DOM duplicates markup the server already knows
how to render, and the two copies drift. Prefer server-rendering the markup and adopting it on
connect, or moving the construction into a `core/` helper. `./morcus.sh inventory`
(`domMutationOutsideCore` in [`inventory_ratchet.json`](../inventory_ratchet.json)) only guards against
growth; it is not a target.

- [ ] 🟡 **`reader_view.client.ts`**: the bottom-sheet label ("Definitions for **word**", the
      " · tap to expand" hint, and the `textContent` reset in `dismissDictionary`) is rebuilt on the
      client, replacing the server-rendered teaser spans. It is only visible in the External Reader:
      every library work has an About tab, and `.has-companion-tabs` hides the label at every width.
      Server-render a `data-js-only` `<strong>` and hint span and toggle them instead. Its `lat-word`
      span factory also duplicates `createWordLink` in `core/tokenize.client.ts`.

## Test coverage

- [ ] 🟢 **Visual scenarios for post-interaction state in the dictionary.** `v2VisualScenario`'s
      `action` hook is used only by reader scenarios. Popover-open and results-with-one-dictionary
      would catch selection bugs as a pixel diff across all four form factors.

## Performance

This was found while investigating a report that resizing the reader drawer feels laggy. It has not
been profiled, so **measure before spending effort on it**.

The drag work itself (drawer, splitter, page width) has since been profiled and fixed. The main
cost was writing inherited properties (custom properties, `cursor`, `user-select`) on an ancestor,
which restyles every descendant on each move. Live drag values are now written on the element that
consumes them. CSS containment on the text panel was tried and gave no measurable gain, so it is
not tracked here.

- [ ] 🟡 **Don't tokenize the whole chapter synchronously on mount.** `reader_view.client.ts` walks
      every target block calling `tokenizeElement` inside `onConnect`: one long task that delays
      first interaction. Batch via `requestIdleCallback`.
