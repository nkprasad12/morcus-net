import { describe, expect, test } from "@jest/globals";

import { parse } from "@/common/lewis_and_short/ls_parser";

console.debug = jest.fn();

const LS_SUBSET = "testdata/ls/subset.xml";

describe("parse", () => {
  test("parses all entries in file", () => {
    expect([...parse(LS_SUBSET)]).toHaveLength(4);
  });
});
