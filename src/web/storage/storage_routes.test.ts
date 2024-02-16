import { ObjectStorage } from "@/web/storage/object_storage";
import { storageRoutes } from "@/web/storage/storage_routes";
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
    const [create, get] = storageRoutes(ObjectStorage.local(TEMP_DIR));
    const data = { data: "Foo", metadata: { bar: "baz" } };

    const id = await create.handler(data);
    const stored = await get.handler(id);

    expect(stored).toEqual(expect.objectContaining(data));
    expect(stored).toEqual(expect.objectContaining(id));
  });
});
