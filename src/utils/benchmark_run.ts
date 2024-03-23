/* istanbul ignore file */

import { envVar } from "@/common/env_vars";
import { runBenchmarks } from "@/utils/benchmark_utils";
import { DictsFusedApi } from "@/web/api_routes";
import { callApi } from "@/web/utils/rpc/client_rpc";
import * as dotenv from "dotenv";

dotenv.config();

// @ts-ignore
global.location = {
  origin: `http://localhost:${envVar("PORT")}`,
};

const benchmarkPromise = runBenchmarks(
  [
    {
      name: "habeo",
      call: () => {
        const promises = [
          callApi(DictsFusedApi, { query: "habeo", dicts: ["L&S", "S&H"] }),
          callApi(DictsFusedApi, { query: "unda", dicts: ["L&S", "S&H"] }),
          callApi(DictsFusedApi, { query: "canaba", dicts: ["L&S", "S&H"] }),
        ];
        return Promise.all(promises);
      },
    },
  ],
  500
);

benchmarkPromise.then(() => console.log("\n\nBenchmark complete."));
