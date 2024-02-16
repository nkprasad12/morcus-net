import fs from "fs";
import {
  ObjectStorage,
  StorageBlob,
  StorageBlobData,
  StorageBlobId,
} from "@/web/storage/object_storage";

const TEMP_DIR = "object_storage.ts.tmp.txt";
const cleanup = () => {
  try {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  } catch {}
};

describe("Object Storage type validators", () => {
  test("StoredBlobId validator", () => {
    expect(StorageBlobId.isMatch({ key: "blah" })).toBe(false);
    expect(StorageBlobId.isMatch({ id: "blah" })).toBe(true);
  });

  test("StoredBlobData validator", () => {
    expect(StorageBlobData.isMatch({ data: "blah" })).toBe(true);
    expect(
      StorageBlobData.isMatch({ data: "blah", metadata: { name: "bloo" } })
    ).toBe(true);
  });

  test("StoredBlob validator", () => {
    expect(StorageBlob.isMatch({ data: "blah" })).toBe(false);
    expect(StorageBlob.isMatch({ data: "blah", id: "id" })).toBe(true);
  });
});

describe("ObjectStorage", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  test("Default impl handles simple read and write", async () => {
    const storage = ObjectStorage.local(TEMP_DIR);
    const fileName = "foo.txt";
    const content = "Gallia est omnis";

    await storage.upload(fileName, content);
    const result = await storage.download(fileName);
    expect(result).toBe(content);
  });
});
