/**
 * @jest-environment jsdom
 */

global.structuredClone = (x) => JSON.parse(JSON.stringify(x));
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";

import { packCompressedChunks } from "@/web/server/chunking";
import { saveOfflineDict } from "@/web/client/offline/offline_data";
import { TextDecoder } from "node:util";
import {
  ENTRIES_STORE,
  IndexedDbDict,
  ORTHS_STORE,
  type IndexDbDictConfig,
} from "@/common/dictionaries/indexdb_backing";
import { gunzipSync } from "node:zlib";
import type { RawDictEntry } from "@/common/dictionaries/stored_dict_interface";

jest.mock("@/common/bytedata/compression", () => ({
  decompress: (data: ArrayBuffer) => gunzipSync(data),
}));

console.debug = jest.fn();

// @ts-expect-error
global.TextDecoder = TextDecoder;

const TEST_DATA: RawDictEntry[] = [
  { id: "n1", keys: ["hi", "hello"], entry: "hi, hello" },
  { id: "n2", keys: ["hi", "sup"], entry: "hi, sup" },
];
const TEST_DB_CONFIG: IndexDbDictConfig = {
  dbName: "testDb",
  version: 1,
  stores: [ENTRIES_STORE, ORTHS_STORE],
};

describe("offline data loading", () => {
  beforeEach(async () => {
    // eslint-disable-next-line no-global-assign
    indexedDB = new IDBFactory();
  });

  function mockFetch(buffer: Promise<unknown>, ok: boolean) {
    global.fetch = jest.fn(() =>
      Promise.resolve({ arrayBuffer: () => buffer, ok, status: ok ? 200 : 501 })
    ) as jest.Mock;
  }

  test("rejects on failed fetch", async () => {
    mockFetch(Promise.reject(new Error("Fetch failed")), true);
    expect(saveOfflineDict("data", TEST_DB_CONFIG)).rejects.toThrowError(
      "Fetch failed"
    );
  });

  test("rejects on bad status", async () => {
    mockFetch(Promise.resolve(Buffer.of(1)), false);
    expect(saveOfflineDict("data", TEST_DB_CONFIG)).rejects.toThrowError(
      /Status 501.*/
    );
  });

  test("loads expected indexeddb tables", async () => {
    const data = packCompressedChunks(TEST_DATA, 2);
    mockFetch(Promise.resolve(data), true);
    await saveOfflineDict("data", TEST_DB_CONFIG);

    const dict = IndexedDbDict.backing(TEST_DB_CONFIG);

    expect(dict.entriesForIds(["n1"])).resolves.toEqual([
      { id: "n1", entry: "hi, hello" },
    ]);
    expect(dict.entryNamesByPrefix("h")).resolves.toEqual([
      { orth: "hi" },
      { orth: "hello" },
    ]);
    expect(dict.matchesForCleanName("sup")).resolves.toEqual([
      {
        id: "n2",
        orth: "sup",
      },
    ]);
    expect(dict.allEntryNames()).resolves.toEqual([
      { orth: "hello", cleanOrth: "hello" },
      { orth: "hi", cleanOrth: "hi" },
      { orth: "hi", cleanOrth: "hi" },
      { orth: "sup", cleanOrth: "sup" },
    ]);
  });
});
