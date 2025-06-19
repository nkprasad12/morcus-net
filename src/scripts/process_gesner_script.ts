/* istanbul ignore file */

import { processGesner } from "@/common/dictionaries/gesner/process_gesner";

const startTime = performance.now();
processGesner();
const runTime = Math.round(performance.now() - startTime);
console.log(`Gesner runtime: ${runTime} ms.`);
