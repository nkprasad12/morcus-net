import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";

import { replaceEnvVar } from "@/common/test_helpers";

const UNCOMPRESSED_DATA_ROOT = "testdata/hypotactic";

export function setupFakeHypotacticData() {
  const testDataRoot = fs.mkdtempSync("hypotactic-testdata-");
  replaceEnvVar("HYPOTACTIC_ROOT", testDataRoot);

  beforeAll(() => {
    const files = fs.readdirSync(UNCOMPRESSED_DATA_ROOT);
    const jsonFiles = files.filter((file) => file.endsWith(".json"));

    for (const jsonFile of jsonFiles) {
      const jsonFilePath = path.join(UNCOMPRESSED_DATA_ROOT, jsonFile);
      const content = fs.readFileSync(jsonFilePath);
      const gzippedContent = zlib.gzipSync(content);
      fs.writeFileSync(
        path.join(testDataRoot, `${jsonFile}.gz`),
        gzippedContent
      );
    }
  });

  afterAll(() => {
    try {
      fs.rmSync(testDataRoot, { recursive: true, force: true });
    } catch (error) {
      console.error("Error cleaning up test data:", error);
    }
  });
}
