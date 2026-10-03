# UI V2 Framework Gaps

Missing or awkward shared primitives in `core/` and the server seams, found while building features.
Each was noted rather than fixed at the time. Fix one when a feature needs it, or when the
duplication bites; delete the entry when it lands. Component-level debt lives in
[`CODE_HEALTH.md`](CODE_HEALTH.md).

---

## Open

1. **Router: multi-param navigation.** `syncQueryParam` models one param. Corpus and the reader's
   page turns push whole URLs with `pushState` + `updatePath()`. A `pushUrl` / `replaceUrl` on the
   sync object would remove the duplication. _Missing primitive._
2. **Keyed fetch cache.** `LemmaShardCache` (corpus) and `DictChunkCache` (dict) are both an
   in-memory map plus in-flight promise dedupe, and both leave the shared request uncancellable on
   purpose. Only the policy differs: dict evicts LRU, while corpus remembers a failure and doesn't
   retry. A `core/` cache with those two options would cover both. _Duplication._

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
another is found at runtime, by attribute list (`TARGET_ID_ATTRS` in `core/js_gate.client.ts`) or by
`querySelector("morcus-…")`:

- `href="#id"`, `aria-controls`, `popovertarget`, `commandfor`: the activation gate in
  `scope.listen()` skips any listener that would cancel activation into a component that isn't
  running. The failed-owner sweep (section 4 of `testing/ssr_conformance_harness.ts`) activates
  controls that point into a failed component.
- `label[for]`, `[form]`: the gate doesn't follow these, so `crossOwnerIdRefs` in
  `core/route_bundle_conformance.test.ts` requires each to stay within one component.
- Same-page URLs with a fragment (not a bare `#id`): flagged by `samePageUrlHashLinks` in the same
  file.
- Peer method calls: `queryUpgraded` / `closestUpgraded`, typed by `MorcusElementTagNameMap`.
  `core/boot_conformance.test.ts` bans importing `Morcus*` classes, type imports included.
- Dangling `href="#…"`: section 3 of the SSR harness.

**Bar for revisiting.** Shipped bugs, or repeated sweep failures the gate can't cover. Awkwardness
alone isn't enough. If it's met, start with typed ref names scoped to the host, not phantom types.
