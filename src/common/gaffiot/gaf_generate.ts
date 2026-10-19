/* istanbul ignore file */

import { SqliteDict } from "@/common/dictionaries/sqlite_backing";
import { envVar } from "@/common/env_vars";
import { processGaffiot } from "@/common/gaffiot/process_gaffiot";

export async function generateGaffiotArtifacts(): Promise<void> {
  const entries = processGaffiot();
  SqliteDict.save(entries, envVar("GAFFIOT_PROCESSED_PATH"));
}
