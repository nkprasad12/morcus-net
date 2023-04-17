/* istanbul ignore file */

import { LewisAndShort } from "@/common/lewis_and_short/ls";
import * as dotenv from "dotenv";
dotenv.config();

const startTime = performance.now();
LewisAndShort.save(LewisAndShort.createProcessed());
const runTime = Math.round(performance.now() - startTime);
console.log(`Runtime: ${runTime} ms.`);
