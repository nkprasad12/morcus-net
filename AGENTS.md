# Agent Guidelines & Operational Instructions

Welcome! This repository hosts Morcus Net. Follow the instructions and conventions below when developing, building, running, or testing within this codebase.

---

## 1. General Orchestration Convention: `run_morcus` (`morcus.sh`)

In this repository, operational tasks—such as starting development servers, building data/dictionary artifacts, running client bundles, managing background workers, and running pipelines—conventionally go through the central dispatcher:

- **CLI Wrapper**: `./morcus.sh <command> [flags]` (or via npm: `npm run morcus -- <command> [flags]`)
- **TypeScript Entrypoint**: `src/scripts/run_morcus.ts` (run via `npm run run-morcus -- <command> [flags]`)

### Core Subcommands

| Command            | Description                                                 | Common Usage                                                        |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| `web`              | Builds artifacts & starts the web server                    | `./morcus.sh web` (dev server)<br>`./morcus.sh web --build_all`     |
| `build`            | Builds dictionary/corpus artifacts without starting server  | `./morcus.sh build --build_all`<br>`./morcus.sh build -b_ls -b_grg` |
| `bundle`           | Builds the web client JS/CSS into `build/client/`           | `./morcus.sh bundle -m` (minify and precompress)                    |
| `e2e`              | Runs E2E integration test pipelines                         | `./morcus.sh e2e` (local dev server)<br>`./morcus.sh e2e --docker`  |
| `worker`           | Starts background cruncher/NLP workers                      | `./morcus.sh worker -wt ls`                                         |
| `corpus`           | Corpus processing utilities and Rust CLI                    | `./morcus.sh corpus -r`                                             |
| `visual-diff`      | Interactive viewer for screenshot diffs (`TESTING.md` §2.F) | `./morcus.sh visual-diff --source results`                          |
| `visual-baselines` | Local (gitignored) screenshot baselines and checkpoints     | `./morcus.sh visual-baselines status`                               |
| `test`             | Jest: unit tests related to your changes, or a whole tier   | `./morcus.sh test`<br>`./morcus.sh test --whole-system`             |

> [!TIP]
> Run `./morcus.sh --help` or `./morcus.sh <command> --help` to inspect available flags and options.

---

## 2. Architecture & Web Client Documentation

Before proposing architectural changes or running test suites, consult the dedicated guides:

- **Repository Architecture Guide**: [`ARCHITECTURE.md`](ARCHITECTURE.md)
  - High-level overview of the Express server, dictionary engines, Morceus cruncher, Rust corpus engine, library pipeline, and Python NLP stack.
- **Web UI Architecture & Progressive Enhancement Guide**: [`src/web/ui/README.md`](src/web/ui/README.md)
  - Covers vertical slices (`src/web/ui/`), `*.server.ts` vs `*.client.ts` target suffixes, Light DOM custom element conventions, zero-JS baseline philosophy, and Rsbuild bundling.
- **Web Testing & Verification Guide**: [`src/web/ui/docs/TESTING.md`](src/web/ui/docs/TESTING.md)
  - Full details on running unit tests, end-to-end (E2E) tests, visual regression tests, the Visual Diff Inspector, and pre-commit / pre-push verification checklists.

---

## 3. Testing Web & Client Code: Critical Rules

### ⛔ Use `./morcus.sh e2e`, Not `npm run integration-tests`

**Do NOT run `npm run integration-tests` directly.**

It is CI's entry point: without `REUSE_DEV_SERVER` it starts a Docker image named by `IMAGE_TAG`. Use `./morcus.sh e2e` (see [`src/web/ui/docs/TESTING.md`](src/web/ui/docs/TESTING.md)), which runs the same suites against the dev server (or a Docker image with `--docker`).

### ⛔ Proactive Testing Rule

**Do NOT proactively run slow E2E or visual regression test suites without user confirmation.**
Related unit tests (`./morcus.sh test`) may be run when verifying logic, but multi-browser E2E and visual diff tests require a running server, consume significant resources, and should only be run when requested or during final pre-commit verification.
The Visual Diff Inspector (`./morcus.sh visual-diff`) is exempt: it launches no browsers and only reads existing screenshots, so start it whenever there are diffs to show.

### ⛔ Unit Tests: Test What You Changed, Then the Whole System Before Committing

Jest tests are split into two projects in [`jest.config.js`](jest.config.js), by what they check rather than where they live:

- **`unit`**: ordinary tests. After an edit, run only the ones related to what you changed: `./morcus.sh test`. It runs the `unit` tests that import any file changed since `HEAD` (including uncommitted and untracked files). Pass paths (`./morcus.sh test src/foo.ts`) to pick the scope yourself.
- **`whole-system`**: `*_conformance.test.ts` and `inventory_ratchet.test.ts`. They sweep every SSR fixture, module and stylesheet, so they depend on almost everything and take most of the suite's time. **Don't run them after every edit.** Run them once before each commit: `./morcus.sh test --whole-system`.

Testing only what changed since `HEAD` is safe because every commit is expected to pass both tiers, so the pre-commit `--whole-system` run is **required**. Related-test selection only follows `import`s: a change to a file that tests read from disk (CSS, JSON) is only caught by the whole-system tier.

### ⛔ Visual Baseline Approval Rule

**NEVER checkpoint or commit updated screenshot baselines without explicit human approval.**

A baseline update rewrites the definition of "correct" for the UI. An agent that both changes the pixels and re-blesses them has removed the only check on its own visual judgement, so this decision belongs to the user every time.

Baselines have two tiers ([`src/web/ui/docs/TESTING.md` §2.F](src/web/ui/docs/TESTING.md#baselines-committed-checkpoint--local-overlay)): the committed **checkpoint** (`*-snapshots/`) and gitignored **local baselines** (`.visual-baselines/local/`). `./morcus.sh e2e --visual --all --update` writes only to the local tier. That's reversible and never committed, so agents may run it without asking, but the diffs must still be shown to the user.

When a change causes pixel diffs:

1. Run the visual suite **without** `--update` first, to see exactly what moved: `./morcus.sh e2e --visual --all`.
2. Report which snapshots differ and why, using the Visual Diff Inspector ([`src/web/ui/docs/TESTING.md` §2.F](src/web/ui/docs/TESTING.md#option-f-visual-regression-tests--the-visual-diff-inspector)):
   - Start it in the background with `./morcus.sh visual-diff --source results` (or `--source local` after `--update`) and give the user the `Network:` URL it prints, so they can flip through before/after themselves.
   - To inspect the diffs yourself, read `.cache/visual-diff/report.md` and the `images/*.{before,after,diff}.png` files next to it.
3. You may accept the new screenshots locally with `--update`. Don't call the UI change done until the user has seen the diffs.
4. **Wait for approval before checkpointing.** Do not run `./morcus.sh visual-baselines checkpoint`, write to `*-snapshots/` any other way, or `git add` anything under `*-snapshots/`, until the user has said yes.
5. Only then checkpoint, re-check the checkpoint against `HEAD` with `./morcus.sh visual-diff --source git`, and commit, listing the affected files.

This applies to amending or fixing up an earlier baseline commit too.

### Quick Test & Verification Reference

For full command flags, debugging modes, and the complete Pre-Commit / Pre-Push checklists, see [`src/web/ui/docs/TESTING.md`](src/web/ui/docs/TESTING.md):

| Task                            | Command                                                                  |
| ------------------------------- | ------------------------------------------------------------------------ |
| **Unit tests for your changes** | `./morcus.sh test` (or `./morcus.sh test path/to/file.ts`)               |
| **Whole-system tests**          | `./morcus.sh test --whole-system` (once, before committing)              |
| **All TypeScript tests**        | `./morcus.sh test --all` (CI runs them via `npm run coverage`)           |
| **Lint & style checks**         | `npx eslint --cache src/web/ui && npm run lint:css && npx tsc --noEmit`  |
| **Start dev server**            | `PORT=5757 ./morcus.sh web`                                              |
| **Functional E2E (Playwright)** | `./morcus.sh e2e` (fast) · `./morcus.sh e2e --all` (all browsers)        |
| **Visual regression suite**     | `./morcus.sh e2e --visual --all` (`--diff` to open inspector on failure) |
| **Visual Diff Inspector**       | `./morcus.sh visual-diff --source results` (or `--source git`)           |
