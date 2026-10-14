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

## Waiting on a date

- 🟢 **Remove the V1 service worker cleanup script** (not before a few months after V1 is
  decommissioned). `/serviceworker.js` serves `public/cleanup_service_worker.js`, which removes the
  retired V1 offline worker, and its caches and IndexedDB data, from browsers that still have it
  registered. A browser only replaces the worker when its user visits, so it has to outlive V1.
  Then delete `public/cleanup_service_worker.js`, `src/web/server/cleanup_service_worker.test.ts`,
  the `/serviceworker.js` route in `src/web/web_server.ts` and its test, the `public/**/*.js` block
  in `eslint.config.mjs`, and the `!public/*.js` exception in `.prettierignore` (restore
  `public/`).
