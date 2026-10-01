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

- [ ] 🟢 **Tighten the reader's window-level keyboard shortcuts.** `reader_view.client.ts` listens
      for `keydown` on `window` and calls `preventDefault` for page turns, TOC, panel tabs and
      settings. It skips modifier keys, `contenteditable`, `input`, `textarea` and `select`, but
      not `e.defaultPrevented`, `e.isComposing`, `role="textbox"`/`combobox`/`listbox` targets, or
      focus inside a dialog, popover or menu elsewhere on the page (the report dialog, the section
      menu). It also calls `settings.toggle()` on `morcus-reader-settings` without checking it
      upgraded.
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
- [ ] 🟢 **Resolve repeatedly queried elements once, on connect.** Some controllers, mostly in the
      reader (`reader_view`, `reader_settings`, `reader_toc`, `reader_panel`), look up the same
      element by selector string at each use. Each lookup is a place where a markup change can
      silently break behaviour. Where an element is looked up more than once, resolve it on connect
      (`this.scope.require`) into a field, or hand the behaviour to a `core/` controller. A single
      lookup on connect is fine as it is.

## Dead code

- [ ] 🟢 **Use or delete `ReaderPageOptions.view`** (`reader/reader.server.ts`). Nothing reads it:
      `resolveReaderContext` renders the passage from `singleHtml` either way, `renderTocDrawer` and
      `buildReaderPageUrl` are never passed a `viewMode`, and the partial route
      (`sendReaderPassage` in `reader_routes.server.ts`) doesn't forward `?view=`. Callers that pass
      `view: "parallel"` (`core/route_bundle_conformance.test.ts`) get the single view. The client
      still compares `?view=` in `MorcusReaderView.handleClick`, so a `view=parallel` link counts as a
      different page.

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
- [ ] 🟢 **`reader_panel.client.ts`**: `setTab` builds the Translation tab's loading spinner and
      error block on the client. The spinner is excused by a reviewed `CREATED_DOM_ALLOWLIST` entry
      (`#panel-view-translation > .reader-translation-loading`). Server-render both states hidden
      inside `#panel-view-translation` and toggle them instead; that retires the allowlist entry.
      Separately, the error block's `#btn-retry-translation` (`type="button"`, outside any form) has
      no `data-js-only`, so the created-control check would flag it. The harness doesn't reach it
      today because the fake network never fails.
- [ ] 🟢 **`library_view.client.ts`**, **`external_loader.client.ts`**: the resume badge and
      saved-items list are built on the client.

## Test coverage

- [ ] 🟢 **PH4 has no test.** The Greek embed adopts a `<details>` or checkbox toggled before
      upgrade (`dict/dict_greek.client.ts`), but nothing exercises it; see the PH index in
      [`TESTING.md`](TESTING.md#pre-hydration-ph-bug-index).
- [ ] 🟡 **Reader preference save/hydrate lifecycle** (`reader_view.client.ts`).
- [ ] 🟡 **`DrawerController` snap thresholds and flick-velocity logic**: extract the snap math to a
      pure function and test that directly.
- [ ] 🟡 **Widen or retire the selector inventory contract test
      ([`reader_selector_contract.test.ts`](../reader/reader_selector_contract.test.ts)).** First check
      whether the SSR and interaction conformance harnesses ([`TESTING.md`](TESTING.md)) already cover
      dead selectors; if so, delete it. Otherwise:
  - Scan more than `reader_toc.client.ts` + `reader_settings.client.ts`. `reader_view.client.ts`
    alone binds ~32 selectors and is unscanned, as are `reader_panel`, `drawer`, and every `dict_*`
    module.
  - Match `this.scope.require(...)`, which the current extractor regex misses.
  - Match delegated selectors: the 3rd argument of `delegate(root, type, selector, fn)` (e.g.
    `#btn-retry-translation`) is invisible today.
  - Stop skipping comma-containing selectors (`if (!raw.includes(","))`), which silently exempts
    real bindings such as `#toggle-inflected, .inflected-checkbox`.
- [ ] 🟢 **Visual scenarios for post-interaction state in the dictionary.** `v2VisualScenario`'s
      `action` hook is used only by reader scenarios. Popover-open and results-with-one-dictionary
      would catch selection bugs as a pixel diff across all four form factors.

## Test console noise

`npm run ts-tests:v2` passes but prints ~660 lines of expected errors and warnings, so a real one
would go unnoticed. Expected output should be asserted, not printed:

- [ ] 🟡 **Assert expected errors instead of printing them.** Spy on `console.error`/`console.warn`
      and check the message in `v2_router.test.ts` (5 errors from deliberately failing backends),
      `dict/dict_chunk_cache.client.test.ts` (2 network failures), and `core/combobox.test.ts`
      (2 `[UI V2] Listener skipped` warnings, each dumping an ~85-line element).
- [ ] 🟡 **Find the jsdom `Not implemented: navigation` errors.** 4 from `dict/dict_search.test.ts`,
      2 from `reader/reader_view.test.ts`: a test clicks a real link that nothing intercepts, and
      jsdom tries to navigate on a timer after the test ends. Where navigating is the expected
      outcome (e.g. reader's "a failed page turn falls back to a full navigation"), block it in the
      test and assert it was attempted. Where a component should have intercepted the click, fix the
      component.
- [ ] 🟢 **Bundle-size table in `v2_router.test.ts`** (3 `console.log`s from the code under test):
      stub the logger.
- [ ] 🟢 **`[DEP0040] punycode` deprecation**, once per jest worker, from a dependency. Consider
      `--no-deprecation` in the `ts-tests:v2` script.
- [ ] 🟢 **Then keep it quiet:** consider failing any V2 test that logs to `console.error` or
      `console.warn` without spying on it (in `testing/setup_tests.ts`).

## Lint

- [ ] 🟢 **Extend the import-boundary lint beyond `src/web/v2` and `src/bundler`.** The tier rules in
      `eslint.config.mjs` only match files inside those two trees. Elsewhere, e.g.
      `src/start_server.ts`, `src/scripts/**` and `src/integration/**`, nothing stops Node code
      importing a `*.client.ts` module (DOM globals at load time) or browser-bound code picking up a
      `*.server.ts`. Low priority: no such import exists today.

## Performance

These were found while investigating a report that resizing the reader drawer feels laggy. The bug
among them (a dead drag-transition selector) has landed and was expected to account for most of the
symptom, so **re-measure before spending effort on these**. None has been profiled.

- [ ] 🟡 **Don't tokenize the whole chapter synchronously on mount.** `reader_view.client.ts` walks
      every target block calling `tokenizeElement` inside `onConnect`: one long task that delays
      first interaction. Batch via `requestIdleCallback`.
- [ ] 🟡 **Add CSS containment to the reader text panel.** There is no `contain:` anywhere in
      `src/web/v2` (only `content-visibility` on panel tabs), so a drawer or splitter resize
      relayouts the full text panel and all of its inline word spans.
