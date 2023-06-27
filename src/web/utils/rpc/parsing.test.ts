import {
  Serialization,
  decodeMessage,
  encodeMessage,
  instanceOf,
  isAny,
  isArray,
  isNumber,
  isString,
  matches,
  maybeUndefined,
  typeOf,
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

describe("instanceOf", () => {
  it("returns true on instances", () => {
    expect(instanceOf(StringWrapper)(new StringWrapper("foo"))).toBe(true);
  });

  it("returns false on others", () => {
    expect(instanceOf(StringWrapper)("foo")).toBe(false);
  });
});

describe("typeOf", () => {
  it("it returns valid on strings", () => {
    expect(typeOf("string")("1")).toBe(true);
    expect(typeOf("string")(1)).toBe(false);
  });

  it("it returns valid on boolean", () => {
    expect(typeOf("boolean")(false)).toBe(true);
    expect(typeOf("boolean")("false")).toBe(false);
  });

  it("it returns valid on number", () => {
    expect(typeOf("number")(1)).toBe(true);
    expect(typeOf("number")("1")).toBe(false);
  });
});

describe("maybeUndefined", () => {
  it("returns true on undefined", () => {
    expect(maybeUndefined(isString)(undefined)).toBe(true);
  });

  it("returns true on match", () => {
    expect(maybeUndefined(isString)("undef")).toBe(true);
  });

  it("returns false on other", () => {
    expect(maybeUndefined(isString)(57)).toBe(false);
  });
});

describe("matchesInterface", () => {
  const matcher = matches([
    ["a", isString],
    ["b", isNumber],
  ]);

  it("returns false on non object", () => {
    expect(matcher(57)).toBe(false);
  });

  it("returns false on null object", () => {
    expect(matcher(null)).toBe(false);
  });

  it("returns false on missing argument", () => {
    expect(matcher({ a: "57" })).toBe(false);
  });

  it("returns false on bad argument", () => {
    expect(matcher({ a: "57", b: "57" })).toBe(false);
  });

  it("returns true on good input", () => {
    expect(matcher({ a: "57", b: 57 })).toBe(true);
  });
});

describe("isPrimitives", () => {
  test("isAny returns true", () => {
    expect(isAny(null)).toBe(true);
  });
});

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
