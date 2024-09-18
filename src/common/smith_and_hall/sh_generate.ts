/* istanbul ignore file */

import { SqliteDict } from "@/common/dictionaries/sqlite_backing";
import { envVar } from "@/common/env_vars";
import {
  processSmithHall,
  shListToRaw,
} from "@/common/smith_and_hall/sh_process";

export async function generateShArtifacts(): Promise<void> {
  const processedEntries = await processSmithHall();
  const dbReady = shListToRaw(processedEntries);
  SqliteDict.save(dbReady, envVar("SH_PROCESSED_PATH"));
}
