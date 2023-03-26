import { describe, expect, test } from "@jest/globals";
import { assert, assertEqual } from "./assert";

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
