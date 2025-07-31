import * as Trie from "@/common/data_structures/trie";

describe("Trie", () => {
  describe("create", () => {
    it("should create an empty trie from an empty map", () => {
      const map = new Map<string, number[]>();
      const trie = Trie.fromMap(map);
      expect(trie).toEqual({});
    });

    it("should create a trie with a single entry", () => {
      const map = new Map([["a", [1]]]);
      const trie = Trie.fromMap(map);
      expect(trie).toEqual({
        children: new Map([["a", { values: [1] }]]),
      });
    });

    it("should create a trie with multiple entries sharing a prefix", () => {
      const map = new Map([
        ["cat", ["meow"]],
        ["car", ["vroom"]],
      ]);
      const trie = Trie.fromMap(map);

      const cNode = trie.children?.get("c");
      const aNode = cNode?.children?.get("a");
      const tNode = aNode?.children?.get("t");
      const rNode = aNode?.children?.get("r");

      expect(tNode?.values).toEqual(["meow"]);
      expect(rNode?.values).toEqual(["vroom"]);
    });

    it("should handle keys that are prefixes of other keys", () => {
      const map = new Map([
        ["a", [1]],
        ["ab", [2]],
      ]);
      const trie = Trie.fromMap(map);
      const aNode = trie.children?.get("a");
      expect(aNode?.values).toEqual([1]);
      const bNode = aNode?.children?.get("b");
      expect(bNode?.values).toEqual([2]);
    });

    it("should handle multiple values for a key", () => {
      const map = new Map([["key", [1, 2]]]);
      const trie = Trie.fromMap(map);
      const kNode = trie.children?.get("k");
      const eNode = kNode?.children?.get("e");
      const yNode = eNode?.children?.get("y");
      expect(yNode?.values).toEqual([1, 2]);
    });
  });

  describe("find", () => {
    const map = new Map([
      ["a", [1]],
      ["ab", [2]],
      ["abc", [3]],
      ["cat", [4]],
    ]);
    const trie = Trie.fromMap(map);

    it("should find an existing key", () => {
      expect(Trie.find(trie, "abc", 3)).toEqual([3]);
    });

    it("should return undefined for a non-existing key", () => {
      expect(Trie.find(trie, "xyz", 3)).toBeUndefined();
    });

    it("should return undefined for a key that is a prefix but not a word", () => {
      expect(Trie.find(trie, "ca", 2)).toBeUndefined();
    });

    it("should find a key that is a prefix of another key", () => {
      expect(Trie.find(trie, "a", 1)).toEqual([1]);
      expect(Trie.find(trie, "ab", 2)).toEqual([2]);
    });

    it("should work with an empty trie", () => {
      const emptyTrie = Trie.fromMap(new Map());
      expect(Trie.find(emptyTrie, "a", 1)).toBeUndefined();
    });

    it("should respect the end parameter", () => {
      expect(Trie.find(trie, "abcdef", 3)).toEqual([3]);
      expect(Trie.find(trie, "abcdef", 2)).toEqual([2]);
      expect(Trie.find(trie, "abcdef", 1)).toEqual([1]);
    });

    it("should return undefined if end is 0 for non-empty trie", () => {
      expect(Trie.find(trie, "a", 0)).toBeUndefined();
    });

    it("should return values for root if end is 0 and root has values", () => {
      const trieWithRootValue = Trie.fromMap(new Map([["", [10]]]));
      expect(Trie.find(trieWithRootValue, "any", 0)).toEqual([10]);
    });
  });
});
