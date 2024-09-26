import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";

import {
  SingleStoreDbConfig,
  type DbConfig,
  type Store,
  type TransactionType,
} from "@/web/client/utils/indexdb/types";
import {
  wrappedIndexDb,
  simpleIndexDbStore,
} from "@/web/client/utils/indexdb/wrappers";
import {
  Validator,
  isAny,
  isNumber,
  isString,
  matches,
} from "@/web/utils/rpc/parsing";

function dbConfig(
  validator?: Validator<any>
): SingleStoreDbConfig<{ x: number; y?: number }> {
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
    await expect(store.get(5)).rejects.toBe("No match");
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
    await expect(validAdd).resolves.toBe(undefined);
  });

  it("doesn't allow overwrites on add", async () => {
    const store = simpleIndexDbStore(dbConfig(isAny));
    await store.add({ x: 5 });
    let threwError = false;
    try {
      await store.add({ x: 5, y: 0 });
    } catch {
      threwError = true;
    }
    expect(threwError).toBe(true);
    await expect(store.getAll()).resolves.toEqual([{ x: 5 }]);
  });

  it("allows overwrites with update", async () => {
    const store = simpleIndexDbStore(dbConfig(isAny));
    await store.add({ x: 5 });
    await store.update({ x: 5, y: 0 });
    await expect(store.getAll()).resolves.toEqual([{ x: 5, y: 0 }]);
  });
});

describe("wrappedIndexDb with multiple stores", () => {
  beforeEach(() => {
    // eslint-disable-next-line no-global-assign
    indexedDB = new IDBFactory();
  });

  interface Foo {
    id: string;
    foo: string;
  }

  const FOO_VALIDATOR = matches<Foo>([
    ["id", isString],
    ["foo", isString],
  ]);

  interface Bar {
    id: string;
    bar: number;
  }

  const BAR_VALIDATOR = matches<Bar>([
    ["id", isString],
    ["bar", isNumber],
  ]);

  const FooStoreConfig: Store<Foo> = {
    name: "foos",
    keyPath: "id",
    validator: FOO_VALIDATOR,
  };

  const BarStoreConfig: Store<Bar> = {
    name: "bars",
    keyPath: "id",
    validator: BAR_VALIDATOR,
  };

  const MULTI_STORE_CONFIG: DbConfig = {
    dbName: "testMultistoreDb",
    version: 1,
    stores: [FooStoreConfig, BarStoreConfig],
  };

  it("handles happy path", async () => {
    const db = await wrappedIndexDb(MULTI_STORE_CONFIG);

    const fooStore = <U extends TransactionType>(u: U) =>
      db.singleStore(FooStoreConfig, u);
    const barStore = <U extends TransactionType>(u: U) =>
      db.singleStore(BarStoreConfig, u);

    expect(await fooStore("readonly").getAll()).toHaveLength(0);
    expect(await barStore("readonly").getAll()).toHaveLength(0);

    fooStore("readwrite").add({ id: "5", foo: "5" });
    fooStore("readwrite").add({ id: "7", foo: "7" });
    expect(await fooStore("readonly").get("7")).toEqual({ id: "7", foo: "7" });
    expect(await fooStore("readonly").getAll()).toEqual([
      { id: "5", foo: "5" },
      { id: "7", foo: "7" },
    ]);
    expect(await barStore("readonly").getAll()).toHaveLength(0);

    await fooStore("readwrite").delete("5");
    expect(await fooStore("readonly").getAll()).toEqual([
      { id: "7", foo: "7" },
    ]);
    await expect(fooStore("readonly").get("5")).rejects.toBe("No match");
  });

  it("handles concurrent opens on same stores", async () => {
    const db = await wrappedIndexDb(MULTI_STORE_CONFIG);

    const operations = [
      db.singleStore(BarStoreConfig, "readwrite").add({ id: "5", bar: 6 }),
      db.singleStore(BarStoreConfig, "readwrite").add({ id: "6", bar: 8 }),
    ];
    await Promise.allSettled(operations);

    expect(await db.singleStore(BarStoreConfig, "readonly").getAll()).toEqual([
      { id: "5", bar: 6 },
      { id: "6", bar: 8 },
    ]);
  });

  it("handles open then close", async () => {
    let db = await wrappedIndexDb(MULTI_STORE_CONFIG);
    await db.singleStore(BarStoreConfig, "readwrite").add({ id: "5", bar: 6 });
    db.close();
    await new Promise((r) => setTimeout(r, 10));

    db = await wrappedIndexDb(MULTI_STORE_CONFIG);
    expect(await db.singleStore(BarStoreConfig, "readonly").getAll()).toEqual([
      { id: "5", bar: 6 },
    ]);
  });

  it("raises on invalid inserts without key", async () => {
    const db = await wrappedIndexDb(MULTI_STORE_CONFIG);
    // @ts-expect-error
    const illegalAdd = db.singleStore(FooStoreConfig, "readonly").add({ y: 5 });
    await expect(illegalAdd).rejects.toContain("Invalid object");
  });
});
