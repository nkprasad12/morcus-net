/* istanbul ignore file */

import { processRiddleArnold } from "@/common/dictionaries/riddle_arnold/process_riddle_arnold";

const startTime = performance.now();
processRiddleArnold();
const runTime = Math.round(performance.now() - startTime);
console.log(`Riddle-Arnold runtime: ${runTime} ms.`);
