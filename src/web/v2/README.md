# UI V2 (Progressive Enhancement Architecture)

## Overview

The UI V2 prototype explores a server-rendered Multi-Page Application (MPA) model as an alternative to the existing Single-Page Application (SPA) + JSON-RPC architecture.

### Core Principles

1. **Zero-JS Baseline**: All primary user flows (dictionary lookup, inflected search, site navigation, and readability) function 100% without client-side JavaScript using standard HTML semantics (`<form method="GET">`, native `<details>`/`<summary>`, and semantic `<a>` links).
2. **Light DOM Custom Elements with Lit**: Web Components inherit global styles seamlessly and wrap server-rendered markup without shadow root barriers or form association issues (`createRenderRoot() { return this; }`).
3. **No `innerHTML` Manipulation**: Components use Lit's declarative `html` tagged templates, reactive properties, and DOM fragment parsing (`createContextualFragment` / `replaceChildren`) for safe, fine-grained updates and automated XSS protection.
4. **Coexistence**: Mounted under `/v2/*`, leaving the existing React/Preact SPA, RPC endpoints, and build pipelines completely unaffected.

---

## Architecture & Directory Layout

```
src/web/v2/
├── client/                               # Client-side Lit Web Components (Light DOM)
│   ├── morcus_dict_search.ts            # Form hijacking, keyboard navigation & history syncing
│   ├── morcus_dict_suggestions.ts       # Declarative autocomplete dropdown component
│   ├── morcus_theme_toggle.ts           # Light/dark mode toggle button (hidden when JS disabled)
│   ├── morcus_report_dialog.ts          # "Report an Issue" modal dialog (progressive enhancement)
│   └── v2_bundle.ts                     # Client entry point bundling all custom elements
├── server/                               # Server-side rendering (SSR) templates
│   ├── dict/                            # Modular dictionary SSR renderers
│   │   ├── xml_to_html.ts               # TEI XML AST to clean semantic HTML
│   │   ├── linkify.ts                   # Click-to-lookup Latin word linkification
│   │   ├── entry_view.ts                # Entry result card, outline, & inflection tables
│   │   └── dict_page.ts                 # Full page shell & multi-lexicon container
│   ├── dict_ssr.ts                      # Clean re-exporting facade for dictionary SSR
│   ├── page_shell.ts                    # Shared document skeleton, app bar, & anti-flash theme script
│   ├── dialog.ts                        # Shared accessible dialog & report issue dialog generators
│   ├── dialog.test.ts                   # Unit tests for dialog generators
│   ├── about_ssr.ts                     # About page content & metadata renderer
│   ├── dict_ssr.test.ts                 # Unit tests for dictionary SSR
│   └── about_ssr.test.ts                # Unit tests for About page SSR
├── styles/                              # Modular CSS stylesheets (bundled via @import)
│   ├── variables.css                    # Design tokens & light/dark/system theme variables
│   ├── app_bar.css                      # App bar, brand logo, & navigation links
│   ├── search.css                       # Search form, input, button, & suggestions dropdown
│   ├── dictionary.css                   # Dict cards, entry headers, segmented bar, & lexical styles
│   ├── dialog.css                       # Modal dialog, buttons, & report issue form
│   └── about.css                        # About page typography & section layout
├── v2.css                               # Standalone CSS entry point importing styles/*
├── v2-critical.css                      # Critical inlined CSS (imports variables.css)
├── v2_router.ts                         # Express router mounted at /v2 (search, autocomplete, reporting)
├── v2_router.test.ts                    # Router integration tests
└── TESTING.md                           # Guide for running unit and E2E Playwright tests
```

### Build Pipeline

- **Bundler script**: [src/bundler/v2.esbuild.ts](src/bundler/v2.esbuild.ts)
- **Output bundle**: `build/v2/v2.js` (ESM module loaded via `<script type="module" src="/v2/assets/v2.js">`)
- **Stylesheet**: `src/web/v2/v2.css` served statically at `/v2/assets/v2.css`

---

## Data Flow & Request Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor User as Browser / User
    participant Router as Express (/v2/dicts)
    participant Fused as FusedDictionary (Server)
    participant Lit as Lit Web Components (Client)

    alt Initial Load / No-JS Form Submit
        User->>Router: GET /v2/dicts?q=habeo
        Router->>Fused: getEntry({ query: "habeo", mode: 1 })
        Fused-->>Router: DictsFusedResponse
        Router-->>User: 200 OK (Full SSR HTML document with <details>, app bar)
    else With JS: Live Autocomplete
        User->>Lit: Type "hab" into <input name="q">
        Lit->>Router: GET /v2/api/completions?q=hab
        Router->>Fused: getCompletions("hab")
        Fused-->>Router: string[]
        Router-->>Lit: JSON string[]
        Lit-->>User: Declarative <morcus-dict-suggestions> dropdown
    else With JS: Form Hijack (AJAX Swap)
        User->>Lit: Submit form / select suggestion
        Lit->>Router: GET /v2/dicts?q=habeo&format=partial (X-Requested-With: fetch)
        Router->>Fused: getEntry({ query: "habeo", mode: 1 })
        Router-->>Lit: HTML fragment (<details class="v2-dict-card">...)
        Lit->>User: replaceChildren(fragment) & history.pushState()
    end
```

---

## Theme Switching Model

- **No-JS**: Media query `@media (prefers-color-scheme: dark)` adapts colors automatically based on the user's OS preference. Interactive custom elements (`morcus-theme-toggle` and `morcus-report-dialog`) are hidden using `:not(:defined) { display: none; }` so no dead controls are shown to users without JavaScript.
- **With JS**: `<morcus-theme-toggle>` and `<morcus-report-dialog>` initialize and display buttons in the app bar. Theme selection toggles `[data-theme="dark"]` / `[data-theme="light"]` on `document.documentElement` and persists to `localStorage.getItem("GlobalSettings")`. Feedback reporting opens via native `<dialog>` modal and submits via AJAX.
- **Zero Flicker**: An inline script in `<head>` executes before the first paint to apply the saved theme attribute immediately.

---

## Testing & Verification

Comprehensive instructions for running unit tests and Playwright E2E tests are detailed in [TESTING.md](TESTING.md).

- **E2E Tests**: `REUSE_DEV_SERVER=true PORT=1337 npx playwright test browser_v2_e2e`
- **Unit Tests**: `npx jest src/web/v2`
- **Type Checking**: `npx tsc --noEmit`
