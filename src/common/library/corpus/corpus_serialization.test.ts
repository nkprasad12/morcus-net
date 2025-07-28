import {
  serializeWithMaps,
  deserializeWithMaps,
} from "@/common/library/corpus/corpus_serialization";

describe("Map serialization", () => {
  it("serializes and deserializes an object with a map", () => {
    const original = {
      a: 1,
      myMap: new Map<string, number>([
        ["key1", 10],
        ["key2", 20],
      ]),
      nested: {
        otherMap: new Map<number, boolean>([[1, true]]),
      },
    };

    const json = serializeWithMaps(original);
    const deserialized = deserializeWithMaps<typeof original>(json);

    expect(deserialized).toEqual(original);
    expect(deserialized.myMap).toBeInstanceOf(Map);
    expect(deserialized.myMap.get("key1")).toBe(10);
    expect(deserialized.nested.otherMap).toBeInstanceOf(Map);
    expect(deserialized.nested.otherMap.get(1)).toBe(true);
  });

  it("handles an empty map", () => {
    const original = { emptyMap: new Map() };
    const json = serializeWithMaps(original);
    const deserialized = deserializeWithMaps<typeof original>(json);
    expect(deserialized.emptyMap).toBeInstanceOf(Map);
    expect(deserialized.emptyMap.size).toBe(0);
  });

  it("does not deserialize if token is incorrect", () => {
    const objWithBadToken = {
      dataType: "Map",
      serializationKey: "___WRONG_TOKEN___",
      data: [["key", "value"]],
    };
    const json = JSON.stringify({ myMap: objWithBadToken });
    const deserialized = deserializeWithMaps<{ myMap: any }>(json);

    expect(deserialized.myMap).not.toBeInstanceOf(Map);
    expect(deserialized.myMap).toEqual(objWithBadToken);
  });
});
