import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";

import { replaceEnvVar } from "@/common/test_helpers";

const TEST_DATA_ROOT = "testdata/hypotactic";

export function setupFakeHypotacticData() {
  replaceEnvVar("HYPOTACTIC_ROOT", TEST_DATA_ROOT);

  beforeAll(() => {
    const files = fs.readdirSync(TEST_DATA_ROOT);
    const jsonFiles = files.filter((file) => file.endsWith(".json"));

    for (const jsonFile of jsonFiles) {
      const jsonFilePath = path.join(TEST_DATA_ROOT, jsonFile);
      const content = fs.readFileSync(jsonFilePath);
      const gzippedContent = zlib.gzipSync(content);
      fs.writeFileSync(`${jsonFilePath}.gz`, gzippedContent);
    }
  });

  afterAll(() => {
    const files = fs.readdirSync(TEST_DATA_ROOT);
    for (const file of files) {
      if (file.endsWith(".json.gz")) {
        fs.unlinkSync(path.join(TEST_DATA_ROOT, file));
      }
    }
  });
}
