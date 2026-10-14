# UI V2 Framework Gaps

Missing or awkward shared primitives in `core/` and the server seams, found while building features.
Each was noted rather than fixed at the time. Fix one when a feature needs it, or when the
duplication bites; delete the entry when it lands. Component-level debt lives in
[`CODE_HEALTH.md`](CODE_HEALTH.md).

---

## Open

None.

---

## Deferred: compile-time contracts

**Decision.** UI V2 does not declare server↔client contracts in types. There is no phantom-typed
`SafeHtml` carrying the refs a fragment guarantees, no declared ref or ownership graph, and no ban on
client `createElement`. The PE framework RFCs that proposed these are archived
([`archive/PE_FRAMEWORK_RFC_REVISIONS_1.md`](archive/PE_FRAMEWORK_RFC_REVISIONS_1.md)); don't revive
them without meeting the bar below.

**Why.**

- A working prototype of the phantom types was unsound in practice: it compiled a page with a dead
  ref, gave false positives through `joinHtml` / `raw`, didn't catch the re-escape trap (a `SafeHtml`
  interpolated into `html` is escaped again), and with `as` banned left no escape hatch.
- Drift between server markup and client selectors caused **none** of the ~40 fix commits from June
  to the end of September. The bugs that shipped were pre-hydration and ordering bugs, which the
  runtime gate below fixed.

**What covers cross-component references today.** A reference from inside one component to part of
another is found at runtime, by attribute list (`TARGET_ID_ATTRS` in `core/dom/js_gate.client.ts`) or by
`querySelector("morcus-…")`:

- `href="#id"`, `aria-controls`, `popovertarget`, `commandfor`: the activation gate in
  `scope.listen()` skips any listener that would cancel activation into a component that isn't
  running. The failed-owner sweep (section 4 of `testing/ssr_conformance_harness.ts`) activates
  controls that point into a failed component.
- `label[for]`, `[form]`: the gate doesn't follow these, so `crossOwnerIdRefs` in
  `core/conformance/route_bundle_conformance.test.ts` requires each to stay within one component.
- Same-page URLs with a fragment (not a bare `#id`): flagged by `samePageUrlHashLinks` in the same
  file.
- Peer method calls: `queryUpgraded` / `closestUpgraded`, typed by `MorcusElementTagNameMap`.
  `core/conformance/boot_conformance.test.ts` bans importing `Morcus*` classes, type imports included.
- Dangling `href="#…"`: section 3 of the SSR harness.

**Caveat: these checks see only the fixtures.** The sweeps, the SSR and interaction harnesses, and
the selector-lookup check in `core/conformance/ssr_conformance.test.ts` all run over `testing/ssr_fixtures.ts`.
That list is maintained by hand, and the only completeness check is that every registered element
appears in _some_ fixture. A page (or page state) that reuses an element already shown elsewhere can
be missing and every check still passes. In October the `?url=` and `?local=` external reader pages,
about, and not-found had no fixtures. Adding them found a write to a detached passage after an
IndexedDB read in `external_loader.client.ts`, and a reader `tokenizeTargets` fallback selector that
no page renders. When adding a page or a materially different state (empty vs. loaded, verse vs.
prose), add a fixture for it. A renderer-coverage check (every exported `render*PageHtml` /
`render*ContentHtml` called while building fixtures) would enforce one fixture per page, but not per
state; it isn't built.

**Also uncovered: element references that outlive a swap.** A component that stores a queried
element in a field holds a detached node once a partial swap replaces it, with no error. Today only
README convention 9 guards this: nothing tracks which fields hold elements or which regions a
component swaps. Host-scoped declared refs would: the framework would own the ref and re-resolve
it (or throw) on `onContentSwap`. If this ever ships a bug, the cheaper first step is a jsdom
sweep that runs each component's swaps and fails on any `HTMLElement` field with
`isConnected === false`.

**Bar for revisiting.** Shipped bugs, or repeated sweep failures the gate can't cover. Awkwardness
alone isn't enough. If it's met, start with typed ref names scoped to the host, not phantom types.
