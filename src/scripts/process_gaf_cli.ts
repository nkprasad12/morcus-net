/* istanbul ignore file */

import { generateGaffiotArtifacts } from "@/common/gaffiot/gaf_generate";

const startTime = performance.now();
void generateGaffiotArtifacts();
const runTime = Math.round(performance.now() - startTime);
console.log(`Gaffiot runtime: ${runTime} ms.`);
