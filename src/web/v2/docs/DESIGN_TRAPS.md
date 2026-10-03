# UI V2 Design Traps

Mistakes that are easy to repeat and that nothing at the point of the mistake will catch. Keep each
entry to a sentence or two. If a lint rule, test, or comment at the relevant code would catch it,
put it there instead of here.

## Testing

- **"The expected item is present" is a vacuous test for anything that filters.** Assert the exact
  rendered set, and never use an override's default value as the fixture (a No-JS dictionary bug
  shipped past such a test). The `*_form_conformance.test.ts` suites follow this rule.
- **Firefox smooth scrolling breaks Playwright clicks on small viewports.** The page moves between
  `mousedown` and `mouseup`, so the click lands on an ancestor. Call `disableSmoothScroll`
  (`src/integration/utils/playwright_utils.ts`) in the test, not `reducedMotion: "reduce"`.
- **Tests that import `v2_elements.client.ts` run the page-ready setups.** It imports the entries,
  and jsdom's `readyState` is already `"complete"`.
- **Prettier reflows markup inside `html` templates.** Block elements gain real whitespace, so tests
  that assert exact output should use inline elements.

## Code

- **A `SafeHtml` interpolated into another `html` template is escaped again.** The brand is erased
  at runtime. Compose with `joinHtml` or `raw`.
- **Use `pickValid`, not `matchesObject`, for settings stores.** `matchesObject` rejects the whole
  object on one bad key, which wipes stored settings on any schema change.

## CSS

Already blocked by stylelint, so not repeated here: combinators inside `:not()` within `:has()`
(~20x Firefox style-invalidation cost, `morcus/no-ancestor-gate-in-has`), unscoped `:target`
(`morcus/no-unscoped-target`), and `env()` (`function-disallowed-list`).

- **Hide a fixed, bottom-anchored element with `visibility: hidden`, not by translating it off
  screen.** Firefox Android moves bottom-anchored fixed elements a frame late while the URL bar
  collapses or expands, so an element parked at `translateY(100%)` flashes into view.

## Already rejected: don't re-propose

- `eslint-plugin-wc`: it doesn't understand `onConnect` / `registerElement`;
  `reattach_conformance.test.ts` covers lifecycle instead.
- `eslint-plugin-compat`: it misses static APIs like `AbortSignal.any()` and can't lint CSS.
- Coalescing pointer drags to animation frames: browsers already do this (measured: never more than
  one `pointermove` per frame).
- Debouncing the settings dictionary/inflection checkboxes: too short to coalesce real clicks, too
  long to feel responsive.
- A byte-identical visual harness: idle frames differ by antialiasing, which `toHaveScreenshot`'s
  comparator absorbs.
- `no-unsanitized`'s `taggedTemplates: ["html"]`: it can't cover assigning a renderer's result.
  Route sinks through `setHtml` / `replaceWithHtml` instead.
- Caching queried elements in fields on connect "for performance": lookups are microseconds, and
  swaps replace nodes, so the cache goes stale. See README convention 9.
