import fs from "fs";
import os from "os";
import path from "path";
import { ArgumentParser } from "argparse";
import {
  pageFileStem,
  parseWorkList,
  renderLibrary,
  selectWorkPaths,
  workIdOfPath,
} from "@/scripts/library/render";
import { configureLibraryParser } from "@/scripts/library/library_cli";
import {
  ALL_SUPPORTED_WORKS,
  EnglishTranslations,
  LatinWorks,
} from "@/common/library/library_constants";

describe("selectWorkPaths", () => {
  it("defaults to every onboarded work", () => {
    expect(selectWorkPaths()).toEqual(ALL_SUPPORTED_WORKS);
  });

  it("adds the English translation of a requested work", () => {
    const ids = selectWorkPaths([LatinWorks.SALLUST_CATALINA1]).map(
      workIdOfPath
    );
    expect(ids.sort()).toEqual(
      [
        LatinWorks.SALLUST_CATALINA1,
        EnglishTranslations[LatinWorks.SALLUST_CATALINA1],
      ].sort()
    );
  });

  it("rejects works that are not onboarded", () => {
    expect(() => selectWorkPaths(["phi9999.phi001.perseus-lat1"])).toThrow(
      /Not onboarded/
    );
  });

  it("includes candidate works when includeCandidates is true", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "render-candidates-"));
    try {
      const candidateFile = path.join(
        tmp,
        "data",
        "phi9999",
        "phi001",
        "phi9999.phi001.perseus-lat1.xml"
      );
      fs.mkdirSync(path.dirname(candidateFile), { recursive: true });
      fs.writeFileSync(
        candidateFile,
        `<?xml version="1.0" encoding="UTF-8"?>
<TEI.2><teiHeader><fileDesc><titleStmt><title>Test</title><author>Author</author></titleStmt></fileDesc></teiHeader>
<text><body><div1 type="book" n="1"><p>Hello</p></div1></body></text></TEI.2>`
      );

      const allWithCandidates = selectWorkPaths(undefined, {
        root: tmp,
        includeCandidates: true,
      }).map(workIdOfPath);
      expect(allWithCandidates).toContain("phi9999.phi001.perseus-lat1");

      const filteredCandidate = selectWorkPaths(
        ["phi9999.phi001.perseus-lat1"],
        {
          root: tmp,
          includeCandidates: true,
        }
      ).map(workIdOfPath);
      expect(filteredCandidate).toEqual(["phi9999.phi001.perseus-lat1"]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("parses --include-candidates on the library render CLI", () => {
    const parser = new ArgumentParser();
    configureLibraryParser(parser);
    const parsed = parser.parse_args([
      "render",
      "--out",
      "/tmp/out",
      "--include-candidates",
    ]);
    expect(parsed.include_candidates).toBe(true);
  });

  it("renders passing candidates and records failing candidates in failures without throwing", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "render-cand-exec-"));
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      const rootDir = path.join(tmp, "root");
      const outDir = path.join(tmp, "out");
      const okFile = path.join(
        rootDir,
        "data",
        "phi9998",
        "phi001",
        "phi9998.phi001.perseus-lat1.xml"
      );
      const badFile = path.join(
        rootDir,
        "data",
        "phi9999",
        "phi001",
        "phi9999.phi001.perseus-lat1.xml"
      );
      fs.mkdirSync(path.dirname(okFile), { recursive: true });
      fs.mkdirSync(path.dirname(badFile), { recursive: true });
      fs.writeFileSync(
        okFile,
        `<?xml version="1.0" encoding="UTF-8"?>
<TEI.2>
  <teiHeader>
    <fileDesc>
      <titleStmt><title>Liber Test</title><author>Testor</author></titleStmt>
    </fileDesc>
    <encodingDesc>
      <refsDecl doctype="TEI.2">
        <state unit="book" />
        <state unit="section" />
      </refsDecl>
    </encodingDesc>
  </teiHeader>
  <text>
    <body>
      <div1 type="book" n="1">
        <div2 type="section" n="1"><p>Secunda verba.</p></div2>
      </div1>
    </body>
  </text>
</TEI.2>`
      );
      // Malformed/unsupported candidate without refsDecl or body structure that throws in processTei2
      fs.writeFileSync(
        badFile,
        `<?xml version="1.0" encoding="UTF-8"?>
<TEI.2><teiHeader><fileDesc><titleStmt><title>Bad</title></titleStmt></fileDesc></teiHeader><text><body></body></text></TEI.2>`
      );

      const res = renderLibrary({
        root: rootDir,
        out: outDir,
        label: "cand-test",
        works: ["phi9998.phi001.perseus-lat1", "phi9999.phi001.perseus-lat1"],
        includeCandidates: true,
        quiet: true,
      });
      expect(res.index.works["phi9998.phi001.perseus-lat1"]).toBeDefined();
      expect(res.index.failures["phi9999.phi001.perseus-lat1"]).toBeDefined();
    } finally {
      logSpy.mockRestore();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("pageFileStem", () => {
  it("keeps ordinary ids and escapes unsafe characters", () => {
    expect(pageFileStem("1.pr")).toBe("1.pr");
    expect(pageFileStem("a/b c")).toBe("a%2fb%20c");
    expect(pageFileStem("")).toBe("_root");
  });
});

describe("parseWorkList", () => {
  it("splits and trims", () => {
    expect(parseWorkList(" a, b ,,")).toEqual(["a", "b"]);
    expect(parseWorkList(undefined)).toBeUndefined();
    expect(parseWorkList(",")).toBeUndefined();
  });
});
