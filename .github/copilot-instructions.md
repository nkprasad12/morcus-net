# Morcus.net Coding Guidelines

## Project Overview
Morcus.net is a collection of digital tools for Latin language, including:
- Web-based library for reading Latin texts
- Morphological analysis tools (Morceus)
- Latin dictionary lookups
- NLP processing for Latin texts

## Architecture

### Components
- **Web Client**: React/Preact-based SPA in TypeScript (`src/web/client/`)
- **Web Server**: Express.js server (`src/web/server/`, `src/web/web_server.ts`)
- **Morceus**: Latin morphological analyzer (`src/morceus/`)
- **Dictionary**: Lewis & Short, Smith & Hall dictionary handling (`src/web/storage/`)
- **Python NLP**: Latin processing tools (`src/py/latincy/`, `src/macronizer/`)

### Data Flow
1. Client requests Latin texts and lookups via APIs
2. Server processes requests using the dictionary/morphological databases
3. Preprocessing creates optimized databases from raw Latin texts
4. Client displays content with features like pagination and word lookups

## Development Workflow

### Setup and Run
```bash
# First-time setup
./first_time_setup.sh

# Start server with dev build
./morcus.sh web

# Build with minification (production)
./morcus.sh web --minify

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
// Example: Validating API responses
const isApiResponse = matchesObject<ApiResponse>({
  data: isArray(isString),
  count: isNumber
});
```

### Latin Text Processing
- Texts are stored in `ProcessedWork2` format (`src/common/library/library_types.ts`)
- Navigation uses sectioning based on `textParts`
- Pagination logic handles sections based on word counts (`src/web/client/pages/library/reader/library_reader/`)

### Database Pattern
- SQLite databases are used for storing processed dictionaries
- Better-sqlite3 is used for database access
- Database schema is defined in TypeScript with interfaces

## Key Files
- `src/web/web_server.ts`: Main server setup
- `src/web/client/root.tsx`: Main client entry point
- `src/morceus/crunch.ts`: Core morphological analysis
- `src/common/library/library_types.ts`: Text data structure definitions
- `package.json`: NPM scripts for common operations

## Conventions
- Use TypeScript for all new code
- Tests should be named `*.test.ts` or `*.test.tsx`
- Follow ESLint/Prettier formatting (run `npm run format` before committing)
- Python code should use black formatting
- Use strict validation for API request/response data

## Environment Setup
Environment variables can be set in `.env` file. Key variables:
- `PORT`: Server port (default: 5757)
- `LS_PATH`: Path to Lewis & Short dictionary XML
- `LS_PROCESSED_PATH`: Output path for processed dictionary

Use `npm run pre-commit` before creating a PR to verify formatting, tests, and builds.
