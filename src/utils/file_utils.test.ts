import { filesInPaths } from "@/utils/file_utils";
import fs from "fs";

const TEST_TMP_DIR = "src/utils/file_utils/test/ts";
const SUBDIR_A = `${TEST_TMP_DIR}/a`;
const SUBDIR_B = `${TEST_TMP_DIR}/b`;
const SUBDIR_A_C = `${TEST_TMP_DIR}/a/c`;

function cleanup() {
  try {
    fs.rmSync(TEST_TMP_DIR, { recursive: true, force: true });
  } catch {}
}

describe("filesInPaths", () => {
  beforeAll(() => {
    cleanup();
    fs.mkdirSync(SUBDIR_A, { recursive: true });
    fs.mkdirSync(SUBDIR_B, { recursive: true });
    fs.mkdirSync(SUBDIR_A_C, { recursive: true });

    fs.writeFileSync(`${TEST_TMP_DIR}/a.txt`, "");
    fs.writeFileSync(`${SUBDIR_A}/a1.txt`, "");
    fs.writeFileSync(`${SUBDIR_A}/a2.txt`, "");
    fs.writeFileSync(`${SUBDIR_B}/b.txt`, "");
    fs.writeFileSync(`${SUBDIR_A_C}/ac.txt`, "");
  });

  afterAll(cleanup);

  it("finds recursive files", () => {
    const results = [...filesInPaths([TEST_TMP_DIR])];
    results.sort();

    expect(results).toEqual([
      "src/utils/file_utils/test/ts/a.txt",
      "src/utils/file_utils/test/ts/a/a1.txt",
      "src/utils/file_utils/test/ts/a/a2.txt",
      "src/utils/file_utils/test/ts/a/c/ac.txt",
      "src/utils/file_utils/test/ts/b/b.txt",
    ]);
  });

  it("searches multiple roots", () => {
    const results = [...filesInPaths([SUBDIR_A, SUBDIR_B])];
    results.sort();

    expect(results).toEqual([
      "src/utils/file_utils/test/ts/a/a1.txt",
      "src/utils/file_utils/test/ts/a/a2.txt",
      "src/utils/file_utils/test/ts/a/c/ac.txt",
      "src/utils/file_utils/test/ts/b/b.txt",
    ]);
  });
});
