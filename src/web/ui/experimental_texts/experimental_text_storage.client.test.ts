import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";

import {
  EXPERIMENTAL_TEXT_DOCUMENT_VERSION,
  type ExperimentalTextDocument,
} from "@/common/experimental_texts/experimental_text_document";
import {
  EXPERIMENTAL_TEXTS_ACCESS_STORE,
  EXPERIMENTAL_TEXTS_DB_NAME,
  EXPERIMENTAL_TEXTS_DOCUMENT_MAX_AGE_MS,
  EXPERIMENTAL_TEXTS_DOCUMENT_STORE,
  EXPERIMENTAL_TEXTS_MAX_DOCUMENTS,
  ExperimentalTextStore,
  experimentalTextCacheKey,
  parseStoredDocument,
  parseStoredPosition,
} from "@/web/ui/experimental_texts/experimental_text_storage.client";

// fake-indexeddb clones rows with structuredClone; rows here are plain JSON.
if (typeof globalThis.structuredClone !== "function") {
  globalThis.structuredClone = <T>(value: T): T =>
    JSON.parse(JSON.stringify(value));
}

function doc(title: string): ExperimentalTextDocument {
  return {
    title,
    pagination: "pageBreaks",
    pages: [
      {
        id: "529",
        label: "col. 529",
        blocks: [
          { kind: "paragraph", segments: [{ kind: "text", text: "a" }] },
        ],
        notes: [],
      },
    ],
    warnings: [],
  };
}

describe("experimentalTextCacheKey", () => {
  it("keys a document by entry, pinned commit and document version", () => {
    expect(experimentalTextCacheKey("pl/x", "abc")).toBe(
      `pl/x@abc@v${EXPERIMENTAL_TEXT_DOCUMENT_VERSION}`
    );
  });
});

describe("parseStoredDocument / parseStoredPosition", () => {
  it("accepts well-formed rows", () => {
    expect(parseStoredDocument({ document: doc("T") })?.title).toBe("T");
    expect(
      parseStoredPosition({ workId: "w", pageId: "p", updatedAt: 1 })
    ).toEqual({ workId: "w", pageId: "p", updatedAt: 1 });
  });

  it("rejects malformed rows as misses", () => {
    expect(parseStoredDocument(undefined)).toBeNull();
    expect(parseStoredDocument({ document: { title: "T" } })).toBeNull();
    expect(
      parseStoredDocument({ document: { title: "T", pages: [] } })
    ).toBeNull();
    expect(
      parseStoredDocument({ document: { title: "T", pages: [{ id: 1 }] } })
    ).toBeNull();
    expect(parseStoredPosition({ workId: "w" })).toBeNull();
  });
});

describe("ExperimentalTextStore (IndexedDB)", () => {
  let factory: IDBFactory;
  let clock = 0;

  beforeEach(() => {
    factory = new IDBFactory();
  });

  async function withStore<T>(
    fn: (store: ExperimentalTextStore) => Promise<T>
  ): Promise<T> {
    const store = new ExperimentalTextStore({ factory, now: () => ++clock });
    try {
      return await fn(store);
    } finally {
      await store.close();
    }
  }

  it("misses, then serves what was stored, across connections", async () => {
    await withStore(async (store) => {
      expect(await store.getDocument("pl/x@1")).toBeUndefined();
      await store.putDocument("pl/x", "pl/x@1", doc("One"));
    });
    const cached = await withStore((store) => store.getDocument("pl/x@1"));
    expect(cached?.title).toBe("One");
  });

  it("drops older pins of an entry when a new pin is stored", async () => {
    await withStore(async (store) => {
      await store.putDocument("pl/x", "pl/x@1", doc("Old"));
      await store.putDocument("pl/xy", "pl/xy@1", doc("Other entry"));
      await store.putDocument("pl/x", "pl/x@2", doc("New"));
      expect(await store.getDocument("pl/x@1")).toBeUndefined();
      expect((await store.getDocument("pl/x@2"))?.title).toBe("New");
      expect((await store.getDocument("pl/xy@1"))?.title).toBe("Other entry");
    });
  });

  it("remembers the reading position per work", async () => {
    await withStore(async (store) => {
      expect(await store.getPosition("pl/x")).toBeUndefined();
      await store.setPosition("pl/x", "530");
      await store.setPosition("pl/x", "531");
    });
    const position = await withStore((store) => store.getPosition("pl/x"));
    expect(position).toMatchObject({ workId: "pl/x", pageId: "531" });
  });
});

describe("ExperimentalTextStore eviction", () => {
  const DAY = 24 * 60 * 60 * 1000;
  let factory: IDBFactory;
  let now: number;
  let store: ExperimentalTextStore;

  beforeEach(() => {
    factory = new IDBFactory();
    now = 1_000 * DAY;
    store = new ExperimentalTextStore({ factory, now: () => now });
  });

  afterEach(() => store.close());

  async function cachedKeys(): Promise<string[]> {
    const check = new ExperimentalTextStore({ factory });
    const keys: string[] = [];
    for (let i = 0; i < 40; i++) {
      if (await check.getDocument(`e${i}@1`)) keys.push(`e${i}@1`);
    }
    await check.close();
    return keys;
  }

  it("evicts documents not opened for 60 days on the next write", async () => {
    await store.putDocument("e0", "e0@1", doc("Old"));
    await store.putDocument("e1", "e1@1", doc("Read lately"));
    now += 50 * DAY;
    // Reading counts as opening: e1 stays fresh.
    expect(await store.getDocument("e1@1")).toBeDefined();
    now += EXPERIMENTAL_TEXTS_DOCUMENT_MAX_AGE_MS - 50 * DAY + 1;
    await store.putDocument("e2", "e2@1", doc("New"));
    expect(await store.getDocument("e0@1")).toBeUndefined();
    expect((await store.getDocument("e1@1"))?.title).toBe("Read lately");
    expect((await store.getDocument("e2@1"))?.title).toBe("New");
  });

  it("keeps at most the 20 most recently opened documents", async () => {
    for (let i = 0; i < EXPERIMENTAL_TEXTS_MAX_DOCUMENTS; i++) {
      now += 1;
      await store.putDocument(`e${i}`, `e${i}@1`, doc(`T${i}`));
    }
    // Opening e0 makes e1 the least recently opened.
    now += 1;
    await store.getDocument("e0@1");
    now += 1;
    await store.putDocument("e20", "e20@1", doc("T20"));
    await store.close();
    const keys = await cachedKeys();
    expect(keys).toHaveLength(EXPERIMENTAL_TEXTS_MAX_DOCUMENTS);
    expect(keys).toContain("e0@1");
    expect(keys).not.toContain("e1@1");
    expect(keys).toContain("e20@1");
  });

  it("keeps reading positions when their documents are evicted", async () => {
    await store.putDocument("e0", "e0@1", doc("Old"));
    await store.setPosition("e0", "529");
    now += EXPERIMENTAL_TEXTS_DOCUMENT_MAX_AGE_MS + 1;
    await store.putDocument("e1", "e1@1", doc("New"));
    expect(await store.getDocument("e0@1")).toBeUndefined();
    expect((await store.getPosition("e0"))?.pageId).toBe("529");
  });

  it("evicts the oldest document and retries once when over the quota", async () => {
    await store.putDocument("e0", "e0@1", doc("Oldest"));
    now += 1;
    await store.putDocument("e1", "e1@1", doc("Newer"));
    now += 1;
    // The next document write fails with QuotaExceededError once.
    const realPut = IDBObjectStore.prototype.put;
    let failures = 0;
    const spy = jest
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(function (this: IDBObjectStore, ...args) {
        if (this.name === EXPERIMENTAL_TEXTS_DOCUMENT_STORE && failures === 0) {
          failures++;
          throw new DOMException("Full", "QuotaExceededError");
        }
        return realPut.apply(this, args);
      });
    try {
      await store.putDocument("e2", "e2@1", doc("Newest"));
    } finally {
      spy.mockRestore();
    }
    expect(failures).toBe(1);
    await store.close();
    expect(await cachedKeys()).toEqual(["e1@1", "e2@1"]);
  });

  it("deletes a document on request", async () => {
    await store.putDocument("e0", "e0@1", doc("Doomed"));
    await store.deleteDocument("e0@1");
    expect(await store.getDocument("e0@1")).toBeUndefined();
  });
});

describe("ExperimentalTextStore schema", () => {
  it("closes its connection when another tab upgrades the database", async () => {
    const factory = new IDBFactory();
    const store = new ExperimentalTextStore({ factory });
    await store.setPosition("pl/x", "529");
    // A newer version elsewhere: not blocked by this store's connection.
    await new Promise<void>((resolve, reject) => {
      const request = factory.open(EXPERIMENTAL_TEXTS_DB_NAME, 99);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(
          EXPERIMENTAL_TEXTS_ACCESS_STORE + "-extra"
        );
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onblocked = () => reject(new Error("blocked"));
      request.onerror = () => reject(request.error);
    });
    await store.close();
  });
});

describe("ExperimentalTextStore without IndexedDB", () => {
  it("falls back to memory for the life of the page", async () => {
    const store = new ExperimentalTextStore({ factory: null });
    expect(await store.getDocument("k")).toBeUndefined();
    await store.putDocument("e", "k", doc("Memory"));
    expect((await store.getDocument("k"))?.title).toBe("Memory");
    await store.setPosition("e", "529");
    expect((await store.getPosition("e"))?.pageId).toBe("529");
    await store.close();
  });

  it("never rejects when opening the database fails", async () => {
    const broken = {
      open: () => {
        throw new Error("blocked by policy");
      },
    } as unknown as IDBFactory;
    const store = new ExperimentalTextStore({ factory: broken });
    await expect(store.getDocument("k")).resolves.toBeUndefined();
    await expect(
      store.putDocument("e", "k", doc("Kept"))
    ).resolves.toBeUndefined();
    expect((await store.getDocument("k"))?.title).toBe("Kept");
  });
});
