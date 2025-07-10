import { setupFakeHypotacticData } from "@/common/library/hypotactic_test_helper";
import { processHypotactic } from "@/common/library/process_hypotactic";

setupFakeHypotacticData();

describe("Hypotactic Library Processing", () => {
  test("processes Ovid's Metamorphoses correctly", async () => {
    const works = processHypotactic();
    expect(works).toHaveLength(1);
    const work = works[0];
    expect(work.info.title).toBe("Metamorphoses");
    expect(work.info.author).toBe("Ovid");

    // The fake data has 2 books of 2 lines each.
    expect(work.pages).toHaveLength(2);
    expect(work.rows).toHaveLength(4);
  });
});
