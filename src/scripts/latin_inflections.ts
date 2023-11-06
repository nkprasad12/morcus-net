/* istanbul ignore file */

import { makeMorpheusDb } from "@/common/lexica/latin_words";
import * as dotenv from "dotenv";
dotenv.config();

const startTime = performance.now();
makeMorpheusDb();
const runTime = Math.round(performance.now() - startTime);
console.log(`Latin inflection table creation runtime: ${runTime} ms.`);
