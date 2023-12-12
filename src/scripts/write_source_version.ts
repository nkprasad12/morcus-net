import { spawnSync } from "child_process";
import * as dotenv from "dotenv";
dotenv.config();

function getCommitId(): string {
  if (process.env.SOURCE_VERSION !== undefined) {
    return process.env.SOURCE_VERSION.trim();
  }
  const { stdout } = spawnSync("git", ["rev-parse", "HEAD"]);
  return stdout.toString().trim();
}
const hash = getCommitId();
console.log(`Server commit hash: "${hash}"`);
spawnSync(`echo SOURCE_VERSION=${hash} >> .env`, { shell: true });
