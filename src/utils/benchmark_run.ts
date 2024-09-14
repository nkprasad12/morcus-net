/* istanbul ignore file */

import { envVar } from "@/common/env_vars";
import { sqlDictBenchmarkConfig } from "@/scripts/benchmark_configs";
import { runBenchmarks } from "@/utils/benchmark_utils";
import * as dotenv from "dotenv";

dotenv.config();

// @ts-ignore
global.location = {
  origin: `http://localhost:${envVar("PORT")}`,
};

const benchmarkPromise = runBenchmarks(sqlDictBenchmarkConfig(), 100);

benchmarkPromise.then(() => console.log("\n\nBenchmark complete."));
