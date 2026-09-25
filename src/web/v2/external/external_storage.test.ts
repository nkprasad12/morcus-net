import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";

import {
  EXTERNAL_CONTENT_DB_NAME,
  EXTERNAL_CONTENT_DB_VERSION,
  EXTERNAL_CONTENT_STORE,
  ExternalContentStore,
  parseStoredRow,
  storageKeyFor,
} from "@/web/v2/external/external_storage.client";

/** Writes rows exactly as V1's `external_content_storage.tsx` would. */
async function seedAsV1(factory: IDBFactory, rows: object[]): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = factory.open(
      EXTERNAL_CONTENT_DB_NAME,
      EXTERNAL_CONTENT_DB_VERSION
    );
    req.onupgradeneeded = () =>
      req.result.createObjectStore(EXTERNAL_CONTENT_STORE, {
        keyPath: "storageKey",
      });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const tx = db.transaction(EXTERNAL_CONTENT_STORE, "readwrite");
  for (const row of rows) tx.objectStore(EXTERNAL_CONTENT_STORE).add(row);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

describe("ExternalContentStore", () => {
  let factory: IDBFactory;
  let clock: number;
  let store: ExternalContentStore;

  beforeEach(() => {
    factory = new IDBFactory();
    clock = 1_000;
    store = new ExternalContentStore({ factory, now: () => clock++ });
  });

  afterEach(async () => {
    await store.close();
  });

  test("starts empty", async () => {
    expect(await store.list()).toEqual([]);
  });

  test("saves and loads a pasted text with a V1-style key", async () => {
    const key = await store.save({
      title: "Catilinam",
      content: "Quo usque tandem",
      lineMode: "prose",
    });
    expect(key).toBe("Catilinam_1000");
    expect(await store.get(key)).toEqual({
      storageKey: "Catilinam_1000",
      title: "Catilinam",
      content: "Quo usque tandem",
      lineMode: "prose",
      savedAt: 1000,
    });
  });

  test("keys URL imports by URL, and re-saving refreshes instead of failing", async () => {
    const url = "https://thelatinlibrary.com/cic.html";
    await store.save({ title: url, content: "old", source: "fromUrl" });
    const key = await store.save({
      title: url,
      content: "new",
      source: "fromUrl",
    });
    expect(key).toBe(url);
    expect((await store.get(url))?.content).toBe("new");
    expect(await store.list()).toHaveLength(1);
  });

  test("lists newest first, without content", async () => {
    await store.save({ title: "a", content: "1" });
    await store.save({ title: "b", content: "2" });
    const list = await store.list();
    expect(list.map((s) => s.title)).toEqual(["b", "a"]);
    expect(list[0]).not.toHaveProperty("content");
  });

  test("returns undefined for a missing key", async () => {
    expect(await store.get("nope")).toBeUndefined();
  });

  test("updates the line mode of an existing import", async () => {
    const key = await store.save({ title: "a", content: "1" });
    await store.setLineMode(key, "verse");
    expect((await store.get(key))?.lineMode).toBe("verse");
  });

  test("setLineMode on a missing key is a no-op", async () => {
    await store.setLineMode("nope", "verse");
    expect(await store.list()).toEqual([]);
  });

  test("deletes, and deleting a missing key is not an error", async () => {
    const key = await store.save({ title: "a", content: "1" });
    await store.delete(key);
    await store.delete(key);
    expect(await store.list()).toEqual([]);
  });

  describe("V1 compatibility", () => {
    test("reads imports written by V1", async () => {
      await seedAsV1(factory, [
        { storageKey: "Aeneid_5", title: "Aeneid", content: "Arma virumque" },
        {
          storageKey: "https://a.com",
          title: "https://a.com",
          content: "scraped",
          source: "fromUrl",
        },
      ]);
      const list = await store.list();
      expect(list).toEqual(
        expect.arrayContaining([
          { storageKey: "Aeneid_5", title: "Aeneid" },
          {
            storageKey: "https://a.com",
            title: "https://a.com",
            source: "fromUrl",
          },
        ])
      );
      expect(await store.get("Aeneid_5")).toEqual({
        storageKey: "Aeneid_5",
        title: "Aeneid",
        content: "Arma virumque",
        lineMode: "keep",
      });
    });

    test("sorts V2 rows before V1 rows (which have no savedAt)", async () => {
      await seedAsV1(factory, [
        { storageKey: "old_1", title: "old", content: "x" },
      ]);
      await store.save({ title: "new", content: "y" });
      expect((await store.list()).map((s) => s.title)).toEqual(["new", "old"]);
    });

    test("skips malformed rows instead of failing the list", async () => {
      await seedAsV1(factory, [
        { storageKey: "good", title: "ok", content: "x" },
        { storageKey: "bad", title: 42 },
      ]);
      expect((await store.list()).map((s) => s.storageKey)).toEqual(["good"]);
      expect(await store.get("bad")).toBeUndefined();
    });
  });

  test("rejects every call when IndexedDB is unavailable", async () => {
    const broken = new ExternalContentStore({ factory: null });
    await expect(broken.list()).rejects.toThrow("IndexedDB is not available");
    await expect(broken.save({ title: "a", content: "b" })).rejects.toThrow();
  });
});

describe("parseStoredRow", () => {
  test.each([null, 3, "x", [], {}, { storageKey: "k", title: "t" }])(
    "rejects %p",
    (row) => {
      expect(parseStoredRow(row)).toBeNull();
    }
  );

  test("normalizes unknown line modes and sources", () => {
    expect(
      parseStoredRow({
        storageKey: "k",
        title: "t",
        content: "c",
        lineMode: "sonnet",
        source: "fromMars",
        savedAt: Number.NaN,
      })
    ).toEqual({ storageKey: "k", title: "t", content: "c", lineMode: "keep" });
  });
});

describe("storageKeyFor", () => {
  test("matches V1's key scheme", () => {
    expect(storageKeyFor({ title: "Aeneid" }, 5)).toBe("Aeneid_5");
    expect(
      storageKeyFor({ title: "https://a.com", source: "fromUrl" }, 5)
    ).toBe("https://a.com");
  });
});
