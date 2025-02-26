import { startMorcusFromDocker } from "@/integration/utils/morcus_integration_setup";
import { E2E_RAW_METRICS_DIR, E2E_REPORTS_DIR } from "@/perf/e2e_perf";
import fs from "fs";

async function globalSetup() {
  // For performance tests, we need to clean up the metrics directory.
  await fs.promises.rm(E2E_RAW_METRICS_DIR, { recursive: true, force: true });
  await fs.promises.mkdir(E2E_REPORTS_DIR, { recursive: true });
  await fs.promises.mkdir(E2E_RAW_METRICS_DIR, { recursive: true });
  if (process.env.REUSE_DEV_SERVER) {
    console.warn(
      "Environment variable REUSE_DEV_SERVER is set. Reusing the dev server at port",
      process.env.PORT
    );
    return;
  }
  const closer = await startMorcusFromDocker();
  return closer;
}

export default globalSetup;
