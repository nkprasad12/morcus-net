# Agent Guidelines & Operational Instructions

Welcome! This repository hosts Morcus Net. Follow the instructions and conventions below when developing, building, running, or testing within this codebase.

---

## 1. General Orchestration Convention: `run_morcus` (`morcus.sh`)

In this repository, operational tasks—such as starting development servers, building data/dictionary artifacts, running client bundles, managing background workers, and running pipelines—conventionally go through the central dispatcher:

- **CLI Wrapper**: `./morcus.sh <command> [flags]` (or via npm: `npm run morcus -- <command> [flags]`)
- **TypeScript Entrypoint**: `src/scripts/run_morcus.ts` (run via `npm run run-morcus -- <command> [flags]`)

### Core Subcommands

| Command  | Description                                                | Common Usage                                                                  |
| -------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `web`    | Builds artifacts & starts the web server                   | `./morcus.sh web -w` (watch mode dev server)<br>`./morcus.sh web --build_all` |
| `build`  | Builds dictionary/corpus artifacts without starting server | `./morcus.sh build --build_all`<br>`./morcus.sh build -b_ls -b_grg`           |
| `bundle` | Builds and bundles client JS/CSS                           | `./morcus.sh bundle -m` (minify)<br>`./morcus.sh bundle -a` (analyze)         |
| `e2e`    | Runs E2E integration test pipelines                        | `./morcus.sh e2e -d` (local dev server)                                       |
| `worker` | Starts background cruncher/NLP workers                     | `./morcus.sh worker -wt ls`                                                   |
| `corpus` | Corpus processing utilities and Rust CLI                   | `./morcus.sh corpus -r`                                                       |

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

Verifies pixel-perfect UI fidelity across 7 core views, 4 form-factors/browsers, light/dark modes, and JS/No-JS modes (112 tests total):

```bash
# Fast check (Chromium + Mobile Chrome):
./morcus.sh e2e --visual

# Full verification across all engines:
./morcus.sh e2e --visual --all

# Update visual baseline snapshots (only when intentionally recording new baselines):
./morcus.sh e2e --visual --all --update
```

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

Run these before each commit to ensure code compiles and passes fast unit tests:

1. `npx eslint src/web/v2` (lint check)
2. `npx tsc --noEmit` (TypeScript typecheck)
3. `npm run tsnp src/bundler/v2.rsbuild.ts -- --minify` (ensure bundle builds cleanly with minification)
4. `npm run ts-tests:v2` (ensure all fast V2 unit tests pass)
5. `npx prettier src/web/v2 --check` (or format modified files)

### B. Pre-Push Checklist (Full Verification)

Before pushing to the remote repository, ensure full browser matrix parity and 0 visual regressions on a running dev server:

1. Start dev server: `PORT=5757 ./morcus.sh web -w` (if not already running)
2. Run functional E2E tests: `./morcus.sh e2e --v2 --all`
3. Run visual regression tests: `./morcus.sh e2e --visual --all` (ensure 0 pixel diffs across all 112 baseline snapshots)
