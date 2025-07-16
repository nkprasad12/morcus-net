import { setupFakeHypotacticData } from "@/common/library/hypotactic_test_helper";
import { processHypotactic } from "@/common/library/process_hypotactic";

setupFakeHypotacticData();

describe("Hypotactic Library Processing", () => {
  test("processes Book / Line work correctly", async () => {
    const work = processHypotactic()[1];
    expect(work.info.title).toBe("Metamorphoses");
    expect(work.info.author).toBe("P. Ovidius Naso");

    // The fake data has 2 books of 2 lines each.
    expect(work.pages).toHaveLength(2);
    expect(work.rows).toHaveLength(4);
  });

  test("processes Book / Poem / Line work correctly", async () => {
    const work = processHypotactic()[0];
    expect(work.info.title).toBe("Odes");
    expect(work.info.author).toBe("Horace");

    // The fake data has 1 book with 2 poems, each with 1 line.
    expect(work.pages).toHaveLength(2);
    expect(work.rows).toHaveLength(2);
    expect(work.rows[0][0]).toEqual(["1", "1", "1"]);
    expect(work.rows[1][0]).toEqual(["1", "2", "1"]);
    expect(work.textParts).toEqual(["book", "poem", "line"]);
  });
});
