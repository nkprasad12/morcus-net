/* istanbul ignore file */

import { execSync } from "child_process";

execSync("git clone https://github.com/Alatius/morpheus.git");
execSync("make", { cwd: "morpheus/src" });
execSync("make install", { cwd: "morpheus/src" });
execSync("./update.sh", { cwd: "morpheus" });
execSync("./update.sh", { cwd: "morpheus" });
