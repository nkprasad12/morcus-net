# Testing Guide for UI V2

This document provides instructions for developers and AI agents on running unit and end-to-end (E2E) tests for the UI V2 (Multi-Page / Progressive Enhancement architecture).

Before writing a new test, read the [testing traps](DESIGN_TRAPS.md#testing): vacuous filter assertions, Firefox click flakes, and other mistakes that have cost real time.

---

## 1. Test Locations

Every suite under `src/integration/suites/` below runs with `./morcus.sh e2e` (§2, Option E).

- **E2E Tests (Playwright)**: `src/integration/suites/browser_e2e.test.ts`
- **Library & reader E2E (Playwright)**: `src/integration/suites/browser_reader.test.ts`. Covers the journeys that depend on a real browser: library filter → reader, saved spots surviving full navigations, Back after legacy `?id=` redirects, line deep links and the TOC jump field (JS and No-JS), translations following page turns, passage word lookup, copying verse lines, and keyboard autocomplete.
- **Late-hydration E2E (Playwright)**: `src/integration/suites/browser_late_hydration.test.ts` — holds back the `/assets/*.js` chunks, interacts in the pre-hydration window, then checks the upgrade adopts the state and the JS gate / pre-paint snapshot prevent flashes and layout shifts. A "chunk ordering: intermediate state" block uses `openStaged` to release `common.js` before the route chunk and interacts in between.
- **Reader swipe E2E (Playwright)**: `src/integration/suites/browser_swipe.test.ts` — swipe page turns, which need real layout and touch emulation (touch cases run on MobileChrome only).
- **Server smoke test (no browser)**: `src/integration/suites/morcus_backend_integration.test.ts` — `fetch`-only checks of pages, partials and JSON endpoints. Aimed at the production image (`./morcus.sh e2e --docker`, and CI), but also passes against the dev server.
- **Unit Tests (Jest)**: Colocated alongside source modules as `*.test.ts` (run via `./morcus.sh test`; see §3). Tests cover SSR renderers, routing, bitmask/clustering logic, custom elements, and core utilities across each vertical slice (`about/`, `core/`, `dialog/`, `dict/`, `reader/`, `shell/`, and `app_router.test.ts`).

### Pre-hydration (PH) bug index

Code comments and test names cite these IDs. Each is a bug in the window where a JS-enabled user can see and use the page before its component upgrades. All are fixed; the rules that prevent them are README convention 3 ("Read before writing in `onConnect()`") and "JS-only and No-JS-only UI". When you fix a new one, give it the next ID, add a row here, and add a case to the late-hydration suite.

| ID   | Bug                                                                                   | Guarded by                                                  |
| :--- | :------------------------------------------------------------------------------------ | :---------------------------------------------------------- |
| PH0  | Dictionary results scroll yanked back to the top on upgrade                           | `dict/search/dict_search.test.ts`                           |
| PH1  | Dictionary settings: checkboxes changed before upgrade reset, popover couldn't submit | `dict/settings/dict_settings.test.ts`, late-hydration suite |
| PH2  | Library filter typed before upgrade ignored                                           | `library/library.test.ts`                                   |
| PH3  | Dictionary query typed before upgrade misread by the landing-page results check       | `dict/search/dict_search.test.ts`, late-hydration suite     |
| PH4  | Greek embed `<details>` / checkbox toggled before upgrade clobbered                   | `dict/search/dict_greek.test.ts`; checkbox is JS-only       |
| PH5  | Reader TOC drawer opened via `:target` before upgrade stuck open                      | late-hydration suite                                        |
| PH6  | Reader footnote and About links jumped to the bottom before panel relocation          | `reader/reader_panel.test.ts`                               |
| PH7  | Reader mobile dictionary sheet opened via `:target` slammed shut on upgrade           | late-hydration suite                                        |
| PH8  | Dictionary mobile TOC drawer height jump; close before upgrade desynced               | `core/widgets/drawer.test.ts`                               |
| PH9  | Dictionary landing autofocus yanked the scroll position                               | `dict/search/dict_search.test.ts`, late-hydration suite     |
| PH10 | Reader scrolled to the first match after the user had already scrolled                | `reader/reader_view.test.ts`                                |
| PH11 | Reader typography, gutter and width reflowed on upgrade (missing from pre-paint)      | late-hydration suite                                        |
| PH12 | Reader `Aa` button visible and dead before upgrade                                    | `core/conformance/gate_conformance.test.ts`                 |

---

## 2. Running E2E Tests with Playwright

Playwright tests are configured in `playwright.config.ts`. The V2 E2E suite verifies both **No-JS baseline** (SSR only) and **JS-enhanced** (native Web Components) interactions.

### Option A: Reusing a Running Dev Server (Recommended for Fast Local Testing)

When developing locally or as an agent, reuse the existing development or processing server rather than launching Docker:

1. Ensure the server is running (default port is `1337`):
   ```bash
   npm run server-p
   ```
2. Run only the V2 E2E suite:
   ```bash
   REUSE_DEV_SERVER=true PORT=1337 npx playwright test browser_e2e
   ```

### Option B: Target a Single Browser Engine

Playwright runs against Chromium, Firefox, WebKit, and mobile viewports by default. To run tests quickly against Chromium only:

```bash
REUSE_DEV_SERVER=true PORT=1337 npx playwright test browser_e2e --project=chromium
```

### Option C: Run a Specific Test Case

Filter tests by name using `-g`:

```bash
# Test No-JS SSR fallback only
REUSE_DEV_SERVER=true PORT=1337 npx playwright test browser_e2e -g "No-JS fallback"

# Test theme toggling
REUSE_DEV_SERVER=true PORT=1337 npx playwright test browser_e2e -g "theme"
```

### Option D: Interactive / Headed / Debug Modes

```bash
# Interactive UI mode
REUSE_DEV_SERVER=true PORT=1337 npx playwright test browser_e2e --ui

# Headed browser
REUSE_DEV_SERVER=true PORT=1337 npx playwright test browser_e2e --headed

# Playwright inspector / step-through debugger
REUSE_DEV_SERVER=true PORT=1337 npx playwright test browser_e2e --debug
```

### Option E: Running via `run_morcus` (`morcus.sh`) (Recommended)

Runs every suite under `src/integration/suites/` against the dev server (`$PORT`, or 5757):

```bash
# Fast run (Chromium + Mobile Chrome):
./morcus.sh e2e

# All browser projects:
./morcus.sh e2e --all

# Against a freshly built production Docker image, as CI does
# (--rerun reuses an existing image; --tag names it):
./morcus.sh e2e --docker --all
```

> [!WARNING]
>
> **Do NOT run `npm run integration-tests` directly.**
>
> It is CI's entry point and, without `REUSE_DEV_SERVER`, starts the Docker image named by `IMAGE_TAG`. `./morcus.sh e2e` runs the same suites and sets this up for you.

> [!NOTE]
>
> If WebKit fails to launch with "Host system is missing dependencies", install the libraries it names (`npx playwright install-deps webkit` does this on supported Debian and Ubuntu releases).

### Option F: Visual Regression Tests & the Visual Diff Inspector

Verifies pixel-perfect UI fidelity across the V2 views and every browser project, covering light/dark and JS/No-JS modes:

```bash
# Fast check (Chromium + Mobile Chrome):
./morcus.sh e2e --visual

# Full verification across all engines:
./morcus.sh e2e --visual --all

# Run the suite and open the Visual Diff Inspector on any failures
# (expected vs actual; baselines are NOT modified):
./morcus.sh e2e --visual --all --diff

# Accept the new screenshots as *local* baselines (gitignored; nothing to
# commit). Show the user the diffs afterwards, see below:
./morcus.sh e2e --visual --all --update

# Or accept chosen failures from the last run without re-running it
# (see "accept and the run marker" below):
./morcus.sh visual-baselines accept <names...>
```

#### Baselines: committed checkpoint + local overlay

Baselines live in two places, so day-to-day UI work doesn't add a new set of PNGs to git history every time:

- **Checkpoint** (committed): `src/integration/screenshot/browser_screenshot.test.ts-snapshots/`. Refreshed every so often, with explicit human approval.
- **Local baselines** (gitignored): `.visual-baselines/local/`, plus a `manifest.json`. `e2e --visual --update` and `visual-baselines accept` write changed screenshots here, never to the checkpoint.

| Term                 | Meaning                                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Accept (locally)** | Save screenshots as local baselines in `.visual-baselines/local/` (plus `manifest.json`). Gitignored; undo with `visual-baselines drop`.                   |
| **Checkpoint**       | Promote local baselines into the committed snapshot directory. Writes files; never stages or commits them.                                                 |
| **Effective**        | The checkpoint plus the valid local baselines, merged before each run into `.cache/visual-baselines/effective/`. This is what Playwright compares against. |
| **Stale**            | A local baseline whose checkpoint file has changed since it was accepted. The checkpoint wins.                                                             |

Before each visual run, `run_morcus` merges the two into `.cache/visual-baselines/effective/` and points Playwright at it (`MORCUS_VISUAL_BASELINES`, read by `playwright.config.ts`). A local baseline is used while the checkpoint file it was accepted against is unchanged. If the checkpoint changes afterwards (a pull, a rebase, or a new checkpoint), the checkpoint wins and the local baseline is reported as **stale**. The comparison uses file content (git blob ids), not mtimes, so checkouts and rebases don't confuse it. Plain `npx playwright test` (and CI) ignores the local store.

```bash
# What's in the local store, and what's stale:
./morcus.sh visual-baselines status

# Accept specific failures from the last run straight from test-results/,
# without running the suite again (names are baseline file names):
./morcus.sh visual-baselines accept about-page-js-light-chromium-linux.png
# ...or exactly the snapshots in the last `visual-diff --source results` report:
./morcus.sh visual-baselines accept --from-report

# Review local baselines against the checkpoint:
./morcus.sh visual-diff --source local

# Checkpoint (needs explicit human approval): copy the active local baselines
# into the committed directory and clear them from the store. Nothing is staged;
# review with `visual-diff --source git`, then commit.
./morcus.sh visual-baselines checkpoint            # or name specific files

# Discard local baselines:
./morcus.sh visual-baselines drop --stale          # or: drop <names...>, drop --all
```

`.visual-baselines/` is deliberately outside `.cache/`, so clearing the cache doesn't lose accepted baselines. The store doesn't track deleted scenarios: remove their PNGs from the checkpoint by hand.

**`accept` and the run marker.** `accept` takes Playwright's `*-actual.png` files from `test-results/` (mapping `<dir>--<project>/<name>-actual.png` to `<name>-<project>-<os>.png`), so it only makes sense if those screenshots came from the code that is checked out now. Every `e2e --visual` run records `HEAD` and a hash of the uncommitted changes under `src/` and `playwright.config.ts` when it starts, and writes them to `test-results/.visual-run.json` when it finishes. `accept` refuses if that marker is missing (plain `npx playwright test`, an interrupted run), if the code changed during the run, or if `HEAD` or the uncommitted changes differ now; the error says which. `--force` overrides it. There is no "accept everything": pass names or `--from-report`, so a flaky failure is never accepted just because it was in `test-results/`. Like `--update`, an actual identical to the checkpoint removes the local baseline instead ("reverted").

#### Visual Diff Inspector (`src/scripts/visual_diff/`)

An interactive viewer for screenshot changes. It reads from one of three sources:

- **`results`**: Playwright's failure output in `test-results/` (expected vs actual). Use this to review a failing run _before_ asking for approval. Tests that failed _before_ taking a screenshot (a timeout, a crash, a missing element) have no image to show, so they are listed separately as "⚠ N failed without a screenshot", in the console and at the top of `report.md`. Resolve those before asking for approval: their baselines were never compared.
- **`local`**: local baselines vs the committed checkpoint. Use this to review baselines after `--update`. Stale local baselines are listed separately.
- **`git`**: checkpoint PNGs in the working tree vs a git ref. Use this to review a checkpoint before committing it.

```bash
# Auto-detect the source (git changes first, then Playwright failures, then local baselines):
./morcus.sh visual-diff        # or: ./morcus.sh diff, npm run visual-diff

# Pick a source explicitly:
./morcus.sh visual-diff --source results
./morcus.sh visual-diff --source local
./morcus.sh visual-diff --source git --ref HEAD~1

# Write the viewer and a markdown report to .cache/visual-diff/ without a server:
./morcus.sh visual-diff --no-server --report /tmp/visual-diff.md

# Restrict the viewer to localhost (default listens on all interfaces):
./morcus.sh visual-diff --host 127.0.0.1
```

> [!IMPORTANT]
>
> **For agents:** `visual-diff` and `e2e --visual --diff` keep a server running until stopped (Ctrl+C), so start them as a background/daemon process, not a blocking command. Everything is also written to `.cache/visual-diff/` (`report.md`, `index.html`, `images/<id>.{before,after,diff}.png`); use `--no-server` when you only need those files. If nothing changed, the command prints `No changed snapshots found.` and exits without starting a server.

The viewer offers before/after flip (<kbd>Space</kbd>, hold-to-peek, auto-blink with <kbd>B</kbd>), a split slider (<kbd>S</kbd>), a diff mask overlay (<kbd>D</kbd>), side-by-side view (<kbd>4</kbd>), zoom, and filtering by page, color (light/dark), size (mobile/desktop), scripting (JS/No-JS), browser, and name. Option counts reflect the other active filters, and filters are kept in the URL hash. Press <kbd>?</kbd> for all shortcuts. Pixel counts and diff masks need ImageMagick (6 or 7); without it, the `results` source falls back to Playwright's own diff images.

##### Reviewing, accepting and checkpointing in the viewer

Give each snapshot a verdict: **approve** (<kbd>A</kbd>, or <kbd>Y</kbd>/<kbd>Enter</kbd>) or **reject** (<kbd>R</kbd>); <kbd>Shift</kbd> applies it to the whole group, <kbd>U</kbd> undoes. The header counts "N unreviewed · M approved · K rejected". Verdicts are kept in the tab's `sessionStorage`, keyed by the run marker (or the local store's contents), so a reload keeps them and a new run starts fresh.

The viewer has two modes with write actions, in a panel under the list. Most of the time you only need the first: checkpointing is deliberately occasional, to keep PNGs out of git history.

- **Everyday: `--source results` → accept.** Once nothing is unreviewed, **"Accept M locally"** accepts exactly the approved snapshots (the same as `visual-baselines accept <names>`, run-marker guard included). Rejected ones are left alone and keep failing. That's the end of the flow: the panel shows "✓ Accepted M locally · K rejected (still failing)", the local store's size and oldest entry, and a stale warning if there is one. Its only action is **Undo accept**, which puts back exactly what this accept changed (dropping new local baselines, restoring ones it replaced). There is no checkpoint here. The header's quiet "Local baselines (N) →" link only says how to open local mode.
- **Occasional: `--source local` → checkpoint.** Reviews every local baseline against the committed checkpoint, with stale ones listed separately. **"Checkpoint N…"** applies to the snapshots matching the current filters (page, color, size, scripting, browser, name, and "Accepted before" a date), so you can checkpoint a subset. It appears only once every one of them is approved, asks you to type `checkpoint`, and then lists the files written. Nothing is staged or committed: review with `visual-diff --source git`, then commit. **"Drop this local baseline…"** (and "Drop N stale…") discard local baselines after a confirmation.

`--source git` is read-only. The buttons are disabled, with the reason, if the run marker check fails (`results`) or a snapshot's images are incomplete (a missing or unreadable image, an unknown Playwright project, or, for `results`, no diff at all). `./morcus.sh visual-baselines status` shows the same hints: how many local baselines aren't checkpointed, their size, the oldest, and a one-line warning when some are stale.

Because the viewer listens on the network, the write endpoints (`POST /api/accept`, `/api/drop` and `/api/checkpoint`) need a random token generated at startup. It's in the URLs the Inspector prints (`…/#token=…`; the fragment never reaches the server); the viewer sends it as a header. Without it, or from another origin, requests are refused. The endpoints only take snapshot names shown in the current session; a `results` session can only accept, and undo its own accepts, while only a `local` session can checkpoint or drop. To try the flow without touching the real stores, point the Inspector at copies: `--results-dir`, `--dir` (checkpoint) and `--store-dir` (local store).

> [!IMPORTANT]
>
> **For agents:** never call the Inspector's accept, drop or checkpoint endpoints, or click those buttons. They're for the human reviewing the diffs. See the Visual Baseline Approval Rule in `AGENTS.md`.

---

## 3. Running Unit Tests

Jest tests are split into two projects in [`jest.config.js`](../../../../jest.config.js), by what they check rather than where they live:

- **`unit`**: ordinary tests of routers, SSR renderers, client components and utilities.
- **`whole-system`**: `*_conformance.test.ts` and `tools/inventory/inventory_ratchet.test.ts`. They check invariants across the whole app (every SSR fixture, every module, every stylesheet), so they depend on almost everything and take most of the suite's time.

Test what you changed, then run the whole-system tier once before committing anything that touches the UI or something adjacent to it. The whole-system tests only exercise the web UI and the shared modules it imports, so this is required when the commit touches `src/web/` or `src/common/` code the UI imports for display (dictionary entry XML and rendering, shared result types, display helpers). It's skippable for backend-only changes (dictionary storage and lookup logic, server wiring, Morceus, build scripts), docs, and lock file bumps:

```bash
# After an edit: `unit` tests that import any file changed since HEAD
# (uncommitted and untracked files included)
./morcus.sh test

# The same, for files you name
./morcus.sh test src/web/ui/dict/dict_page.server.ts

# Once before each commit touching the UI or what it renders (required)
./morcus.sh test --whole-system

# Everything: both projects (CI runs them via `npm run coverage`)
./morcus.sh test --all
```

Testing only what changed since `HEAD` is safe because every commit is expected to have passed both tiers. Related-test selection follows `import`s only, so a change to a file that tests read from disk (CSS, JSON) is caught by the whole-system tier, not by `./morcus.sh test`. While working on one feature's conformance files, you can run them directly, e.g. `npx jest src/web/ui/dict/dict_ssr_conformance.test.ts`.

### SSR conformance harnesses

Two jsdom harnesses check real SSR output (`testing/ssr_fixtures.ts`) against the PE invariants. Each feature (`dict/`, `corpus/`, `reader/`, `library/`, `external/`) runs both from its own test files, next to its components. Neither ships code to the client.

- `*_ssr_conformance.test.ts`, using [`testing/ssr_conformance_harness.ts`](../testing/ssr_conformance_harness.ts), checks the page **right after upgrade**: tree fingerprint, No-JS controls, ids and hash links, and the failed-owner sweep. Each file sets floors for the sweep, so it can't pass vacuously. Checks that need every page at once (every registered element appears in some fixture, the page setups match the entry files, and every connect-time or delegated selector lookup matches in at least one fixture) stay in [`core/conformance/ssr_conformance.test.ts`](../core/conformance/ssr_conformance.test.ts). Post-connect handler lookups are covered by `*_interaction_conformance.test.ts`.
- `*_interaction_conformance.test.ts`, one next to each feature (`dict/`, `corpus/`, `reader/`, `library/`, `external/`), checks it again **after interaction**, using [`testing/interaction_harness.ts`](../testing/interaction_harness.ts). Each file lists its fixtures, caps and scenarios. The Tier 1 sweep exercises every deduplicated control in the feature's fixtures with a fixed script (focus/type/arrow/Escape/blur, clicks, option and step changes) against a fake network backed by the real server renderers (`testing/fake_network.ts`), and checks the invariants after each step. Each target also runs torn down mid-script, to catch late writes to detached nodes. Tier 2 (the file's `scenarios`) declares multi-step flows a single control can't reach, such as picking a suggestion, submitting, or paging. They run in the same three modes, and each must end in a partial swap. After a settled run that swapped content in, the harness also runs section 3 of the SSR harness (`checkAddresses` in `testing/ssr_invariants.ts`: hash links resolve and their targets can be revealed) on the swapped-in page. When a feature adds a new flow, add a scenario to its file. A new page type gets a fixture builder in `testing/ssr_fixtures.ts` and its own suite.

`*_form_conformance.test.ts` (`dict/`, `corpus/`, `external/`) cover the No-JS forms end to end: render the SSR form into jsdom, change its controls, serialize it with `new FormData(form)`, and send it to the router through supertest (helpers in [`testing/form_roundtrip.ts`](../testing/form_roundtrip.ts)).

Shared lists, each in its own file and all of which **need human review to extend**:

- [`testing/created_dom_allowlist.ts`](../testing/created_dom_allowlist.ts), `CREATED_DOM_ALLOWLIST`: the only elements client code may create, each with a phase (`upgrade` or `interaction` only), an optional `subtree`, and a `reason`. Prefer server-rendering the element and adopting it.
- [`testing/isomorphic_rerenders.ts`](../testing/isomorphic_rerenders.ts), `ISOMORPHIC_RERENDERS`: SSR UI the client re-renders after an interaction with the same `.common.ts` renderer the server used.

Each fixture's Tier 1 sweep is capped by count (`TIER1_MAX_RUNS_PER_FIXTURE`), and each suite has a floor (`caps.minRuns`), both checked before any run starts. If a fixture goes over, the failure lists its controls grouped by dedup key. Tighten the key (`targetKey`) before raising a cap; a raise or a `caps.overrides` entry needs human review.

#### When to add or change a conformance test

All of these live in the feature's own folder, next to its components, except the shared files in `testing/`.

| You are…                                                                                  | Do this                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adding a component to an existing page                                                    | Usually nothing. Make sure one of the feature's fixtures renders it; `core/conformance/ssr_conformance.test.ts` fails if no fixture contains a registered element, and both sweeps then cover it automatically.                                                                                                                                                                       |
| Adding a page, or a page state the existing fixtures don't render (results, empty, error) | Add a fixture to the feature's builder in `testing/ssr_fixtures.ts` (`buildDictFixtures`, …). Both suites pick it up. If the counts grow a lot, revisit the floors.                                                                                                                                                                                                                   |
| Adding a new feature folder                                                               | Add `build<Feature>Fixtures()` to `testing/ssr_fixtures.ts` (and to `buildSsrFixtures()`), then `<feature>/<feature>_ssr_conformance.test.ts` and `<feature>/<feature>_interaction_conformance.test.ts`, copying an existing pair, including its two `jest.mock` calls. Set the floors (`floors`, `caps.minRuns`) to about 70% of the first run's counts, with a comment noting them. |
| Adding a multi-step flow (pick an option, submit, page, open-then-act)                    | Add a Tier 2 `scenarios` entry to the feature's `*_interaction_conformance.test.ts`. Set `expectSwap` if the flow fetches and swaps in content.                                                                                                                                                                                                                                       |
| Adding a fetch or partial endpoint the client calls                                       | Add a route to `testing/fake_network.ts` that calls the real server renderer. Otherwise the interaction suites fail with `unrouted fetch`.                                                                                                                                                                                                                                            |
| Adding or changing a No-JS form, or a form parameter                                      | Add a journey to the feature's `*_form_conformance.test.ts` (create one if the feature has none). Assert exact sets and the URL a native submit would produce.                                                                                                                                                                                                                        |
| Adding a global setup (`setupX`) to an entry file                                         | Add it to `PAGE_SETUPS` in `testing/ssr_fixtures.ts`; `core/conformance/ssr_conformance.test.ts` fails until you do.                                                                                                                                                                                                                                                                  |
| Seeing a conformance failure for DOM your component creates or replaces                   | Prefer changing the component: render the markup on the server and adopt it. An entry in `created_dom_allowlist.ts` or `isomorphic_rerenders.ts` needs human review; don't add one to make the test pass.                                                                                                                                                                             |
| Seeing a fixture go over its Tier 1 cap                                                   | Tighten `targetKey` in `testing/interaction_harness.ts` first. Raising the cap or adding a `caps.overrides` entry needs human review.                                                                                                                                                                                                                                                 |

Checks that span the whole app rather than one page stay in `core/`:

- `core/conformance/boot_conformance` and `core/conformance/gate_conformance` scan every module and stylesheet, so they cover new code automatically.
- `core/conformance/reattach_conformance` needs a fixture for every registered element in its `FIXTURES` map, and fails until a new element has one.
- `core/conformance/route_bundle_conformance` lists its routes and partial responses by hand. Add a new route or partial there. Give each partial the URL the client pushes once it's swapped in, built with the feature's URL builder (`buildDictUrl`, `corpusUrl`, `buildReaderPageUrl`, `buildExternalReaderUrl`), since its same-page hash-link check runs against that URL.

---

## 4. Verification Checklists for Agents

> [!IMPORTANT]
>
> **Rapid Iteration vs. Commit vs. Push**:
>
> - **During rapid iteration**: Make the fix and restart the dev server immediately. Do NOT run tests or linter after every minor tweak. When you do check, run `./morcus.sh test` (related unit tests only).
> - **Pre-Commit**: Run fast checks (TypeScript, related unit tests, the whole-system tier, code formatting).
> - **Pre-Push**: Run the full E2E matrix and visual regression tests across browsers.

### A. Pre-Commit Checklist (Fast)

1. **Linting check**:
   ```bash
   npx eslint --cache src/web/ui
   ```
2. **Stylelint CSS design token check**:
   ```bash
   npm run lint:css
   ```
3. **TypeScript check**:
   ```bash
   npx tsc --noEmit
   ```
4. **Bundle check**:
   ```bash
   npm run tsnp src/bundler/client.rsbuild.ts -- --minify
   ```
5. **Unit tests** (related, then whole-system; see §3):
   ```bash
   ./morcus.sh test && ./morcus.sh test --whole-system
   ```
6. **Code formatting**:
   ```bash
   npx prettier --cache src/web/ui --check
   ```

### B. Pre-Push Checklist (Full Verification)

1.  **Start dev server** (if not already running):
    ```bash
    PORT=5757 ./morcus.sh web
    ```
2.  **Functional E2E tests (all browsers)**:
    ```bash
    ./morcus.sh e2e --all
    ```
3.  **Visual regression tests (all browsers)**:
    ```bash
    ./morcus.sh e2e --visual --all
    ```
4.  **If there are pixel diffs, review them before touching baselines** (see the Visual Baseline Approval Rule in `AGENTS.md`):

    ```bash
    # Opens the Visual Diff Inspector on Playwright's failures (expected vs actual):
    ./morcus.sh e2e --visual --all --diff

    # Accept them locally (gitignored), and show the user the result:
    ./morcus.sh e2e --visual --all --update
    ./morcus.sh visual-diff --source local

    # Only after explicit approval: checkpoint, re-review vs HEAD, and commit:
    ./morcus.sh visual-baselines checkpoint
    ./morcus.sh visual-diff --source git
    ```
