/* istanbul ignore file */

import { processGeorges } from "@/common/dictionaries/georges/process_georges";

const startTime = performance.now();
processGeorges();
const runTime = Math.round(performance.now() - startTime);
console.log(`Georges runtime: ${runTime} ms.`);
