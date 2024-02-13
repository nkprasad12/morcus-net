import { ObjectStorage } from "@/web/storage/object_storage";
import { BlobHandler } from "@/web/storage/storage_routes";
import fs from "fs";

const TEMP_DIR = "storage_routes.ts.tmp.txt";
const cleanup = () => {
  try {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  } catch {}
};

describe("Storage Routes", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("Handles create and get", async () => {
    const storage = BlobHandler.forStorage(ObjectStorage.local(TEMP_DIR));
    const data = { data: "Foo", metadata: { bar: "baz" } };

    const id = await storage.create(data);
    const stored = await storage.get(id);

    expect(stored).toEqual(expect.objectContaining(data));
    expect(stored).toEqual(expect.objectContaining(id));
  });
});
