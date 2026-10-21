/* istanbul ignore file */

import { assert } from "@/common/assert";
import { MorceusTables } from "@/morceus/cruncher_tables";
import {
  StepConfig,
  TS_NODE,
  runCommand,
  runPipeline,
  shellStep,
} from "@/scripts/script_utils";
import { writeCommitId } from "@/scripts/write_source_version";
import { warnOnUpstreamDrift } from "@/scripts/upstream/clones";
import { UPSTREAM_ACTIONS, runUpstreamCli } from "@/scripts/upstream/cli";
import { DEV_SERVER_ENV } from "@/web/ui/core/server/build_version.server";
import { buildCompletionsDb } from "@/web/ui/dict/search/completions_db.server";
import { ArgumentParser, type ArgumentOptions } from "argparse";
import { ChildProcess, execFileSync, execSync, spawn } from "child_process";
import path from "path";

const WEB_SERVER = "web";
const WORKER = "worker";
const EDITOR = "editor";
const BUNDLE = "bundle";
const BUILD = "build";
const E2E = "e2e";
const CORPUS = "corpus";
const VISUAL_DIFF = "visual-diff";
const VISUAL_BASELINES = "visual-baselines";
const INVENTORY = "inventory";
const TEST = "test";
const UPSTREAM = "upstream";

const cleanupOperations: (() => unknown)[] = [];

registerCleanup();
const args = parseArguments();
if (args.command === WEB_SERVER) {
  void setupAndStartWebServer(args).then((success) => assert(success));
} else if (args.command === WORKER) {
  void awaitAll([startWorker(args, args.workerType)]);
} else if (args.command === EDITOR) {
  void startLsEditor();
} else if (args.command === BUNDLE) {
  void buildBundle(args).then(assert);
} else if (args.command === BUILD) {
  void buildArtifacts(args).then(assert);
} else if (args.command === E2E) {
  void runE2eTests(args).then(assert);
} else if (args.command === CORPUS) {
  void runCorpusCommand(args).then(assert);
} else if (args.command === VISUAL_DIFF || args.command === "diff") {
  void runVisualDiff(args).then(assert);
} else if (args.command === VISUAL_BASELINES) {
  void runVisualBaselines(args).then((ok) => {
    if (!ok) process.exit(1);
  });
} else if (args.command === INVENTORY) {
  void runInventory(args).then((ok) => {
    if (!ok) process.exit(1);
  });
} else if (args.command === TEST) {
  void runTests(args).then((ok) => {
    if (!ok) process.exit(1);
  });
} else if (args.command === UPSTREAM) {
  void runUpstream(args).then((ok) => {
    if (!ok) process.exit(1);
  });
}

interface CommandArgument {
  short: string;
  long: string;
  options?: ArgumentOptions;
}

function addArguments(parser: ArgumentParser, args: CommandArgument[]) {
  for (const arg of args) {
    parser.add_argument(arg.short, arg.long, arg.options);
  }
}

function parseArguments() {
  const parser = new ArgumentParser({
    description: "Helper scripts to start the Morcus Latin Tools",
  });
  const subparsers = parser.add_subparsers({
    title: "Command list",
    dest: "command",
    required: true,
  });

  const build = subparsers.add_parser(BUILD, {
    help: "Builds artifacts without starting the server.",
  });
  const COMMON_BUILD_ARGS: CommandArgument[] = [
    {
      short: "-b_ls",
      long: "--build_ls",
      options: { help: "Processes LS and saves to DB.", action: "store_true" },
    },
    {
      short: "-b_ra",
      long: "--build_ra",
      options: { help: "Processes RA and saves to DB.", action: "store_true" },
    },
    {
      short: "-b_grg",
      long: "--build_georges",
      options: {
        help: "Processes Georges and saves to DB.",
        action: "store_true",
      },
    },
    {
      short: "-b_pozo",
      long: "--build_pozo",
      options: {
        help: "Processes Pozo and saves to DB.",
        action: "store_true",
      },
    },
    {
      short: "-b_ges",
      long: "--build_gesner",
      options: {
        help: "Processes Gesner and saves to DB.",
        action: "store_true",
      },
    },
    {
      short: "-b_forc",
      long: "--build_forcellini",
      options: {
        help: "Processes Forcellini and saves to DB.",
        action: "store_true",
      },
    },
    {
      short: "-b_sh",
      long: "--build_sh",
      options: { help: "Processes SH and saves to DB.", action: "store_true" },
    },
    {
      short: "-b_ll",
      long: "--build_latin_library",
      options: {
        help: "Processing and stores the Latin library contents.",
        action: "store_true",
      },
    },
    {
      short: "-b_gaf",
      long: "--build_gaffiot",
      options: {
        help: "Processes Gaffiot and saves to DB.",
        action: "store_true",
      },
    },
    {
      short: "-b_corp",
      long: "--build_corpus",
      options: {
        help: "Builds the Latin corpus (implies `--build_latin_library`).",
        action: "store_true",
      },
    },
  ];
  build.add_argument("--build_all", {
    help: "Builds all artifacts.",
    action: "store_true",
  });
  build.add_argument("-to", "--transpile_only", {
    help: "Skips type checking for the bundle.",
    action: "store_true",
  });
  build.add_argument("-mot", "--morceus_tables", {
    help: "Builds Morceus tables and saves to disk.",
    action: "store_true",
  });
  addArguments(build, COMMON_BUILD_ARGS);

  const bundle = subparsers.add_parser(BUNDLE, {
    help: "Builds the UI V2 client assets into build/client/.",
  });
  bundle.add_argument("-m", "--minify", {
    help: "Minifies (and precompresses) the assets, as production does.",
    action: "store_true",
  });

  const web = subparsers.add_parser(WEB_SERVER, {
    help: "Builds artifacts and starts the web server.",
  });
  web.add_argument("--build_all", {
    help: "Builds all artifacts.",
    action: "store_true",
  });
  web.add_argument("-mot", "--morceus_tables", {
    help: "Builds Morceus tables and saves to disk.",
    action: "store_true",
  });
  addArguments(web, COMMON_BUILD_ARGS);
  web.add_argument("-r_db", "--real_database", {
    help: "Uses the real telemetry database.",
    action: "store_true",
  });
  web.add_argument("-to", "--transpile_only", {
    help: "Skips type checking for the server.",
    action: "store_true",
  });

  const worker = subparsers.add_parser(WORKER, {
    help: "Starts a worker process.",
  });
  worker.add_argument("--staging", {
    help: "Connects to the staging (`dev.morcus.net`) instance.",
    action: "store_true",
  });
  worker.add_argument("-p", "--prod", {
    help: "Connects to the production (`morcus.net`) instance.",
    action: "store_true",
  });
  worker.add_argument("-k", "--keep", {
    help: "Keeps the worker on disconnect.",
    action: "store_true",
  });
  worker.add_argument("--gpu", {
    help: "Allows GPU acceleration.",
    action: "store_true",
  });
  worker.add_argument("-wt", "--workerType", {
    help: "The worker type to start.",
    choices: ["mac", "ls"],
  });
  worker.add_argument("-to", "--transpile_only", {
    help: "Skips type checking for the worker.",
    action: "store_true",
  });

  const editor = subparsers.add_parser(EDITOR, {
    help: "Starts the LS web editor.",
  });

  const e2e = subparsers.add_parser(E2E, {
    help:
      "Runs the E2E suites (src/integration/suites/) against the running dev " +
      "server, or the visual regression suite with --visual.",
  });
  e2e.add_argument("--docker", {
    help:
      "Runs against a production Docker image instead of the dev server, as " +
      "CI does. Builds the image first unless --rerun is set.",
    action: "store_true",
  });
  e2e.add_argument("-r", "--rerun", {
    help: "With --docker: reuses an existing image instead of building one.",
    action: "store_true",
  });
  e2e.add_argument("-t", "--tag", {
    help: "With --docker: the image tag to build or reuse (default: itests).",
  });
  e2e.add_argument("-p", "--project", {
    help: "Comma-separated browser projects to run (overrides --all).",
    default: "",
  });
  e2e.add_argument("-g", "--grep", {
    help: "The grep pattern to use to limit tests by name.",
    default: "",
  });
  e2e.add_argument("-vs", "--visual", {
    help: "Runs UI V2 visual regression tests (src/integration/screenshot/browser_screenshot.test.ts).",
    action: "store_true",
  });
  e2e.add_argument("-a", "--all", {
    help: "Runs across all browser projects.",
    action: "store_true",
  });
  e2e.add_argument("-u", "--update", {
    help:
      "Updates screenshot baselines when running visual tests (requires --all with --visual). " +
      "Changed baselines go to the gitignored local store (.visual-baselines/local), " +
      "not the committed snapshot directory; see `visual-baselines`.",
    action: "store_true",
  });
  e2e.add_argument("-pt", "--port", {
    help: "The port of the running dev server (default: $PORT, or 5757).",
    default: "",
  });
  e2e.add_argument("--headed", {
    help: "Runs Playwright tests in headed browser mode.",
    action: "store_true",
  });
  e2e.add_argument("--diff", {
    help:
      "With --visual: open the Visual Diff Inspector afterwards. Without --update " +
      "it shows Playwright's failures (expected vs actual); with --update it " +
      "shows the local baselines against the committed checkpoint.",
    action: "store_true",
  });

  const visualDiff = subparsers.add_parser(VISUAL_DIFF, {
    aliases: ["diff"],
    help: "Interactive viewer for screenshot baseline changes (flip, split, diff mask).",
  });
  visualDiff.add_argument("-s", "--source", {
    help:
      "Where to find changes: 'git' (committed baselines vs --ref), 'results' " +
      "(Playwright failures in test-results/), 'local' (local baselines vs the " +
      "committed checkpoint), or 'auto' (git, then results, then local). Default: auto.",
    choices: ["auto", "git", "results", "local"],
    default: "auto",
  });
  visualDiff.add_argument("-r", "--ref", {
    help: "Git ref to compare against for the git source (default: HEAD).",
    default: "HEAD",
  });
  visualDiff.add_argument("-d", "--dir", {
    help: "Snapshot directory for the git source (default: src/integration/screenshot/browser_screenshot.test.ts-snapshots).",
    default: "",
  });
  visualDiff.add_argument("--results-dir", {
    help: "Playwright output directory for the results source (default: test-results).",
    default: "",
  });
  visualDiff.add_argument("-o", "--out", {
    help: "Output directory for diff artifacts and the viewer (default: .cache/visual-diff).",
    default: "",
  });
  visualDiff.add_argument("-p", "--port", {
    help: "Port to serve the viewer on; the next free port is used if taken (default: 8899).",
    type: "int",
  });
  visualDiff.add_argument("--host", {
    help: "Interface to bind the viewer to. Use 127.0.0.1 to restrict access to this machine (default: 0.0.0.0, all interfaces).",
    default: "",
  });
  visualDiff.add_argument("--no-server", {
    help: "Only write the viewer and report; do not start a server.",
    action: "store_true",
  });
  visualDiff.add_argument("--open", {
    help: "Open the viewer in the default browser.",
    action: "store_true",
  });
  visualDiff.add_argument("--report", {
    help: "Also write the markdown report to this path.",
    default: "",
  });

  const visualBaselines = subparsers.add_parser(VISUAL_BASELINES, {
    help:
      "Manages local screenshot baselines: the gitignored overlay " +
      "(.visual-baselines/local) on top of the committed checkpoint.",
  });
  visualBaselines.add_argument("action", {
    help:
      "'status': list local baselines (active and stale). " +
      "'checkpoint': copy active local baselines into the committed snapshot " +
      "directory and remove them from the store (needs human approval; does not commit). " +
      "'drop': discard local baselines (names, --stale, or --all).",
    choices: ["status", "checkpoint", "drop"],
  });
  visualBaselines.add_argument("names", {
    help: "Snapshot file names to act on (default for checkpoint: all active).",
    nargs: "*",
  });
  visualBaselines.add_argument("--stale", {
    help: "With drop: discard every stale (and missing) local baseline.",
    action: "store_true",
  });
  visualBaselines.add_argument("--all", {
    help: "With drop: discard every local baseline.",
    action: "store_true",
  });

  const corpus = subparsers.add_parser(CORPUS, {
    help: "Convenience commands for the corpus.",
  });
  corpus.add_argument("-r", "--rust", {
    help: "Runs the Rust CLI.",
    action: "store_true",
  });
  corpus.add_argument("-b", "--build", {
    help: "Builds the corpus.",
    action: "store_true",
  });
  corpus.add_argument("-s", "--simulate_large", {
    help: "Simulates a large corpus when building.",
    action: "store_true",
  });
  corpus.add_argument("-q", "--query", {
    help: "The query to run on the corpus.",
    default: "@lemma:do oscula @case:dat",
  });
  corpus.add_argument("-l", "--limit", {
    help: "The maximum number of results to return.",
    default: "50",
  });
  corpus.add_argument("-c", "--context", {
    help: "The context length to use for the query.",
    default: "10",
  });

  const inventory = subparsers.add_parser(INVENTORY, {
    help: "Runs the UI V2 cross-slice inventory and exact ratchet check.",
  });
  inventory.add_argument("-u", "--update", {
    help: "Rewrites src/web/ui/inventory_ratchet.json from the current metrics.",
    action: "store_true",
  });
  inventory.add_argument("-r", "--report", {
    help: "Overrides the markdown report location (default: .cache/inventory/report.md).",
    default: "",
  });

  const test = subparsers.add_parser(TEST, {
    help:
      "Runs TypeScript unit tests. By default, runs the `unit` tests related to " +
      "files changed since HEAD (including uncommitted and untracked files), " +
      "skipping the slow whole-system suites. Run `--whole-system` once before committing.",
  });
  test.add_argument("paths", {
    help: "Runs the `unit` tests related to these files instead of to the changes since HEAD.",
    nargs: "*",
  });
  const testScope = test.add_mutually_exclusive_group();
  testScope.add_argument("-w", "--whole-system", {
    help: "Runs only the whole-system suites (*_conformance, inventory_ratchet).",
    action: "store_true",
  });
  testScope.add_argument("-a", "--all", {
    help: "Runs every TypeScript test: both the `unit` and whole-system projects.",
    action: "store_true",
  });

  const upstream = subparsers.add_parser(UPSTREAM, {
    help:
      "Manages the pinned upstream data repos (upstream_sources.lock.json) " +
      "and their local clones. See src/scripts/upstream/README.md.",
  });
  upstream.add_argument("action", {
    help:
      "'status': how each local clone compares to its pin (offline). " +
      "'sync': move clones to their pins, leaving any local work alone. " +
      "'pin': re-pin sources, as `<source>[@<branch|tag|sha>]` (default: the tracked branch). " +
      "'tag': push missing morcus-pin/<sha> tags for the current pins. " +
      "'verify': check every pin is tagged on its repo (what CI runs).",
    choices: UPSTREAM_ACTIONS,
  });
  upstream.add_argument("targets", {
    help: "Sources to act on (default: all, except for 'pin').",
    nargs: "*",
  });
  upstream.add_argument("--allow-drop", {
    help: "With pin: allow a new pin that lacks changes the current pin has.",
    action: "store_true",
  });
  upstream.add_argument("-y", "--yes", {
    help: "With pin: don't ask before pinning more than a few new commits.",
    action: "store_true",
  });
  upstream.add_argument("--dry-run", {
    help: "With pin or tag: check everything, but push nothing and leave the lock file alone.",
    action: "store_true",
  });
  upstream.add_argument("--all", {
    help: "With pin: pin every source to its tracked branch.",
    action: "store_true",
  });

  for (const subcommand of [
    editor,
    worker,
    bundle,
    web,
    build,
    e2e,
    corpus,
    visualDiff,
    visualBaselines,
    inventory,
    test,
    upstream,
  ]) {
    subcommand.add_argument("--bun", {
      help: "Runs supported commands with bun.",
      action: "store_true",
    });
    subcommand.add_argument("--node", {
      help: "Runs supported commands with node.",
      action: "store_true",
    });
  }

  return parser.parse_args();
}

function registerCleanup() {
  const cleanup = () => {
    while (cleanupOperations.length > 0) {
      cleanupOperations.pop()!();
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("uncaughtException", (err) => {
    cleanup();
    console.error(err);
    process.exit(1);
  });
  process.on("unhandledRejection", (err) => {
    cleanup();
    console.error(err);
    process.exit(1);
  });
}

function startWorker(args: any, workerType: string): Promise<void> {
  const childEnv = { ...process.env };
  childEnv.NODE_ENV = "production";

  let socketAddress = `http://localhost:${childEnv.PORT}`;
  if (args.prod === true) {
    socketAddress = `https://www.morcus.net`;
  }
  if (args.staging === true) {
    socketAddress = `https://dev.morcus.net`;
  }
  childEnv.SOCKET_ADDRESS = socketAddress;
  let workerFile = "";
  if (workerType === "mac") {
    workerFile = "src/web/workers/macronizer_processor.ts";
  }
  if (workerType === "ls") {
    workerFile = "src/web/workers/ls_worker.ts";
    if (args.ls_subset) {
      childEnv.LS_PATH = "testdata/ls/subset.xml";
    }
  }
  if (args.gpu === true) {
    childEnv.ALLOW_WORKERS_GPU = "true";
  }
  if (args.keep === true || args.prod === true) {
    childEnv.KEEP_WORKERS_ON_DISCONNECT = "true";
  }

  const child = spawnChild([...TS_NODE, workerFile], childEnv);

  cleanupOperations.push(() => {
    console.log(`[run script] Cleaning up ${workerType}`);
    child.kill();
  });

  return processComplete(child);
}

function processComplete(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    child.on("close", resolve);
  });
}

async function awaitAll(workers: Promise<void>[]) {
  for (const worker of workers) {
    await worker;
  }
}

function spawnChild(command: string[], env?: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(command[0], command.slice(1), {
    env: { NODE_ENV: "production", ...env },
    stdio: "inherit",
  });
  return child;
}

function buildBundle(args: any): Promise<boolean> {
  return runPipeline([
    { operation: writeCommitId, label: "writeCommitId" },
    v2BundleConfig(args, undefined, args.minify === true),
  ]);
}

function v2BundleConfig(
  args: any,
  priority?: number,
  minify: boolean = true
): StepConfig {
  const executor = args.bun ? ["bun"] : TS_NODE;
  const buildCommand = executor.concat([
    "src/bundler/client.rsbuild.ts",
    ...(minify ? ["--minify"] : []),
  ]);
  return {
    operation: () => shellStep(buildCommand.join(" ")),
    label: "Building UI V2 assets",
    priority,
  };
}

function artifactConfig(args: any): StepConfig[] {
  const setupSteps: StepConfig[] = [];
  const childEnv = { ...process.env };
  childEnv.NODE_ENV = "production";
  let baseCommand = [...TS_NODE];
  if (args.bun === true) {
    baseCommand = ["bun"];
  }

  // If build_all is set, enable all build flags
  if (args.build_all === true) {
    args.build_ls = true;
    args.build_ra = true;
    args.build_georges = true;
    args.build_pozo = true;
    args.build_gesner = true;
    args.build_forcellini = true;
    args.build_sh = true;
    args.build_corpus = true;
    args.build_gaffiot = true;
  }

  // If build_corpus is set, enable build_latin_library
  if (args.build_corpus === true) {
    args.build_latin_library = true;
  }

  if (args.morceus_tables === true) {
    setupSteps.push({
      operation: MorceusTables.save,
      label: "Saving Morceus tables",
      priority: 2,
    });
  }
  if (args.build_sh === true) {
    const command = baseCommand.concat(["src/scripts/process_sh.ts"]);
    setupSteps.push({
      operation: () => shellStep(command.join(" ")),
      label: "Processing SH",
      priority: 2,
    });
  }
  if (args.build_ra === true) {
    const command = baseCommand.concat(["src/scripts/process_ra.ts"]);
    setupSteps.push({
      operation: () => shellStep(command.join(" "), childEnv),
      label: "Processing RA",
      priority: 2,
    });
  }
  if (args.build_georges === true) {
    const command = baseCommand.concat(["src/scripts/process_grg.ts"]);
    setupSteps.push({
      operation: () => shellStep(command.join(" "), childEnv),
      label: "Processing Georges",
      priority: 2,
    });
  }
  if (args.build_pozo === true) {
    const command = baseCommand.concat(["src/scripts/process_pozo.ts"]);
    setupSteps.push({
      operation: () => shellStep(command.join(" "), childEnv),
      label: "Processing Pozo",
      priority: 2,
    });
  }
  if (args.build_gesner === true) {
    const command = baseCommand.concat([
      "src/scripts/process_gesner_script.ts",
    ]);
    setupSteps.push({
      operation: () => shellStep(command.join(" "), childEnv),
      label: "Processing Gesner",
      priority: 2,
    });
  }
  if (args.build_forcellini === true) {
    const command = baseCommand.concat([
      "src/scripts/process_forcellini_script.ts",
    ]);
    setupSteps.push({
      operation: () => shellStep(command.join(" "), childEnv),
      label: "Processing Forcellini",
      priority: 2,
    });
  }
  if (args.build_ls === true) {
    const command = baseCommand.concat(["src/scripts/process_ls.ts"]);
    setupSteps.push({
      operation: () => shellStep(command.join(" "), childEnv),
      label: "Processing LS",
      priority: 2,
    });
  }
  if (args.build_gaffiot === true) {
    const command = baseCommand.concat(["src/scripts/process_gaf_cli.ts"]);
    setupSteps.push({
      operation: () => shellStep(command.join(" "), childEnv),
      label: "Processing Gaffiot",
      priority: 2,
    });
  }
  if (
    args.build_sh === true ||
    args.build_ra === true ||
    args.build_georges === true ||
    args.build_pozo === true ||
    args.build_gesner === true ||
    args.build_forcellini === true ||
    args.build_ls === true ||
    args.build_gaffiot === true
  ) {
    setupSteps.push({
      operation: () => buildCompletionsDb(),
      label: "Building dictionary completions DB",
      priority: 3,
    });
  }
  const DATA_FLAGS = [
    "build_sh",
    "build_ra",
    "build_georges",
    "build_pozo",
    "build_gesner",
    "build_forcellini",
    "build_ls",
    "build_gaffiot",
    "build_latin_library",
  ];
  if (DATA_FLAGS.some((flag) => args[flag] === true)) {
    warnOnUpstreamDrift();
  }
  if (args.build_latin_library === true) {
    if (args.build_corpus === true) {
      childEnv.BUILD_CORPUS = "1";
    }
    const command = baseCommand.concat(["src/scripts/process_lat_lib.ts"]);
    setupSteps.push({
      operation: () => shellStep(command.join(" "), childEnv),
      label: "Building Latin library",
      // This needs to be done after saving the morceus tables,
      // because the Rust corpus implementation needs them.
      priority: 3,
    });
  }
  return setupSteps;
}

function buildArtifacts(args: any): Promise<boolean> {
  return runPipeline([v2BundleConfig(args, 1), ...artifactConfig(args)], {
    parallel: true,
  });
}

async function setupAndStartWebServer(args: any) {
  const setupSteps: StepConfig[] = [];
  writeCommitId();
  setupSteps.push(v2BundleConfig(args, 1));
  setupSteps.push(...artifactConfig(args));
  const setupSuccess = await runPipeline(setupSteps, { parallel: true });
  if (!setupSuccess) {
    return false;
  }
  startWebServer(args);
  return true;
}

function startWebServer(args: any) {
  const serverEnv = { ...process.env };
  serverEnv.NODE_ENV = "production";
  // Each restart gets a fresh build version, so the browser never keeps
  // `?v=` responses from before a server-side change.
  serverEnv[DEV_SERVER_ENV] = "1";
  if (args.real_database === false) {
    serverEnv.CONSOLE_TELEMETRY = "yes";
  }
  // Local dev has no LatinCy server; simulate macronizer suggestions unless
  // the caller chose an engine. Production runs `build/server.js` directly.
  if (!serverEnv.MACRONIZER_ENGINE) {
    serverEnv.MACRONIZER_ENGINE = "fake-latincy";
  }
  let baseCommand: string[] = [...TS_NODE];
  if (args.bun === true) {
    baseCommand = ["bun"];
  } else if (args.transpile_only === true) {
    baseCommand.push("--swc");
  }
  serverEnv.MAIN = "start";
  baseCommand.push("src/start_server.ts");
  runCommand(baseCommand.join(" "), serverEnv).catch(console.log);
}

async function startLsEditor() {
  const editorRoot = "src/common/lewis_and_short/editor";
  const steps: StepConfig[] = [
    {
      operation: () =>
        shellStep(`${TS_NODE.join(" ")} ${editorRoot}/editor.esbuild.ts`),
      label: "Building bundle",
    },
  ];
  assert(await runPipeline(steps));
  void runCommand(`${TS_NODE.join(" ")} ${editorRoot}/ls_interactive.ts`);
}

async function runE2eTests(args: any) {
  const childEnv = { ...process.env };
  const steps: StepConfig[] = [];
  const isVisual = Boolean(args.visual);
  // Without CI set, Playwright's HTML reporter opens and serves the report
  // after any failure, blocking until killed. Keep it on disk instead.
  childEnv.PLAYWRIGHT_HTML_OPEN = "never";

  if (args.update && !(isVisual && args.all)) {
    throw new Error(
      "Refusing to update visual snapshots without `--visual --all`.\n" +
        "Updating snapshots through the fast Chromium/MobileChrome path leaves the\n" +
        "other projects' baselines stale, causing matrix drift.\n\n" +
        "Please run: ./morcus.sh e2e --visual --all --update"
    );
  }
  if (!args.docker && (args.rerun || args.tag !== undefined)) {
    throw new Error("--rerun and --tag only apply with --docker.");
  }

  if (args.docker) {
    const tag = args.tag ?? "itests";
    if (!args.rerun) {
      const fullTag = `ghcr.io/nkprasad12/morcus:${tag}`;
      steps.push({
        operation: () => shellStep(`docker build . -t ${fullTag}`),
        label: `Building docker image ${fullTag}`,
      });
    }
    childEnv.IMAGE_TAG = tag;
  } else {
    childEnv.REUSE_DEV_SERVER = "1";
    childEnv.PORT = args.port || process.env.PORT || "5757";
  }

  const baselines = isVisual
    ? await import("@/scripts/visual_diff/local_baselines")
    : undefined;
  if (baselines !== undefined) {
    // Compare against the committed checkpoint overlaid with local baselines.
    const paths = baselines.defaultPaths();
    const resolution = baselines.materializeEffective(paths);
    childEnv[baselines.BASELINES_ENV] = paths.effectiveDir;
    const summary = baselines.resolutionSummary(resolution);
    if (summary !== undefined) {
      console.log(`Visual baselines: ${summary}`);
    }
  }

  const testPath = isVisual
    ? "src/integration/screenshot/browser_screenshot.test.ts"
    : "src/integration/suites/";
  const command = ["npx playwright test", testPath];

  if (args.project) {
    for (const proj of args.project.split(",")) {
      if (proj.trim()) {
        command.push(`--project=${proj.trim()}`);
      }
    }
  } else if (args.all) {
    command.push(
      "--project=chromium --project=MobileChrome --project=firefox --project=FirefoxSmallScreen --project=webkit --project=MobileSafari"
    );
  } else {
    command.push("--project=chromium --project=MobileChrome");
  }

  if (args.grep) {
    command.push(`--grep "${args.grep}"`);
  }
  if (args.update) {
    command.push("--update-snapshots");
  }
  if (args.headed) {
    command.push("--headed");
  }

  steps.push({
    operation: async () => {
      let testError: unknown = undefined;
      try {
        await shellStep(command.join(" "), childEnv);
      } catch (err) {
        testError = err;
      }
      if (baselines !== undefined && args.update) {
        // Playwright rewrote the effective directory; keep what differs from
        // the checkpoint in the local store. The checkpoint is not touched.
        const accepted = baselines.acceptFromEffective(
          baselines.defaultPaths()
        );
        console.log(
          `\nLocal baselines: ${accepted.added.length} added, ` +
            `${accepted.updated.length} updated, ${accepted.reverted.length} ` +
            "reverted to the checkpoint."
        );
      }
      if (isVisual && args.diff) {
        // Without --update, Playwright leaves expected/actual pairs for each
        // failure in test-results/. With --update, the new baselines are in
        // the local store, so compare them against the checkpoint.
        const serving = await runVisualDiffCommand({
          source: args.update ? "local" : "results",
        });
        if (testError !== undefined && serving) {
          // Throwing here would end the process and take the viewer down
          // with it; record the failure in the exit code instead.
          process.exitCode = 1;
          console.log(
            "Visual tests failed; review the failures in the inspector above."
          );
          return;
        }
      } else if (isVisual && args.update) {
        console.log(
          "\nRun `./morcus.sh visual-diff --source local` to review the local baselines " +
            "against the checkpoint."
        );
      } else if (isVisual && testError !== undefined) {
        console.log(
          "\nRun `./morcus.sh visual-diff --source results` to inspect the failures."
        );
      } else if (testError !== undefined) {
        console.log(
          "\nRun `npx playwright show-report` to open the HTML report."
        );
      }
      if (testError !== undefined) {
        throw testError;
      }
    },
    label: isVisual ? "Running visual regression tests" : "Running E2E tests",
  });
  return runPipeline(steps);
}

async function runCorpusCommand(args: any) {
  const command = args.rust
    ? ["cargo", "run", "--package", "corpus", "--release", "cli"]
    : args.bun
    ? ["bun"]
    : [...TS_NODE];
  if (!args.rust) {
    command.push("src/common/library/corpus/corpus_driver.ts");
  }
  if (args.rust) {
    command.push(`--query`);
  }
  command.push(`'${args.query}'`);
  if (args.rust) {
    if (args.limit) {
      command.push(`--limit ${args.limit}`);
    }
    if (args.context) {
      command.push(`--context ${args.context}`);
    }
  } else {
    command.push(args.limit ? args.limit : "50");
    command.push(args.context ? args.context : "20");
  }

  const childEnv = { ...process.env };
  childEnv.NODE_ENV = "production";
  const steps: StepConfig[] = [];
  if (args.build) {
    childEnv.BUILD_CORPUS = "1";
  }
  if (args.simulate_large) {
    childEnv.SIMULATE_LARGE_CORPUS = "1";
  }
  steps.push({
    operation: () => shellStep(command.join(" "), childEnv),
    label: "Building corpus",
  });
  return runPipeline(steps);
}

/**
 * Runs the Visual Diff Inspector. Returns true iff a viewer server was
 * started (and is keeping the process alive). Throws on failure.
 */
async function runVisualDiffCommand(args: any): Promise<boolean> {
  const { runVisualDiffInspector } = await import(
    "@/scripts/visual_diff/visual_diff"
  );
  const result = await runVisualDiffInspector({
    source: args.source || "auto",
    ref: args.ref || undefined,
    snapshotDir: args.dir || undefined,
    resultsDir: args.results_dir || undefined,
    outDir: args.out || undefined,
    port: args.port || undefined,
    host: args.host || undefined,
    startServer: !args.no_server,
    openBrowser: Boolean(args.open),
    reportPath: args.report || undefined,
  });
  return result.server !== undefined;
}

async function runVisualDiff(args: any): Promise<boolean> {
  try {
    await runVisualDiffCommand(args);
    return true;
  } catch (err) {
    console.error("Visual diff inspection failed:", err);
    return false;
  }
}

async function runVisualBaselines(args: any): Promise<boolean> {
  const baselines = await import("@/scripts/visual_diff/local_baselines");
  const paths = baselines.defaultPaths();
  const names: string[] = args.names ?? [];
  try {
    if (args.action === "status") {
      console.log(baselines.statusReport(paths));
    } else if (args.action === "checkpoint") {
      const { promoted, skippedStale } = baselines.checkpoint(
        paths,
        names.length > 0 ? names : undefined
      );
      console.log(
        `Copied ${promoted.length} local baseline(s) into ${path.relative(
          process.cwd(),
          paths.snapshotDir
        )}:`
      );
      for (const n of promoted) console.log(`  ${n}`);
      if (skippedStale.length > 0) {
        console.warn(
          `Skipped ${skippedStale.length} stale local baseline(s); see \`visual-baselines status\`.`
        );
      }
      if (promoted.length > 0) {
        console.log(
          "\nNothing was staged. Review with `./morcus.sh visual-diff --source git`, " +
            "and commit only with explicit human approval (AGENTS.md)."
        );
      }
    } else {
      if (names.length === 0 && !args.stale && !args.all) {
        throw new Error("drop needs snapshot names, --stale, or --all.");
      }
      const dropped = baselines.drop(paths, {
        names,
        stale: Boolean(args.stale),
        all: Boolean(args.all),
      });
      console.log(`Dropped ${dropped.length} local baseline(s).`);
      for (const n of dropped) console.log(`  ${n}`);
    }
    return true;
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return false;
  }
}

async function runInventory(args: any): Promise<boolean> {
  const { runInventoryCli } = await import(
    "@/web/ui/tools/inventory/inventory"
  );
  return runInventoryCli({
    update: Boolean(args.update),
    reportPath: args.report || undefined,
  });
}

/**
 * Runs Jest for one of the tiers in `jest.config.js`. Returns whether the
 * tests passed.
 *
 * By default, runs the `unit` tests related to the files changed since HEAD.
 * That's safe because every commit is expected to have passed both tiers.
 */
async function runTests(args: any): Promise<boolean> {
  const paths: string[] = args.paths ?? [];
  const wholeSystem = Boolean(args.whole_system);
  const all = Boolean(args.all);
  if (paths.length > 0 && (wholeSystem || all)) {
    console.error(
      "`--whole-system` and `--all` run a whole tier; they don't take paths."
    );
    return false;
  }

  const jestArgs: string[] = [];
  const related = !wholeSystem && !all;
  if (wholeSystem) {
    jestArgs.push("--selectProjects", "whole-system");
  } else if (related) {
    jestArgs.push("--selectProjects", "unit");
    if (paths.length > 0) {
      // Last, since it takes every remaining argument.
      jestArgs.push("--findRelatedTests", ...paths);
    } else {
      const status = execSync("git status --porcelain", { encoding: "utf8" });
      if (status.trim() === "") {
        console.log(
          "No changes since HEAD, so no related tests to run. Pass paths, " +
            "`--whole-system`, or `--all` to choose tests explicitly."
        );
        return true;
      }
      jestArgs.push("--onlyChanged");
    }
  }

  const jest = ["node", "--no-deprecation", "node_modules/.bin/jest"];
  // morcus.sh exports NODE_ENV=production; Jest only defaults it to `test`
  // when it's unset.
  const env = { ...process.env, NODE_ENV: "test" };
  if (related) {
    // Changes Jest can't trace through imports (docs, CSS, JSON) select no
    // tests. Say so, rather than report a pass that covered nothing.
    const listed = execFileSync(
      jest[0],
      [...jest.slice(1), "--listTests", ...jestArgs],
      { encoding: "utf8", env }
    );
    if (!listed.split("\n").some((line) => line.trim().startsWith("/"))) {
      console.log(
        "No unit tests import the changed files, so nothing ran. If you " +
          "changed files that tests read from disk (CSS, JSON), run " +
          "`./morcus.sh test --whole-system`."
      );
      return true;
    }
  }

  const command = [...jest, ...jestArgs];
  console.log(`Executing: '${command.join(" ")}'`);
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      stdio: "inherit",
      env,
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code));
  });
  const passed = exitCode === 0;
  if (passed && related) {
    console.log(
      "\nRelated unit tests passed. Before committing, also run " +
        "`./morcus.sh test --whole-system`."
    );
  }
  return passed;
}

function runUpstream(args: any): Promise<boolean> {
  return runUpstreamCli({
    action: args.action,
    targets: args.targets ?? [],
    allowDrop: Boolean(args.allow_drop),
    yes: Boolean(args.yes),
    dryRun: Boolean(args.dry_run),
    all: Boolean(args.all),
  });
}
