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

_No open items._
