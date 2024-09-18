/* istanbul ignore file */

import { GenerateLs } from "@/common/lewis_and_short/ls_generate";
import * as dotenv from "dotenv";
dotenv.config();

const startTime = performance.now();
GenerateLs.saveArtifacts();
const runTime = Math.round(performance.now() - startTime);
console.log(`Lewis and Short runtime: ${runTime} ms.`);
