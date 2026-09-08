# UI V2 (Progressive Enhancement Architecture)

## Overview

The UI V2 prototype explores a server-rendered Multi-Page Application (MPA) model as an alternative to the existing Single-Page Application (SPA) + JSON-RPC architecture.

### Core Principles

1. **Zero-JS Baseline**: All primary user flows (dictionary lookup, inflected search, site navigation, and readability) function 100% without client-side JavaScript using standard HTML semantics (`<form method="GET">`, native `<details>`/`<summary>`, and semantic `<a>` links).
2. **Light DOM Custom Elements (Zero Framework Overhead)**: Web Components extend native `HTMLElement` to wrap server-rendered markup without shadow root barriers or form association issues, keeping client bundle size minimal (<15 KB).
3. **Safe DOM Manipulation**: Components use safe DOM APIs (`textContent`, `replaceChildren`, and `createContextualFragment`) with event delegation for performant, robust updates and automated XSS protection.
4. **Coexistence**: Mounted under `/v2/*`, leaving the existing React/Preact SPA, RPC endpoints, and build pipelines completely unaffected.

---

## Architecture & Layout Philosophy

UI V2 is structured by **topic (domain vertical slices)** rather than technical file types:

```
src/web/v2/
├── shell/       # Document skeleton, app bar, theme & global design tokens
├── dict/        # Dictionary search, entry rendering, inflections & settings
├── reader/      # Parallel two-column reader
├── dialog/      # Accessible modal dialogs & issue reporting
├── about/       # Project information & metadata
├── v2_router.ts # Express router orchestrator mounted at /v2 (public integration)
├── v2_bundle.ts # Client bundle manifest (imports *.client.ts)
├── v2.css       # Global stylesheet manifest (imports topic *.css)
└── v2-critical.css # Inlined above-the-fold critical CSS
```

### Core Design Rules

1. **Colocated Vertical Slices**: Each topic folder contains everything required for that domain: SSR HTML templates, Light DOM Web Components, stylesheets, and unit tests. Deleting or refactoring a feature is isolated to its topic folder.
2. **Target Suffix Convention**:
   - `*.server.ts`: Executes in Node.js (Express SSR renderers, XML parsers, server-side utilities). **Never** bundled to browser assets; **no** browser DOM globals (`window`, `document`, `HTMLElement`).
   - `*.client.ts`: Executes in the Browser (Light DOM Web Components, client event delegation). Bundled via Rsbuild into `build/v2/v2.js`.
   - `*.test.ts`: Colocated unit tests targeting adjacent modules.
   - `*.css`: Feature-scoped styles imported by the root `v2.css`.
3. **Flat Topic Directories**: Topics remain flat by default (avoiding micro-directories for 1–2 files). Filename prefixes (e.g. `dict_search.*`, `dict_settings.*`) keep related files automatically clustered alphabetically. Subdirectories are introduced only when a subcomponent exceeds 4+ dedicated files.
4. **Root Integration Hubs**: Top-level entry points (`v2_router.ts`, `v2_bundle.ts`, `v2.css`) aggregate exports across topics so external consumers have a single, stable contract.

### Build Pipeline

- **Bundler script**: [src/bundler/v2.rsbuild.ts](src/bundler/v2.rsbuild.ts)
- **Output bundle**: `build/v2/v2.js` (ESM module loaded via `<script type="module" src="/v2/assets/v2.js">`)
- **Stylesheet**: `src/web/v2/v2.css` served statically at `/v2/assets/v2.css`

---

## Data Flow & Progressive Enhancement

UI V2 follows a universal progressive enhancement lifecycle across all pages:

1. **Zero-JS Initial Paint**: The user issues a standard HTTP `GET` (e.g. `/v2/dicts?q=habeo` or `/v2/reader`). Express renders a complete semantic HTML document with native `<form>`, `<details>`, and `<a>` elements.
2. **Non-Blocking Enhancement**: The browser downloads the lightweight `<15 KB` client bundle (`v2.js`) and defines native custom elements (`customElements.define`).
3. **Client Form Hijack & Partial Swapping**: When JavaScript is active, Web Components intercept user actions, fetch partial HTML fragments (`format=partial`) or autocomplete JSON from the router, and swap DOM nodes instantaneously via `replaceChildren()` while syncing URL state with `history.pushState()`.

> **Topic-Specific Data Flows**: Detailed request lifecycle sequence diagrams and component breakdowns live in each topic's documentation (e.g., see [dict/README.md](dict/README.md)).

---

## Theme Switching Model

- **No-JS**: Media query `@media (prefers-color-scheme: dark)` adapts colors automatically based on the user's OS preference. Interactive custom elements (`morcus-theme-toggle` and `morcus-report-dialog`) are hidden using `:not(:defined) { display: none; }` so no dead controls are shown to users without JavaScript.
- **With JS**: `<morcus-theme-toggle>` and `<morcus-report-dialog>` initialize and display buttons in the app bar. Theme selection toggles `[data-theme="dark"]` / `[data-theme="light"]` on `document.documentElement` and persists to `localStorage.getItem("GlobalSettings")`. Feedback reporting opens via native `<dialog>` modal and submits via AJAX.
- **Zero Flicker**: An inline script in `<head>` executes before the first paint to apply the saved theme attribute immediately.

---

## Rapid Iteration Workflow (Instruction for AI Agents)

> [!IMPORTANT] > **Fast Visual Feedback**: When iterating on small changes (especially styling/CSS adjustments, visual polish, or minor UI tweaks):
>
> - **Make the fix and restart the server immediately** so the user can see it visually right away.
> - **Do NOT** wait for or run linting (`eslint`), formatting (`prettier`), type checking (`tsc`), or test suites during rapid iteration.
> - Save full verification (lint, types, tests) for when the user is satisfied with the visual outcome or explicitly asks to finalize/commit.

---

## Testing & Quality Verification (Pre-Commit / Finalization)

Comprehensive instructions for running unit tests and Playwright E2E tests are detailed in [TESTING.md](TESTING.md). Run these when finalizing features or before committing:

- **Linting & Import Rules**: `npx eslint src/web/v2`
- **Code Style**: `npx prettier src/web/v2 --check`
- **Type Checking**: `npx tsc --noEmit`
- **Unit Tests**: `npx jest src/web/v2`
- **E2E Tests**: `REUSE_DEV_SERVER=true PORT=1337 npx playwright test browser_v2_e2e`
