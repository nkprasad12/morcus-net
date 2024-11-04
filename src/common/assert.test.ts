import { describe, expect, test } from "@jest/globals";
import {
  assert,
  assertEqual,
  assertType,
  checkPresent,
  checkSatisfies,
} from "@/common/assert";
import { isNumber, isString } from "@/web/utils/rpc/parsing";

describe("assert", () => {
  test("raises message on false", () => {
    expect(() => assert(false)).toThrow();
  });

  test("is no-op on true", () => {
    assert(true);
  });
});

describe("assertEqual", () => {
  test("raises message on not equal", () => {
    expect(() => assertEqual(3, "3")).toThrow();
  });

  test("is no-op on true", () => {
    assertEqual(3, 3);
  });
});

describe("assertType", () => {
  test("raises message on invalid", () => {
    expect(() => assertType(3, isString)).toThrow();
  });

  test("is no-op on valid", () => {
    assertType(3, isNumber);
  });
});

describe("assertPresent", () => {
  test("raises message on undefined", () => {
    expect(() => checkPresent(undefined)).toThrow();
  });

  test("raises message on null", () => {
    expect(() => checkPresent(null)).toThrow();
  });

  test("is no-op on other values", () => {
    expect(checkPresent(false)).toBe(false);
  });
});

describe("checkSatisfies", () => {
  test("raises on failures", () => {
    expect(() => checkSatisfies(["foo"], (a) => a.length === 2)).toThrow();
  });

  test("returns same on true", () => {
    const original = ["foo"];
    expect(checkSatisfies(original, (a) => a.length === 1)).toBe(original);
  });
});
