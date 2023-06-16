import {
  Serialization,
  decodeMessage,
  encodeMessage,
  isArray,
  isString,
} from "./parsing";

class StringWrapper {
  constructor(readonly prop: string) {}

  static SERIALIZATION: Serialization<StringWrapper> = {
    name: "StringWrapper",
    validator: (t): t is StringWrapper => t instanceof StringWrapper,
    serialize: (t) => t.prop,
    deserialize: (t) => new StringWrapper(t),
  };
}

describe("isArray", () => {
  it("checks if input is array", () => {
    expect(isArray(isString)("canaba")).toBe(false);
  });

  it("checks if all elements match validator", () => {
    expect(isArray(isString)(["canaba", 4])).toBe(false);
  });

  it("validates valid arrays", () => {
    expect(isArray(isString)(["canaba", "4"])).toBe(true);
  });
});

describe("encode and decode", () => {
  it("handles string input", () => {
    const input = "hello";

    const encoded = encodeMessage(input);
    const result = decodeMessage(encoded, isString);

    expect(result).toStrictEqual(input);
  });

  it("handles simple registry input", () => {
    const input = new StringWrapper("foo");

    const encoded = encodeMessage(input, [StringWrapper.SERIALIZATION]);
    const result = decodeMessage(
      encoded,
      StringWrapper.SERIALIZATION.validator,
      [StringWrapper.SERIALIZATION]
    );

    expect(result).toStrictEqual<StringWrapper>(input);
  });

  it("handles array registry input", () => {
    const input = [new StringWrapper("foo")];

    const encoded = encodeMessage(input, [StringWrapper.SERIALIZATION]);
    const result = decodeMessage(
      encoded,
      isArray(StringWrapper.SERIALIZATION.validator),
      [StringWrapper.SERIALIZATION]
    );

    expect(result).toStrictEqual<StringWrapper[]>(input);
  });
});
