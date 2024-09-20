/* istanbul ignore file */

import { SqliteDict } from "@/common/dictionaries/sqlite_backing";
import { envVar } from "@/common/env_vars";
import {
  processSmithHall,
  shListToRaw,
} from "@/common/smith_and_hall/sh_process";
import { packCompressedChunks } from "@/web/server/chunking";

export async function generateShArtifacts(): Promise<void> {
  const shEntries = await processSmithHall();
  const rawEntries = shListToRaw(shEntries);
  SqliteDict.save(rawEntries, envVar("SH_PROCESSED_PATH"));
  packCompressedChunks(rawEntries, 30, "shDict", envVar("OFFLINE_DATA_DIR"));
}
