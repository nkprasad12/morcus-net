import { describe, expect, test } from "@jest/globals";

import { LewisAndShort } from "./ls";

const LS_SUBSET = "testdata/ls/subset.xml";

describe("LewisAndShort", () => {
  const lewisAndShort = LewisAndShort.create(LS_SUBSET);

  test("returns error message if not in dictionary", async () => {
    const result = await lewisAndShort.getEntry("Antidisestablishmentarianism");
    expect(result).toContain("Could not find entry");
  });

  test("returns entry message", async () => {
    const result = await lewisAndShort.getEntry("camus");
    expect(result).toContain("A muzzle");
  });
});
