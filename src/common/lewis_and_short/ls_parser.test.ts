import { describe, expect, test } from "@jest/globals";

import { getRawLsXml } from "@/common/lewis_and_short/ls_parser";

console.debug = jest.fn();

const LS_SUBSET = "testdata/ls/subset.xml";

describe("getRawLsXml", () => {
  test("finds all entries in file", () => {
    expect([...getRawLsXml(LS_SUBSET)]).toHaveLength(4);
  });
});
