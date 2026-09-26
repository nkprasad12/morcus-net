# Agent Guidelines & Operational Instructions

Welcome! This repository hosts Morcus Net. Follow the instructions and conventions below when developing, building, running, or testing within this codebase.

---

## 1. General Orchestration Convention: `run_morcus` (`morcus.sh`)

In this repository, operational tasks—such as starting development servers, building data/dictionary artifacts, running client bundles, managing background workers, and running pipelines—conventionally go through the central dispatcher:

- **CLI Wrapper**: `./morcus.sh <command> [flags]` (or via npm: `npm run morcus -- <command> [flags]`)
- **TypeScript Entrypoint**: `src/scripts/run_morcus.ts` (run via `npm run run-morcus -- <command> [flags]`)

### Core Subcommands

| Command       | Description                                                | Common Usage                                                                  |
| ------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `web`         | Builds artifacts & starts the web server                   | `./morcus.sh web -w` (watch mode dev server)<br>`./morcus.sh web --build_all` |
| `build`       | Builds dictionary/corpus artifacts without starting server | `./morcus.sh build --build_all`<br>`./morcus.sh build -b_ls -b_grg`           |
| `bundle`      | Builds and bundles client JS/CSS                           | `./morcus.sh bundle -m` (minify)<br>`./morcus.sh bundle -a` (analyze)         |
| `e2e`         | Runs E2E integration test pipelines                        | `./morcus.sh e2e -d` (local dev server)                                       |
| `worker`      | Starts background cruncher/NLP workers                     | `./morcus.sh worker -wt ls`                                                   |
| `corpus`      | Corpus processing utilities and Rust CLI                   | `./morcus.sh corpus -r`                                                       |
| `visual-diff` | Interactive viewer for screenshot diffs (see §3.D)         | `./morcus.sh visual-diff --source results`                                    |

> [!TIP]
> Run `./morcus.sh --help` or `./morcus.sh <command> --help` to inspect available flags and options.

---

## 2. UI V2 Architecture & Testing Documentation

For all tasks involving UI V2 (`src/web/v2/`), consult the dedicated guides before proposing architectural changes or running test suites:

- **Architecture & Progressive Enhancement Guide**: [`src/web/v2/README.md`](src/web/v2/README.md)
  - Covers vertical slices, `*.server.ts` vs `*.client.ts` target suffixes, Light DOM custom element conventions, zero-JS baseline philosophy, and Rsbuild bundling.
- **Testing & Verification Guide**: [`src/web/v2/TESTING.md`](src/web/v2/TESTING.md)
  - Full details on running unit tests, end-to-end (E2E) tests, visual regression tests, and debugging options.

---

## 3. Testing UI V2: Critical Rules & Commands

### ⛔ Critical Restriction on Integration Tests

**Do NOT run `npm run integration-tests` when verifying UI V2.**

1. It executes legacy V1 test suites that are not relevant to UI V2.
2. It attempts to run against **WebKit / MobileSafari**, which is unsupported in this Linux environment and will fail or cause the test runner to hang.

### ⛔ Proactive Testing Rule

**Do NOT proactively run slow E2E or visual regression test suites without user confirmation.**
Fast unit tests (`npm run ts-tests:v2`) may be run when verifying logic, but multi-browser E2E and visual diff tests require a running server, consume significant resources, and should only be run when requested or during final pre-commit verification.
The Visual Diff Inspector (`./morcus.sh visual-diff`, §3.D) is exempt: it launches no browsers and only reads existing screenshots, so start it whenever there are diffs to show.

### ⛔ Visual Baseline Approval Rule

**NEVER commit updated screenshot baselines without explicit human approval.**

A baseline update (`--update`) rewrites the definition of "correct" for the UI. An agent that both changes the pixels and re-blesses them has removed the only check on its own visual judgement, so this decision belongs to the user every time.

When a change causes pixel diffs:

1. Run the visual suite **without** `--update` first, to see exactly what moved: `./morcus.sh e2e --visual --all`.
2. Report which snapshots differ and why, using the Visual Diff Inspector (§3.D):
   - Start it in the background with `./morcus.sh visual-diff --source results` and give the user the `Network:` URL it prints, so they can flip through before/after themselves.
   - To inspect the diffs yourself, read `.cache/visual-diff/report.md` and the `images/*.{before,after,diff}.png` files next to it.
3. **Wait for approval.** Do not run `--update`, and do not `git add` anything under `*-snapshots/`, until the user has said yes.
4. Only then update, re-check the new baselines against `HEAD` with `./morcus.sh visual-diff --source git`, and commit, listing the affected files.

This applies to amending or fixing up an earlier baseline commit too.

### ✅ Standard UI V2 Test Commands

#### A. Unit Tests (Jest)

Fast, in-memory unit tests for V2 SSR renderers, routers, and client components:

```bash
# Run all UI V2 unit tests:
npm run ts-tests:v2

# Or target a specific file:
npx jest src/web/v2/v2_router.test.ts
```

#### B. Functional E2E Tests (Playwright via `run_morcus`)

Functional browser tests verifying both No-JS baseline and JS-enhanced behavior on a running dev server:

```bash
# Fast run against Chromium & Mobile Chrome (default port 5757):
./morcus.sh e2e --v2

# Complete matrix (Chromium, Mobile Chrome, Firefox, Firefox Small Screen):
./morcus.sh e2e --v2 --all

# Custom server port or specific browser project:
./morcus.sh e2e --v2 --port 1337 --project chromium
```

#### C. Visual Regression Tests (Multi-Dimensional Screen-Diff via `run_morcus`)

Verifies pixel-perfect UI fidelity across 18 view/mode scenarios and 4 form-factors/browsers, covering light/dark and JS/No-JS modes (72 tests total):

```bash
# Fast check (Chromium + Mobile Chrome):
./morcus.sh e2e --visual

# Full verification across all engines:
./morcus.sh e2e --visual --all

# Run the suite and open the Visual Diff Inspector on any failures
# (expected vs actual; baselines are NOT modified):
./morcus.sh e2e --visual --all --diff

# Update visual baseline snapshots — requires explicit human approval first,
# see the Visual Baseline Approval Rule above:
./morcus.sh e2e --visual --all --update
```

> [!NOTE]
> The suite currently holds 72 baselines (18 views × 4 projects). Reader coverage is thin: `v2-reader-passage` points at `/v2/reader`, which is the landing view and contains no passage text, so the only scenario exercising real passage rendering is `v2-reader-parallel`.

#### D. Visual Diff Inspector

An interactive viewer for screenshot changes (`src/scripts/visual_diff/`). It reads from one of two sources:

- **`results`**: Playwright's failure output in `test-results/` (expected vs actual). Use this to review a failing run _before_ asking for approval.
- **`git`**: baseline PNGs in the working tree vs a git ref. Use this to review baselines after `--update`.

```bash
# Auto-detect the source (git changes first, then Playwright failures):
./morcus.sh visual-diff        # or: ./morcus.sh diff, npm run visual-diff

# Pick a source explicitly:
./morcus.sh visual-diff --source results
./morcus.sh visual-diff --source git --ref HEAD~1

# Write the viewer and a markdown report to .cache/visual-diff/ without a server:
./morcus.sh visual-diff --no-server --report /tmp/visual-diff.md

# The viewer listens on all interfaces (like the dev server); restrict it to this machine with:
./morcus.sh visual-diff --host 127.0.0.1
```

> [!IMPORTANT] > **For agents:** `visual-diff` and `e2e --visual --diff` keep a server running until stopped (Ctrl+C), so start them as a background/daemon process, not a blocking command. Everything is also written to `.cache/visual-diff/` (`report.md`, `index.html`, `images/<id>.{before,after,diff}.png`); use `--no-server` when you only need those files. If nothing changed, the command prints `No changed snapshots found.` and exits without starting a server.

The viewer offers before/after flip (<kbd>Space</kbd>, hold-to-peek, auto-blink with <kbd>B</kbd>), a split slider (<kbd>S</kbd>), a diff mask overlay (<kbd>D</kbd>), side-by-side view (<kbd>4</kbd>), zoom, and filtering by page, color (light/dark), size (mobile/desktop), scripting (JS/No-JS), browser, and name. Option counts reflect the other active filters, and filters are kept in the URL hash. Press <kbd>?</kbd> for all shortcuts. Pixel counts and diff masks need ImageMagick (6 or 7); without it, the `results` source falls back to Playwright's own diff images.

---

## 4. Server Management for E2E and Visual Tests

Playwright tests require the server to be running (typically configured on port `5757` or `1337`).

- **Start local server via `run_morcus`**:
  ```bash
  PORT=5757 ./morcus.sh web -w
  ```
  _Alternatively:_
  ```bash
  PORT=5757 MAIN=start npm run ts-node src/start_server.ts
  ```

---

## 5. Verification Checklists for UI V2

### A. Pre-Commit Checklist (Fast Iteration)

Run these before each commit to ensure code compiles and passes fast unit tests (all tools use incremental caching via `.cache/`):

1. `npx eslint --cache src/web/v2` (TypeScript lint check)
2. `npm run lint:css` (Stylelint CSS design token check)
3. `npx tsc --noEmit` (TypeScript typecheck, incremental via `.cache/.tsbuildinfo`)
4. `npm run tsnp src/bundler/v2.rsbuild.ts -- --minify` (ensure bundle builds cleanly with minification)
5. `npm run ts-tests:v2` (ensure all fast V2 unit tests pass)
6. `npx prettier --cache src/web/v2 --check` (or format modified files)

### B. Pre-Push Checklist (Full Verification)

Before pushing to the remote repository, ensure full browser matrix parity and 0 visual regressions on a running dev server:

1. Start dev server: `PORT=5757 ./morcus.sh web -w` (if not already running)
2. Run functional E2E tests: `./morcus.sh e2e --v2 --all`
3. Run visual regression tests: `./morcus.sh e2e --visual --all` (ensure 0 pixel diffs across all 72 baseline snapshots). If any differ, follow the Visual Baseline Approval Rule and review them with `./morcus.sh visual-diff --source results`.
