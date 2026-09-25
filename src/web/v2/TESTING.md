# Testing Guide for UI V2

This document provides instructions for developers and AI agents on running unit and end-to-end (E2E) tests for the UI V2 (Multi-Page / Progressive Enhancement architecture).

---

## 1. Test Locations

- **E2E Tests (Playwright)**: `src/integration/suites/browser_v2_e2e.test.ts`
- **Unit Tests (Jest)**: Colocated alongside source modules matching `src/web/v2/**/*.test.ts` (run via `npm run ts-tests:v2`). Tests cover SSR renderers, routing, bitmask/clustering logic, custom elements, and core utilities across each vertical slice (`about/`, `core/`, `dialog/`, `dict/`, `reader/`, `shell/`, and `v2_router.test.ts`).

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
   REUSE_DEV_SERVER=true PORT=1337 npx playwright test browser_v2_e2e
   ```

### Option B: Target a Single Browser Engine

Playwright runs against Chromium, Firefox, WebKit, and mobile viewports by default. To run tests quickly against Chromium only:

```bash
REUSE_DEV_SERVER=true PORT=1337 npx playwright test browser_v2_e2e --project=chromium
```

### Option C: Run a Specific Test Case

Filter tests by name using `-g`:

```bash
# Test No-JS SSR fallback only
REUSE_DEV_SERVER=true PORT=1337 npx playwright test browser_v2_e2e -g "No-JS fallback"

# Test theme toggling
REUSE_DEV_SERVER=true PORT=1337 npx playwright test browser_v2_e2e -g "theme"
```

### Option D: Interactive / Headed / Debug Modes

```bash
# Interactive UI mode
REUSE_DEV_SERVER=true PORT=1337 npx playwright test browser_v2_e2e --ui

# Headed browser
REUSE_DEV_SERVER=true PORT=1337 npx playwright test browser_v2_e2e --headed

# Playwright inspector / step-through debugger
REUSE_DEV_SERVER=true PORT=1337 npx playwright test browser_v2_e2e --debug
```

### Option E: Running via `run_morcus` (`morcus.sh`) (Recommended)

To run the functional V2 tests without touching legacy V1 tests or unsupported WebKit:

```bash
# Fast run (Chromium + Mobile Chrome):
./morcus.sh e2e --v2

# Full matrix (Chromium + Mobile Chrome + Firefox + Firefox Small Screen):
./morcus.sh e2e --v2 --all
```

> [!WARNING] > **Do NOT run `npm run integration-tests` when working on UI V2.** > `npm run integration-tests` runs legacy V1 tests and attempts to launch WebKit/Safari, which is unsupported on this Linux setup and will fail or cause the test runner to hang.

### Option F: Visual Regression Tests & the Visual Diff Inspector

```bash
# Screenshot comparison against the checked-in baselines:
./morcus.sh e2e --visual --all

# Same, then open the Visual Diff Inspector on any failures:
./morcus.sh e2e --visual --all --diff

# Inspect existing diffs without re-running tests:
./morcus.sh visual-diff --source results   # last Playwright run
./morcus.sh visual-diff --source git       # updated baselines vs HEAD
```

The inspector keeps a server running until stopped (agents: start it in the background), and also writes `report.md` and before/after/diff PNGs to `.cache/visual-diff/`. See §3.C–D of [`AGENTS.md`](../../../AGENTS.md) for all options, and its Visual Baseline Approval Rule before running `--update`.

---

## 3. Running Unit Tests

For fast unit test verification of router, SSR rendering, and client components:

```bash
# Run all V2 unit tests
npm run ts-tests:v2

# Run a specific unit test file
npx jest src/web/v2/v2_router.test.ts
npx jest src/web/v2/dict/dict.test.ts
npx jest src/web/v2/core/dialog.test.ts
```

---

## 4. Verification Checklists for Agents

> [!IMPORTANT] > **Rapid Iteration vs. Commit vs. Push**:
>
> - **During rapid iteration**: Make the fix and restart the dev server immediately. Do NOT run tests or linter after every minor tweak.
> - **Pre-Commit**: Run fast checks (TypeScript, unit tests, code formatting).
> - **Pre-Push**: Run the full E2E matrix and visual regression tests across browsers.

### A. Pre-Commit Checklist (Fast)

1. **Linting check**:
   ```bash
   npx eslint --cache src/web/v2
   ```
2. **TypeScript check**:
   ```bash
   npx tsc --noEmit
   ```
3. **Bundle check**:
   ```bash
   npm run tsnp src/bundler/v2.rsbuild.ts -- --minify
   ```
4. **Unit tests**:
   ```bash
   npm run ts-tests:v2
   ```
5. **Code formatting**:
   ```bash
   npx prettier --cache src/web/v2 --check
   ```

### B. Pre-Push Checklist (Full Verification)

1.  **Start dev server** (if not already running):
    ```bash
    PORT=5757 ./morcus.sh web -w
    ```
2.  **Functional E2E tests (all browsers)**:
    ```bash
    ./morcus.sh e2e --v2 --all
    ```
3.  **Visual regression tests (all browsers)**:
    ```bash
    ./morcus.sh e2e --visual --all
    ```
4.  **If there are pixel diffs, review them before touching baselines** (see the Visual Baseline Approval Rule in `AGENTS.md`):

    ```bash
    # Opens the Visual Diff Inspector on Playwright's failures (expected vs actual):
    ./morcus.sh e2e --visual --all --diff

    # Only after explicit approval: update, then re-review the new baselines vs HEAD:
    ./morcus.sh e2e --visual --all --update
    ./morcus.sh visual-diff --source git
    ```
