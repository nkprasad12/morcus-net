import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import type { RawDictEntry } from "@/common/dictionaries/stored_dict_interface";
import {
  IndexedDbDict,
  LS_CONFIG,
} from "@/common/dictionaries/indexdb_backing";

console.debug = jest.fn();

const RAW_DATA: RawDictEntry[] = [
  { id: "1", keys: ["foo1", "bar2"], entry: "foo1bar1" },
  { id: "2", keys: ["foo2", "bar2"], entry: "foo2bar2" },
  { id: "3", keys: ["foō13"], entry: "foo3bar3" },
];

describe("IndexedDbDict", () => {
  beforeEach(() => {
    // eslint-disable-next-line no-global-assign
    indexedDB = new IDBFactory();
  });

  it("returns expected entriesForIds", async () => {
    await IndexedDbDict.save(RAW_DATA, LS_CONFIG);
    const backing = IndexedDbDict.backing(LS_CONFIG);

    expect(await backing.entriesForIds(["2"])).toEqual([
      { id: "2", entry: "foo2bar2" },
    ]);
    expect(await backing.entriesForIds(["1", "3"])).toEqual([
      { id: "1", entry: "foo1bar1" },
      { id: "3", entry: "foo3bar3" },
    ]);
  });

  it("handles entriesForIds with unknown key", async () => {
    await IndexedDbDict.save(RAW_DATA, LS_CONFIG);
    const backing = IndexedDbDict.backing(LS_CONFIG);

    expect(await backing.entriesForIds(["42"])).toEqual([]);
  });

  it("returns expected entryNamesByPrefix", async () => {
    await IndexedDbDict.save(RAW_DATA, LS_CONFIG);
    const backing = IndexedDbDict.backing(LS_CONFIG);

    expect(await backing.entryNamesByPrefix("foo1")).toEqual(["foo1", "foō13"]);
    expect(await backing.entryNamesByPrefix("foo2")).toEqual(["foo2"]);
  });

  it("returns expected matchesForCleanName", async () => {
    await IndexedDbDict.save(RAW_DATA, LS_CONFIG);
    const backing = IndexedDbDict.backing(LS_CONFIG);

    expect(await backing.matchesForCleanName("foo13")).toEqual([
      { id: "3", orth: "foō13" },
    ]);
    expect(await backing.matchesForCleanName("bar2")).toEqual([
      { id: "1", orth: "bar2" },
      { id: "2", orth: "bar2" },
    ]);
  });

  it("returns expected allEntryNames", async () => {
    await IndexedDbDict.save(RAW_DATA, LS_CONFIG);
    const backing = IndexedDbDict.backing(LS_CONFIG);

    expect(await backing.allEntryNames()).toEqual([
      { orth: "bar2", cleanOrth: "bar2" },
      { orth: "bar2", cleanOrth: "bar2" },
      { orth: "foo1", cleanOrth: "foo1" },
      { orth: "foō13", cleanOrth: "foo13" },
      { orth: "foo2", cleanOrth: "foo2" },
    ]);
  });
});
