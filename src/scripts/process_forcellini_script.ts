import { processForcellini } from "@/common/dictionaries/forcellini/process_forcellini";

const startTime = performance.now();
processForcellini();
const runTime = Math.round(performance.now() - startTime);
console.log(`Forcellini runtime: ${runTime} ms.`);
