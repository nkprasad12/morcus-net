import { Stream } from "stream";
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
    const fileName = "foo.txt";
    const content = "Gallia est omnis";
    const readable = Stream.Readable.from(content);
    let result = "";
    const writeable = Stream.Writable.fromWeb(
      new WritableStream({
        write(chunk) {
          result += chunk;
        },
      })
    );

    await ObjectStorage.LOCAL.upload(TEMP_DIR, fileName, readable);
    await ObjectStorage.LOCAL.download(TEMP_DIR, fileName, writeable);
    expect(result).toBe(content);
  });
});
