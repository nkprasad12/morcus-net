/* istanbul ignore file */

import { setEnv } from "@/integration/utils/set_test_env";

const PORT = "1337";
const TEST_TMP_DIR = "tmp_server_integration_test";
const REUSE_DEV = process.env.REUSE_DEV === "1" || false;
const FROM_DOCKER = process.env.FROM_DOCKER === "1" || false;
setEnv(REUSE_DEV, PORT, TEST_TMP_DIR);

import { setupMorcusBackendWithCleanup } from "@/integration/utils/morcus_integration_setup";
import { defineBundleSizeSuite } from "@/integration/suites/bundle_size.suite";
import { defineMorcusBackendIntegrationSuite } from "@/integration/suites/morcus_backend_integration.suite";
import { defineBrowserE2eSuite } from "@/integration/suites/browser_e2e.suite";

// @ts-ignore
global.location = {
  origin: "http://localhost:1337",
};

setupMorcusBackendWithCleanup(FROM_DOCKER, REUSE_DEV, PORT, TEST_TMP_DIR);

console.debug = jest.fn();

defineBundleSizeSuite();
defineMorcusBackendIntegrationSuite();
defineBrowserE2eSuite();
