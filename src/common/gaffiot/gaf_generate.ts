/* istanbul ignore file */

import { SqliteDict } from "@/common/dictionaries/sqlite_backing";
import { envVar } from "@/common/env_vars";
import { processGaffiot } from "@/common/gaffiot/process_gaffiot";
import { packCompressedChunks } from "@/web/server/chunking";

export async function generateGaffiotArtifacts(): Promise<void> {
  const entries = processGaffiot();
  SqliteDict.save(entries, envVar("GAFFIOT_PROCESSED_PATH"));
  packCompressedChunks(entries, 100, "gafDict", envVar("OFFLINE_DATA_DIR"));
}
