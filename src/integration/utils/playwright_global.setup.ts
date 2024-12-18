import { startMorcusFromDocker } from "@/integration/utils/morcus_integration_setup";

async function globalSetup() {
  const closer = await startMorcusFromDocker();
  return closer;
}

export default globalSetup;
