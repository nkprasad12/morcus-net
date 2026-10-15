# Morcus.net Coding Guidelines

## Project Overview

Morcus.net is a collection of digital tools for Latin language, including:

- Web-based library for reading Latin texts
- Morphological analysis tools (Morceus)
- Latin dictionary lookups
- NLP processing for Latin texts

## Architecture

> For comprehensive subsystem breakdowns, data flow diagrams, and deep dives across TypeScript, Rust, and Python components, see [ARCHITECTURE.md](ARCHITECTURE.md).

### Components

- **Web UI (UI V2)**: Server-rendered pages enhanced by Light DOM custom elements (`src/web/v2/`), client code bundled with Rsbuild. See `src/web/v2/README.md`.
- **Web Server**: Express.js server (`src/start_server.ts`, `src/web/web_server.ts`, and the UI V2 router `src/web/v2/v2_router.server.ts`) built with esbuild.
- **Morceus**: Latin morphological analyzer (`src/morceus/` in TS and `morceus_rust/` in Rust).
- **Dictionary**: Fused multi-dictionary engine (`src/common/dictionaries/`) supporting Lewis & Short, Smith & Hall, Gaffiot, Georges, Pozo, Gesner, Forcellini, Riddle & Arnold, and Numerals backed by SQLite.
- **Corpus Query Engine**: High-performance Rust query engine (`corpus_rust/`) exposed via native Node bindings (`lib.rs`).
- **Python NLP**: Latin processing tools (`src/py/latincy/`, `src/py/stanza/`, `src/macronizer/`).

### Data Flow

1. The browser requests pages (`/dicts`, `/work/...`, `/corpus`, ...); with JS, the same URLs also return partials for in-place updates.
2. Server renders them using fused dictionary engines, the Morceus cruncher, or the Rust corpus query engine.
3. Preprocessing pipelines normalize raw texts (Perseus, Hypotactic, PHI) and lexica into optimized SQLite and JSON databases.
4. Client code enhances the reader, dictionary, macronizer and corpus pages; every page also works without JS.

## Development Workflow

### Setup and Run

```bash
# First-time setup
./set_up_or_update.sh

# Build the UI V2 assets and start the server
./morcus.sh web

# Process dictionaries (first time or after changes)
./morcus.sh web --build_ls --build_sh
```

### Testing

Unit tests use Jest for TypeScript.
Integration tests use Playwright.

```bash
# Run TypeScript tests
npm run ts-tests

# Run Python tests
npm run py-tests

# Run all tests
npm run test

# Run integration tests
npm run integration-tests
```

## Project Patterns

### Validation

The codebase uses validation functions in `src/web/utils/rpc/parsing.ts` for type checking:

```typescript
// Example: validating stored or fetched data
const isApiResponse = matchesObject<ApiResponse>({
  data: isArray(isString),
  count: isNumber,
});
```

### Latin Text Processing

- Texts are stored in `ProcessedWork2` format (`src/common/library/library_types.ts`)
- Navigation uses sectioning based on `textParts`
- UI V2 serves preprocessed pages from `src/common/library/v2/` (see `src/web/v2/reader/README.md`)

### Database Pattern

- SQLite databases are used for storing processed dictionaries
- Better-sqlite3 is used for database access
- Database schema is defined in TypeScript with interfaces

## Key Files

- `src/web/web_server.ts`: Main server setup
- `src/web/v2/v2_router.server.ts`: UI V2 routes
- `src/morceus/crunch.ts`: Core morphological analysis
- `src/common/library/library_types.ts`: Text data structure definitions
- `package.json`: NPM scripts for common operations

## Conventions

- Use TypeScript for all new code
  - Always use absolute imports for Typescript code. For example, the module
    - `src/web/v2/reader/reader_view.client.ts` should be imported as
      `@/web/v2/reader/reader_view.client`.
- Tests should be named `*.test.ts`
  - Tests that require DOM should include `@jest-environment jsdom` at the top
  - Matchers like `toBeInTheDocument()` are not available; find alternatives.
- UI V2 conventions (target suffixes, zero-JS baseline, testing) are in `src/web/v2/README.md` and `src/web/v2/docs/TESTING.md`.
- Follow ESLint/Prettier formatting (run `npm run format` before committing)
- Python code should use black formatting
- Use strict validation for API request/response data

## Environment Setup

Environment variables can be set in `.env` file. Key variables:

- `PORT`: Server port (default: 5757)
- `LS_PATH`: Path to Lewis & Short dictionary XML
- `LS_PROCESSED_PATH`: Output path for processed dictionary

Use `npm run pre-commit` before creating a PR to verify formatting, tests, and builds.
