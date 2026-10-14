import { setupFakeHypotacticData } from "@/common/library/hypotactic_test_helper";
import { processHypotactic } from "@/common/library/process_hypotactic";
import fs from "fs";
import path from "path";
import zlib from "zlib";

describe("Hypotactic Library Processing", () => {
  setupFakeHypotacticData();

  let works: ReturnType<typeof processHypotactic>;

  beforeAll(() => {
    works = processHypotactic();
  });

  test("processes Book / Line work correctly", async () => {
    const work = works[2];
    expect(work.info.title).toBe("Metamorphoses");
    expect(work.info.author).toBe("P. Ovidius Naso");

    // The fake data has 2 books of 2 lines each.
    expect(work.pages).toHaveLength(2);
    expect(work.rows).toHaveLength(4);
    expect(work.rows[0][0]).toEqual(["1", "1"]);
    expect(work.rows[1][0]).toEqual(["1", "2"]);
    expect(work.rows[2][0]).toEqual(["2", "1"]);
    expect(work.rows[3][0]).toEqual(["2", "2"]);
  });

  test("processes Book / Poem / Line work correctly", async () => {
    const work = works[1];
    expect(work.info.title).toBe("Odes");
    expect(work.info.author).toBe("Horace");

    // The fake data has 1 book with 2 poems, each with 1 line.
    expect(work.pages).toHaveLength(2);
    expect(work.rows).toHaveLength(2);
    expect(work.rows[0][0]).toEqual(["1", "1", "1"]);
    expect(work.rows[1][0]).toEqual(["1", "2", "1"]);
    expect(work.textParts).toEqual(["book", "poem", "line"]);
  });

  test("processes Book / Poem / Line work with `poems` subsections correctly", async () => {
    const work = works[0];
    expect(work.info.author).toBe("Calpurnius Siculus");
    expect(work.info.title).toBe("Eclogues");

    // The fake data has 2 poems each with 2 lines
    expect(work.pages).toHaveLength(2);
    expect(work.rows).toHaveLength(4);
    expect(work.rows[0][0]).toEqual(["1", "1"]);
    expect(work.rows[1][0]).toEqual(["1", "2"]);
    expect(work.rows[2][0]).toEqual(["2", "1"]);
    expect(work.rows[3][0]).toEqual(["2", "2"]);
    expect(work.textParts).toEqual(["poem", "line"]);
  });
});

describe("Hypotactic Library Processing with duplicate poem numbers", () => {
  const originalRoot = process.env.HYPOTACTIC_ROOT;
  let testDataRoot: string;

  beforeAll(() => {
    testDataRoot = fs.mkdtempSync("hypotactic-dup-testdata-");
    process.env.HYPOTACTIC_ROOT = testDataRoot;
    // The Odes fixture has one book with poems "1" and "2"; relabel the
    // second as "1", as the upstream data once did for Tristia 1.8.
    const horace = JSON.parse(
      fs.readFileSync("testdata/hypotactic/horace.json", "utf8")
    );
    horace["Horace"]["Odes"]["Odes 1"][1]["poem number"] = "1";
    fs.writeFileSync(
      path.join(testDataRoot, "horace.json.gz"),
      zlib.gzipSync(JSON.stringify(horace))
    );
  });

  afterAll(() => {
    process.env.HYPOTACTIC_ROOT = originalRoot;
    fs.rmSync(testDataRoot, { recursive: true, force: true });
  });

  test("rejects a work whose poems share an id", () => {
    expect(() => processHypotactic()).toThrow(/Duplicate page id 1\.1/);
  });
});
