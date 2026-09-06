# Testing Guide for UI V2

This document provides instructions for developers and AI agents on running unit and end-to-end (E2E) tests for the UI V2 (Multi-Page / Progressive Enhancement architecture).

---

## 1. Test Locations

- **E2E Tests (Playwright)**: `src/integration/suites/browser_v2_e2e.test.ts`
- **Unit Tests (Jest)**:
  - `src/web/v2/v2_router.test.ts` (Express router, HTTP routes, SSR responses, JSON completions)
  - `src/web/v2/server/dict_ssr.test.ts` (Dictionary SSR renderer, tabs, tool panes, HTML escaping)
  - `src/web/v2/server/about_ssr.test.ts` (About page SSR renderer)

---

## 2. Running E2E Tests with Playwright

Playwright tests are configured in `playwright.config.ts`. The V2 E2E suite verifies both **No-JS baseline** (SSR only) and **JS-enhanced** (Lit web components) interactions.

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

### Option E: Running Full Integration Suite (Matches CI)

To run all integration test suites (both V1 and V2):

```bash
npm run integration-tests
# or with an existing server:
REUSE_DEV_SERVER=true PORT=1337 npm run integration-tests
```

---

## 3. Running Unit Tests

For fast unit test verification of router and SSR rendering logic:

```bash
# Run all V2 unit tests
npx jest src/web/v2

# Run a specific unit test file
npx jest src/web/v2/v2_router.test.ts
npx jest src/web/v2/server/dict_ssr.test.ts
npx jest src/web/v2/server/about_ssr.test.ts
```

---

## 4. Verification Checklist for Agents

Before submitting changes affecting `src/web/v2/`:

1. **TypeScript check**:
   ```bash
   npx tsc --noEmit
   ```
2. **Unit tests**:
   ```bash
   npx jest src/web/v2
   ```
3. **E2E tests**:
   ```bash
   REUSE_DEV_SERVER=true PORT=1337 npx playwright test browser_v2_e2e
   ```
4. **Code formatting**:
   ```bash
   npm run format-check
   ```
