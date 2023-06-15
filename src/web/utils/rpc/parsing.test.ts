import {
  Serializable,
  // Validator,
  encodeMessage,
  isArray,
  isString,
} from "./parsing";

class TestClass {
  constructor(readonly prop: string) {}
  static fromString: (data: string) => TestClass = (d) => new TestClass(d);
  static serialize(t: TestClass): string {
    return t.prop;
  }
}

function fromClass<Type>(c: {
  new (...args: any[]): Type;
}): Serializable<Type> {
  return {
    name: c.name,
    validator: (x): x is Type => x instanceof c,
    fromString: c.prototype.fromString,
    toString: c.prototype.toString,
  };
}

describe("isArray", () => {
  it("checks if input is array", () => {
    expect(isArray("canaba", isString)).toBe(false);
  });

  it("checks if all elements match validator", () => {
    expect(isArray(["canaba", 4], isString)).toBe(false);
  });

  it("validates valid arrays", () => {
    expect(isArray(["canaba", "4"], isString)).toBe(true);
  });
});

describe("decodeMessage", () => {
  it("checks if input is array", () => {
    expect(isArray("canaba", isString)).toBe(false);
  });

  it("checks if all elements match validator", () => {
    expect(isArray(["canaba", 4], isString)).toBe(false);
  });

  it("validates valid arrays", () => {
    expect(isArray(["canaba", "4"], isString)).toBe(true);
  });
});

describe("encodeMessage", () => {
  it("stringifies without registry", () => {
    expect(encodeMessage("foo")).toBe('{"wrappedData":"foo"}');
  });

  it("blah", () => {
    const registry = [fromClass(TestClass)];
    expect(registry[0].name).toBe("TestClass");
    expect(registry[0].validator("should be false")).toBe(false);
    expect(registry[0].validator(new TestClass("foo"))).toBe(true);
    expect(registry[0].toString(new TestClass("foo"))).toStrictEqual("foo");
    expect(registry[0].fromString("foo")).toStrictEqual("f");
  });
});
