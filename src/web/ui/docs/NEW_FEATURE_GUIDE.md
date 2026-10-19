# Adding a New V2 Feature

An ordered checklist for adding a page, slice, or interactive component to UI V2. Each step is one
line and links to where the rule actually lives; this file does not restate those rules. If a step
is wrong or missing, fix it here and keep it short.

1. **Folder and file suffixes.** Put the code in its slice folder and name files by target
   (`*.server.ts`, `*.client.ts`, `*.common.ts`). See
   [README: Conventions for All New Code](../README.md#conventions-for-all-new-code) and
   [The `.common.ts` contract](../README.md#the-commonts-contract).
2. **Server route and No-JS renderer first.** The page must work with scripting off before any
   client code exists. Mount the route in [`app_router.server.ts`](../app_router.server.ts), import
   the slice CSS in [`app.css`](../app.css), and, for a nav page, add it to `V2ActivePage` and the nav
   links in [`page_shell.server.ts`](../shell/page_shell.server.ts).
3. **JS-only and No-JS-only UI.** Mark UI that only makes sense in one mode as described in
   [README: JS-only and No-JS-only UI](../README.md#js-only-and-no-js-only-ui). The
   [activation gate](../README.md#the-activation-gate) is applied automatically by
   `scope.listen()`; there is nothing to call.
4. **Custom elements.** Define elements with `registerElement` from
   [`base_element.client.ts`](../core/dom/base_element.client.ts), add them to the
   [`all_entries.client.ts`](../testing/all_entries.client.ts) manifest, and add a fixture to `FIXTURES` in
   [`reattach_conformance.test.ts`](../core/conformance/reattach_conformance.test.ts).
5. **Route chunk.** Declare the entry in
   [`client_build_contract.ts`](../../../bundler/client_build_contract.ts), then add a per-chunk ceiling and
   any duplication allowance in [`client_bundle_budget.ts`](../../../bundler/client_bundle_budget.ts).
6. **Conformance tests.** Follow
   [TESTING: When to add or change a conformance test](TESTING.md#when-to-add-or-change-a-conformance-test).
   This usually means a fixture in [`ssr_fixtures.ts`](../testing/ssr_fixtures.ts), an entry in
   `PAGE_SETUPS` in [`ssr_conformance.test.ts`](../core/conformance/ssr_conformance.test.ts), routes in
   [`fake_network.ts`](../testing/fake_network.ts), and updates to
   [`route_bundle_conformance.test.ts`](../core/conformance/route_bundle_conformance.test.ts) and
   [`created_dom_allowlist.ts`](../testing/created_dom_allowlist.ts).
7. **Inventory ratchet.** Run `./morcus.sh inventory`. New entries in
   [`inventory_ratchet.json`](../inventory_ratchet.json) need review, not a blind accept.
8. **Visual scenarios.** Add scenarios for the new view if it has a distinct layout. New or changed
   baselines follow the Visual Baseline Approval Rule in
   [`AGENTS.md`](../../../../AGENTS.md#3-testing-web--client-code-critical-rules).
9. **Slice docs.** Give the slice a `README.md` (what it does, its URL contract, its files) and a
   `TODOS.md` for open work. Before writing code, skim [DESIGN_TRAPS.md](DESIGN_TRAPS.md); when
   you hit a framework limitation, record it in [FRAMEWORK_GAPS.md](FRAMEWORK_GAPS.md).
