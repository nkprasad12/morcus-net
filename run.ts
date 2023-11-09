/* istanbul ignore file */

import { ArgumentParser } from "argparse";
import { ChildProcess, spawn } from "child_process";
import dotenv from "dotenv";

dotenv.config();

const WEB_SERVER = "web";
const WORKER = "worker";
const COMMANDS = [WEB_SERVER, WORKER];

const cleanupOperations: (() => any)[] = [];

registerCleanup();
const args = parseArguments();
if (args.command === WEB_SERVER) {
  setupAndStartWebServer(args).then(() => console.log("Kicked off server!"));
} else if (args.command === WORKER) {
  awaitAll([startWorker(args, args.workerType)]);
}
// stayAlive();

// function stayAlive() {
//   setTimeout(stayAlive, 1000);
// }

function parseArguments() {
  const parser = new ArgumentParser({
    description: "Helper scripts to start the Morcus Latin Tools",
  });
  parser.add_argument("command", {
    help: "The high level command to run.",
    choices: COMMANDS,
  });
  parser.add_argument("-no_bc", "--no_build_client", {
    help: "If set, the client bundle will not be built.",
    action: "store_true",
  });
  parser.add_argument("-b_ls", "--build_ls", {
    help: "If set, re-processes LS.",
    action: "store_true",
  });
  parser.add_argument("-b_sh", "--build_sh", {
    help: "If set, re-processes SH and saves to DB.",
    action: "store_true",
  });
  parser.add_argument("-to", "--transpile_only", {
    help: "If set, skips type checking for the client and server.",
    action: "store_true",
  });
  parser.add_argument("-r_db", "--real_database", {
    help: "If set, uses the real telemetry database.",
    action: "store_true",
  });
  parser.add_argument("-p", "--prod", {
    help: "If set, runs setup suitable for production.",
    action: "store_true",
  });
  parser.add_argument("--staging", {
    help: "If set, runs setup suitable for staging.",
    action: "store_true",
  });
  parser.add_argument("--bun", {
    help: "If set, start the server using bun.",
    action: "store_true",
  });
  parser.add_argument("-k", "--keep", {
    help: "If set, keeps the worker on disconnect.",
    action: "store_true",
  });
  parser.add_argument("--gpu", {
    help: "If set, allows GPU acceleration.",
    action: "store_true",
  });
  parser.add_argument("-wt", "--workerType", {
    help: "The worker type to start.",
    choices: ["mac", "ls"],
  });
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
  const child = spawn(command[0], command.slice(1), { env: env });
  child.stdout.on("data", (data) => {
    const message: string = data.toString();
    console.log(message.replace(/\n$/, ""));
  });
  child.stderr.on("data", (data) => {
    const message: string = data.toString();
    console.log(message.replace(/\n$/, ""));
  });
  return child;
}

function setupAndStartWebServer(args: any) {
  const setupSteps: [string[], ChildProcess][] = [];

  if (args.no_build_client === false) {
    const buildCommand: string[] = ["npm", "run", "build-client"];
    const extraArgs: string[] = [];
    if (args.prod || args.staging) {
      extraArgs.push("--env", "production");
    }
    if (args.transpile_only) {
      extraArgs.push("--env", "transpileOnly");
    }
    if (extraArgs.length > 0) {
      buildCommand.push("--");
    }
    buildCommand.push(...extraArgs);
    setupSteps.push([buildCommand, spawnChild(buildCommand)]);
  }
  if (args.build_ls === true) {
    const command = ["npm", "run", "ts-node", "src/scripts/process_ls.ts"];
    setupSteps.push([command, spawnChild(command)]);
  }
  if (args.build_sh === true) {
    const command = ["npm", "run", "ts-node", "src/scripts/process_sh.ts"];
    setupSteps.push([command, spawnChild(command)]);
  }

  const setupPromises = setupSteps.map(async ([command, setupStep]) => {
    await processComplete(setupStep);
    console.log(`Setup process completed: "${command.join(" ")}"`);
    if (setupStep.exitCode !== 0) {
      throw new Error(`${command.join(" ")} failed.`);
    }
  });

  return Promise.all(setupPromises).then(() => setupStartWebServer(args));
}

async function setupStartWebServer(args: any) {
  const serverEnv = { ...process.env };
  if (args.prod === true) {
    serverEnv.NODE_ENV = "production";
  }
  if (args.real_database === false) {
    serverEnv.CONSOLE_TELEMETRY = "yes";
  }
  let baseCommand: string[] = ["npm", "run", "ts-node"];
  if (args.bun === true) {
    baseCommand = ["bun", "run"];
  } else if (args.transpile_only === true) {
    baseCommand.push("--", "--transpile-only");
  }
  baseCommand.push("src/start_server.ts");
  spawnChild(baseCommand, serverEnv);
}
