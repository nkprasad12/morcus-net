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

## Event handling

- [ ] 🟢 **Review document-level takeovers in shared helpers.** `bindDismissable`
      (`core/dismissable.client.ts`) calls `preventDefault` on Escape for any target while its
      overlay is open, with no `defaultPrevented` check, so a nested widget that handles Escape
      still closes the outer overlay. `popover`'s focus trap takes Tab even when focus is outside
      the panel (it does check `defaultPrevented`). `abbr_popover` suppresses clicks on any
      `.lsHover`, which would also swallow navigation if one ever sat inside a link.

## Component contracts

- [ ] 🟡 **Make revealers idempotent by contract, and test it.** README says `reveal(target)` must
      be idempotent, but the [`Revealer`](../core/reveal.client.ts) type doesn't, and no test calls a
      revealer twice. Back/forward and `beforematch` can repeat a reveal. `reader_panel`'s
      revealer calls `setTab("translation")`, which re-shows the spinner and starts a second fetch
      while the first is in flight, and fires `onTabChange` again. `reader_view`'s
      `restoreDrawer()` is unverified. Fix: document it on `Revealer`, guard the in-flight
      translation load, and add a call-twice test per revealer (same state, one fetch).

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
- [ ] 🟡 **Catch optional client lookups that no server markup satisfies.** A missing
      `this.scope.require(...)` target fails on connect, so the conformance sweeps catch it, but
      an optional lookup (`this.scope.$`, `querySelector`, `getElementById`) just returns `null` and
      the behaviour silently stops. Nothing checks these since `reader_selector_contract.test.ts` was
      retired; it only scanned two reader modules by regex anyway. Fix: while
      `core/ssr_conformance.test.ts` mounts its fixtures, record each optional scope lookup and its
      result, and fail if a selector matches nothing in every fixture. Expect a short allowlist for
      lookups that really are optional (e.g. `#toggle-macra` exists only for works with macra).

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
