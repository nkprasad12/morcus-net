/* istanbul ignore file */

import { assert } from "@/common/assert";
import { envVar } from "@/common/env_vars";
import { MorceusTables } from "@/morceus/cruncher_tables";
import {
  StepConfig,
  runCommand,
  runPipeline,
  shellStep,
} from "@/scripts/script_utils";
import { writeCommitId } from "@/scripts/write_source_version";
import { createDir } from "@/utils/file_utils";
import { ArgumentParser } from "argparse";
import { ChildProcess, spawn } from "child_process";

const WEB_SERVER = "web";
const WORKER = "worker";
const EDITOR = "editor";
const BUNDLE = "bundle";
const BUILD = "build";

const cleanupOperations: (() => unknown)[] = [];

registerCleanup();
const args = parseArguments();
if (args.command === WEB_SERVER) {
  setupAndStartWebServer(args).then((success) => assert(success));
} else if (args.command === WORKER) {
  awaitAll([startWorker(args, args.workerType)]);
} else if (args.command === EDITOR) {
  startLsEditor();
} else if (args.command === BUNDLE) {
  buildBundle(args).then(assert);
} else if (args.command === BUILD) {
  buildArtifacts(args).then(assert);
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
  build.add_argument("-to", "--transpile_only", {
    help: "Skips type checking for the bundle.",
    action: "store_true",
  });
  build.add_argument("-mot", "--morceus_tables", {
    help: "Builds Morceus tables and saves to disk.",
    action: "store_true",
  });
  build.add_argument("-b_ls", "--build_ls", {
    help: "Re-processes LS.",
    action: "store_true",
  });
  build.add_argument("-b_sh", "--build_sh", {
    help: "Re-processes SH and saves to DB.",
    action: "store_true",
  });
  build.add_argument("-b_li", "--build_latin_inflections", {
    help: "Re-processes Latin Inflections and saves to DB.",
    action: "store_true",
  });
  build.add_argument("-b_ll", "--build_latin_library", {
    help: "Processing and stores the Latin library contents.",
    action: "store_true",
  });

  const bundle = subparsers.add_parser(BUNDLE, {
    help: "Builds the client bundle.",
  });
  bundle.add_argument("-a", "--analyze", {
    help: "Runs analysis on the generated bundle.",
    action: "store_true",
  });
  bundle.add_argument("-to", "--transpile_only", {
    help: "Skips type checking for the bundle.",
    action: "store_true",
  });
  bundle.add_argument("-p", "--prod", {
    help: "Builds a minimized bundle.",
    action: "store_true",
  });
  bundle.add_argument("-c", "--compress", {
    help: "Builds a gzipped bundle.",
    action: "store_true",
  });

  const web = subparsers.add_parser(WEB_SERVER, {
    help: "Builds artifacts and starts the web server.",
  });
  web.add_argument("-no_bc", "--no_build_client", {
    help: "The client bundle will not be built.",
    action: "store_true",
  });
  web.add_argument("-mot", "--morceus_tables", {
    help: "Builds Morceus tables and saves to disk.",
    action: "store_true",
  });
  web.add_argument("-b_ls", "--build_ls", {
    help: "Re-processes LS.",
    action: "store_true",
  });
  web.add_argument("-b_sh", "--build_sh", {
    help: "Re-processes SH and saves to DB.",
    action: "store_true",
  });
  web.add_argument("-b_li", "--build_latin_inflections", {
    help: "Re-processes Latin Inflections and saves to DB.",
    action: "store_true",
  });
  web.add_argument("-b_ll", "--build_latin_library", {
    help: "Processing and stores the Latin library contents.",
    action: "store_true",
  });
  web.add_argument("-r_db", "--real_database", {
    help: "Uses the real telemetry database.",
    action: "store_true",
  });
  web.add_argument("-w", "--watch", {
    help: "Runs a dev server for local iteration.",
    action: "store_true",
  });
  web.add_argument("-p", "--prod", {
    help: "Runs setup suitable for production.",
    action: "store_true",
  });
  web.add_argument("-to", "--transpile_only", {
    help: "Skips type checking for the client and server.",
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

  for (const subcommand of [editor, worker, bundle, web, build]) {
    subcommand.add_argument("--bun", {
      help: "Runs supported commands with bun.",
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
  process.on("SIGINT", cleanup);
  process.on("uncaughtException", cleanup);
}

function startWorker(args: any, workerType: string): Promise<void> {
  const childEnv = { ...process.env };

  let socketAddress = `http://localhost:${childEnv.PORT}`;
  if (args.prod === true) {
    socketAddress = `https://www.morcus.net`;
    childEnv.NODE_ENV = "production";
  }
  if (args.staging === true) {
    socketAddress = `https://dev.morcus.net`;
    childEnv.NODE_ENV = "production";
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

  const child = spawnChild(["npm", "run", "ts-node", workerFile], childEnv);

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
    env: env,
    stdio: "inherit",
  });
  return child;
}

function buildBundle(args: any): Promise<boolean> {
  return runPipeline([
    { operation: writeCommitId, label: "writeCommitId" },
    bundleConfig(args),
  ]);
}

function bundleConfig(args: any, priority?: number): StepConfig {
  const executor = args.bun ? ["bun"] : ["npm", "run", "ts-node"];
  const buildCommand = executor.concat(["src/esbuild/morcus-net.esbuild.ts"]);
  const childEnv = { ...process.env };
  if (args.prod || args.staging) {
    childEnv.NODE_ENV = "production";
  }
  if (args.watch) {
    childEnv.WATCH = "1";
  }
  if (args.analyze) {
    childEnv.ANALYZE_BUNDLE = "1";
  }
  if (args.compress) {
    childEnv.COMPRESS = "1";
  }
  if (!args.transpile_only) {
    childEnv.RUN_TSC = "1";
  }
  return {
    operation: () => shellStep(buildCommand.join(" "), childEnv),
    label: "Building bundle",
    priority,
  };
}

function artifactConfig(args: any): StepConfig[] {
  const setupSteps: StepConfig[] = [];
  const childEnv = { ...process.env };
  let baseCommand = ["npm", "run", "tsnp"];
  if (args.bun === true) {
    baseCommand = ["bun"];
    childEnv.BUN = "1";
  }
  setupSteps.push({
    operation: () => createDir(envVar("OFFLINE_DATA_DIR")),
    label: "Creating output dirs",
    priority: 1,
  });
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
  if (args.build_ls === true) {
    const command = baseCommand.concat(["src/scripts/process_ls.ts"]);
    setupSteps.push({
      operation: () => shellStep(command.join(" "), childEnv),
      label: "Processing LS",
      priority: 2,
    });
  }
  if (args.build_latin_library === true) {
    const command = baseCommand.concat(["src/scripts/process_lat_lib.ts"]);
    setupSteps.push({
      operation: () => shellStep(command.join(" "), childEnv),
      label: "Building Latin library",
      priority: 2,
    });
  }
  return setupSteps;
}

function buildArtifacts(args: any): Promise<boolean> {
  return runPipeline(artifactConfig(args), { parallel: true });
}

async function setupAndStartWebServer(args: any) {
  const setupSteps: StepConfig[] = [];
  if (args.no_build_client === false) {
    writeCommitId();
    if (args.watch !== true) {
      setupSteps.push(bundleConfig(args, 1));
    }
  }
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
  if (args.prod === true) {
    serverEnv.NODE_ENV = "production";
  }
  if (args.watch) {
    bundleConfig(args).operation();
  }
  if (args.real_database === false) {
    serverEnv.CONSOLE_TELEMETRY = "yes";
  }
  let baseCommand: string[] = ["npm", "run", "ts-node"];
  if (args.bun === true) {
    baseCommand = ["bun"];
    serverEnv.BUN = "1";
    if (args.watch) {
      baseCommand.push("--watch");
    }
  } else if (args.transpile_only === true) {
    baseCommand.push("--", "--transpile-only");
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
        shellStep(`npm run tsnp ${editorRoot}/editor.esbuild.ts`),
      label: "Building bundle",
    },
  ];
  assert(await runPipeline(steps));
  runCommand(`npm run ts-node ${editorRoot}/ls_interactive.ts`);
}
