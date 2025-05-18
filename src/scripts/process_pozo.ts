/* istanbul ignore file */

import { processPozo } from "@/common/dictionaries/pozo/process_pozo";

const startTime = performance.now();
processPozo();
const runTime = Math.round(performance.now() - startTime);
console.log(`Pozo runtime: ${runTime} ms.`);
