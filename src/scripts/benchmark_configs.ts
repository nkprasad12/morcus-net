/* istanbul ignore file */

import { envVar } from "@/common/env_vars";
import { StoredDict } from "@/common/dictionaries/dict_storage";
import { type BenchmarkConfig } from "@/utils/benchmark_utils";
import { sqliteBacking } from "@/common/dictionaries/sqlite_backing";

export function sqlDictBenchmarkConfig(): BenchmarkConfig[] {
  const ls = new StoredDict(sqliteBacking(envVar("LS_PROCESSED_PATH")));
  return [
    { name: "compA", call: () => ls.getCompletions("a") },
    { name: "compH", call: () => ls.getCompletions("h") },
    { name: "compZ", call: () => ls.getCompletions("z") },
    {
      name: "compMixed",
      call: () => {
        ls.getCompletions("b");
        ls.getCompletions("d");
        ls.getCompletions("q");
      },
    },
    { name: "byIdEarly", call: () => ls.getById("n20") },
    { name: "byIdLate", call: () => ls.getById("n50000") },
    { name: "byQuerySmall", call: () => ls.getRawEntry("canaba") },
    { name: "byQueryLarge", call: () => ls.getRawEntry("habeo") },
    {
      name: "byQueryMixed",
      call: () => {
        ls.getRawEntry("habeo");
        ls.getRawEntry("unda");
        ls.getRawEntry("canaba");
      },
    },

    { name: "byQueryAmbig", call: () => ls.getRawEntry("occido") },
  ];
}
