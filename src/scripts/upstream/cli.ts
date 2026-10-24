/** `./morcus.sh upstream <action>`; see README.md in this directory. */

import { spawnSync } from "child_process";
import chalk from "chalk";
import { printStatus, syncAll } from "@/scripts/upstream/clones";
import { readUpstreamLock } from "@/scripts/upstream/lock";
import { parsePinRequest, pinSources, tagPins } from "@/scripts/upstream/pin";

export const UPSTREAM_ACTIONS = ["status", "sync", "pin", "tag", "verify"];

export interface UpstreamCliArgs {
  action: string;
  targets: string[];
  allowDrop: boolean;
  yes: boolean;
  dryRun: boolean;
  all: boolean;
}

export async function runUpstreamCli(args: UpstreamCliArgs): Promise<boolean> {
  switch (args.action) {
    case "status":
      printStatus();
      return true;
    case "sync":
      return syncAll(args.targets);
    case "pin": {
      if (args.targets.length === 0 && !args.all) {
        console.log(
          chalk.red(
            "Name the sources to pin (`<source>[@<branch|tag|sha>]`), or pass --all to pin every source to its tracked branch."
          )
        );
        return false;
      }
      const targets =
        args.targets.length > 0
          ? args.targets
          : Object.keys(readUpstreamLock().sources);
      return pinSources(targets.map(parsePinRequest), {
        allowDrop: args.allowDrop,
        yes: args.yes,
        dryRun: args.dryRun,
      });
    }
    case "tag":
      return tagPins(args.targets, { dryRun: args.dryRun });
    case "verify":
      return (
        spawnSync("node", ["src/scripts/upstream/verify_pins.mjs"], {
          stdio: "inherit",
        }).status === 0
      );
    default:
      console.log(chalk.red(`Unknown action '${args.action}'`));
      return false;
  }
}
