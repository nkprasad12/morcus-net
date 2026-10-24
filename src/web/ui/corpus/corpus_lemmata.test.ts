import { buildLemmaShards } from "@/web/ui/corpus/corpus_lemmata.server";

describe("buildLemmaShards", () => {
  test("one JSON shard per lowercased first letter", () => {
    const shards = buildLemmaShards(["caedo", "amo", "Caesar", "Areus2"]);

    expect([...shards.keys()].sort()).toEqual(["a", "c"]);
    for (const shard of shards.values()) {
      expect(Array.isArray(JSON.parse(shard))).toBe(true);
    }
  });

  test("each shard is in code-unit order, which the client binary-searches", () => {
    const shards = buildLemmaShards([
      "caedo",
      "Cato",
      "cado",
      "abdico#1",
      "Caesar",
      "abdico#2",
      "amo",
    ]);

    expect(JSON.parse(shards.get("c") ?? "")).toEqual([
      "Caesar",
      "Cato",
      "cado",
      "caedo",
    ]);
    expect(JSON.parse(shards.get("a") ?? "")).toEqual([
      "abdico#1",
      "abdico#2",
      "amo",
    ]);
  });

  test("skips empty entries", () => {
    expect([...buildLemmaShards(["", "amo"]).keys()]).toEqual(["a"]);
  });
});
