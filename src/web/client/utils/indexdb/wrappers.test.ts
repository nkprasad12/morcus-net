import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";

import { SingleStoreDbConfig } from "@/web/client/utils/indexdb/types";
import { simpleIndexDbStore } from "@/web/client/utils/indexdb/wrappers";
import { Validator, isAny, isString } from "@/web/utils/rpc/parsing";

function dbConfig(
  validator?: Validator<any>
): SingleStoreDbConfig<{ x: number }> {
  return {
    dbName: "wrappersTestTsDb",
    version: 1,
    stores: [{ name: "numberStore", keyPath: "x", validator }],
  };
}

describe("indexDb simpleStore", () => {
  beforeEach(() => {
    // eslint-disable-next-line no-global-assign
    indexedDB = new IDBFactory();
  });

  it("handles happy path", async () => {
    const store = simpleIndexDbStore(dbConfig());
    const results = await store.getAll();
    expect(results).toHaveLength(0);

    store.add({ x: 5 });
    store.add({ x: 7 });
    expect(await store.get(7)).toEqual({ x: 7 });
    expect(await store.getAll()).toEqual([{ x: 5 }, { x: 7 }]);

    store.delete(5);
    expect(await store.getAll()).toEqual([{ x: 7 }]);
    expect(await store.get(7)).toEqual({ x: 7 });
    expect(store.get(5)).rejects.toBe("No match");
  });

  it("handles concurrent opens", async () => {
    const store1 = simpleIndexDbStore(dbConfig());
    const store2 = simpleIndexDbStore(dbConfig());

    store1.add({ x: 5 });
    store2.add({ x: 7 });

    expect(await store1.getAll()).toEqual([{ x: 5 }, { x: 7 }]);
    expect(await store2.getAll()).toEqual([{ x: 5 }, { x: 7 }]);
  });

  it("handles open then close", async () => {
    let store = simpleIndexDbStore(dbConfig());
    store.add({ x: 5 });
    store.add({ x: 7 });
    store.close();
    await new Promise((r) => setTimeout(r, 10));

    store = simpleIndexDbStore(dbConfig());
    expect(await store.getAll()).toEqual([{ x: 5 }, { x: 7 }]);
  });

  it("raises on invalid inserts without key", async () => {
    const store = simpleIndexDbStore(dbConfig());
    // @ts-expect-error
    const illegalAdd = store.add({ y: 5 });
    await expect(illegalAdd).rejects.toContain("Invalid object");
  });

  it("raises on invalid inserts with bad validator", async () => {
    const store = simpleIndexDbStore(dbConfig(isString));
    const illegalAdd = store.add({ x: 5 });
    await expect(illegalAdd).rejects.toContain("Invalid object");
  });

  it("allows valid inserts with validator", async () => {
    const store = simpleIndexDbStore(dbConfig(isAny));
    const validAdd = store.add({ x: 5 });
    expect(validAdd).resolves.toBe(undefined);
  });
});
