import { describe, expect, test } from "@jest/globals";
import { assert } from "./assert";

describe("assert", () => {
  test("assert raises message on false", () => {
    expect(() => assert(false)).toThrow();
  });

  test("is no-op on true", () => {
    assert(true);
  });
});
