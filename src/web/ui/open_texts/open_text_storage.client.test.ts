import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";

import type { OpenTextDocument } from "@/common/open_texts/open_text_document";
import {
  OpenTextStore,
  openTextCacheKey,
  parseStoredDocument,
  parseStoredPosition,
} from "@/web/ui/open_texts/open_text_storage.client";

// fake-indexeddb clones rows with structuredClone; rows here are plain JSON.
if (typeof globalThis.structuredClone !== "function") {
  globalThis.structuredClone = <T>(value: T): T =>
    JSON.parse(JSON.stringify(value));
}

function doc(title: string): OpenTextDocument {
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

describe("openTextCacheKey", () => {
  it("keys a document by entry and pinned commit", () => {
    expect(openTextCacheKey("pl/x", "abc")).toBe("pl/x@abc");
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

describe("OpenTextStore (IndexedDB)", () => {
  let factory: IDBFactory;
  let clock = 0;

  beforeEach(() => {
    factory = new IDBFactory();
  });

  async function withStore<T>(
    fn: (store: OpenTextStore) => Promise<T>
  ): Promise<T> {
    const store = new OpenTextStore({ factory, now: () => ++clock });
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

describe("OpenTextStore without IndexedDB", () => {
  it("falls back to memory for the life of the page", async () => {
    const store = new OpenTextStore({ factory: null });
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
    const store = new OpenTextStore({ factory: broken });
    await expect(store.getDocument("k")).resolves.toBeUndefined();
    await expect(
      store.putDocument("e", "k", doc("Kept"))
    ).resolves.toBeUndefined();
    expect((await store.getDocument("k"))?.title).toBe("Kept");
  });
});
