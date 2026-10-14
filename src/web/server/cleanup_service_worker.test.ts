import fs from "fs";
import path from "path";

const SCRIPT = fs.readFileSync(
  path.resolve("public", "cleanup_service_worker.js"),
  "utf8"
);

type Listener = (event: { waitUntil: (p: Promise<unknown>) => void }) => void;

/** Runs the script against a fake worker global and returns its handles. */
function loadWorker(cacheNames: string[]) {
  const listeners = new Map<string, Listener>();
  const order: string[] = [];
  const navigate = jest.fn(async (url: string) => {
    order.push(`navigate ${url}`);
  });
  const fakeSelf = {
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    skipWaiting: jest.fn(async () => {}),
    registration: {
      unregister: jest.fn(async () => {
        order.push("unregister");
        return true;
      }),
    },
    clients: {
      matchAll: jest.fn(async () => [
        { url: "https://morcus.net/dicts", navigate },
      ]),
    },
  };
  const fakeCaches = {
    keys: jest.fn(async () => cacheNames),
    delete: jest.fn(async (name: string) => {
      order.push(`cache ${name}`);
      return true;
    }),
  };
  const fakeIndexedDb = {
    deleteDatabase: jest.fn((name: string) => {
      order.push(`db ${name}`);
      const request: Record<string, (() => void) | undefined> = {};
      setTimeout(() => request.onsuccess?.());
      return request;
    }),
  };
  new Function("self", "caches", "indexedDB", SCRIPT)(
    fakeSelf,
    fakeCaches,
    fakeIndexedDb
  );

  async function fire(type: string) {
    const pending: Promise<unknown>[] = [];
    listeners.get(type)!({ waitUntil: (p) => pending.push(p) });
    await Promise.all(pending);
  }
  return { fire, fakeSelf, fakeCaches, fakeIndexedDb, navigate, order };
}

describe("cleanup_service_worker.js", () => {
  test("activates immediately on install", async () => {
    const worker = loadWorker([]);
    await worker.fire("install");
    expect(worker.fakeSelf.skipWaiting).toHaveBeenCalled();
  });

  test("deletes only V1 caches and databases, then unregisters and reloads", async () => {
    const worker = loadWorker([
      "morcusOfflineData",
      "offlineData/v1/static/abc123",
      "someOtherCache",
    ]);
    await worker.fire("activate");

    expect(worker.fakeCaches.delete.mock.calls.map((c) => c[0])).toEqual([
      "morcusOfflineData",
      "offlineData/v1/static/abc123",
    ]);
    const dbs = worker.fakeIndexedDb.deleteDatabase.mock.calls.map((c) => c[0]);
    expect(dbs).toContain("lewisAndShortDict");
    expect(dbs).toContain("OfflineModeSettings");
    expect(dbs).not.toContain("externalContent.db");
    expect(worker.order.slice(-2)).toEqual([
      "unregister",
      "navigate https://morcus.net/dicts",
    ]);
  });

  test("still unregisters when cleanup fails", async () => {
    const worker = loadWorker([]);
    worker.fakeCaches.keys.mockRejectedValue(new Error("no caches"));
    await worker.fire("activate");
    expect(worker.fakeSelf.registration.unregister).toHaveBeenCalled();
    expect(worker.navigate).toHaveBeenCalled();
  });
});
