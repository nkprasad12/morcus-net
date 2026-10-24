import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { SqliteDict } from "@/common/dictionaries/sqlite_backing";
import {
  buildCompletionsDb,
  openCompletionsDb,
} from "@/web/ui/dict/search/completions_db.server";

describe("completions_db.server", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "completions-db-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("builds 2-letter chunks across dictionaries including u/v and i/j variants", async () => {
    const lsDb = path.join(tmpDir, "ls.db");
    const gafDb = path.join(tmpDir, "gaf.db");
    const completionsDb = path.join(tmpDir, "completions.db");

    SqliteDict.save(
      [
        { id: "ls1", keys: ["amo", "amor"], entry: "amo" },
        { id: "ls2", keys: ["justus"], entry: "justus" },
      ],
      lsDb
    );
    SqliteDict.save(
      [
        { id: "gaf1", keys: ["ămō"], entry: "amo" },
        { id: "gaf2", keys: ["iūstus"], entry: "iustus" },
      ],
      gafDb
    );

    await buildCompletionsDb(
      completionsDb,
      new Map([
        [LatinDict.LewisAndShort.key, lsDb],
        [LatinDict.Gaffiot.key, gafDb],
      ])
    );

    const store = openCompletionsDb(completionsDb);
    expect(store).toBeDefined();
    try {
      const am = store!.get("am");
      expect(am).toBeDefined();
      expect(
        JSON.parse(zlib.brotliDecompressSync(am!.br).toString("utf8"))
      ).toEqual({
        "L&S": ["amo", "amor"],
        GAF: ["ămō"],
      });

      // Both "iu" and "ju" (and "iv" / "jv") are precomputed for Latin u/v & i/j equivalence.
      for (const prefix of ["iu", "ju", "iv", "jv"]) {
        const row = store!.get(prefix);
        expect(row).toBeDefined();
        expect(JSON.parse(zlib.gunzipSync(row!.gzip).toString("utf8"))).toEqual(
          {
            "L&S": ["justus"],
            GAF: ["iūstus"],
          }
        );
      }
    } finally {
      store?.close();
    }
  });
});
