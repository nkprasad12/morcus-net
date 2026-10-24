import fs from "fs";
import os from "os";
import path from "path";

import type { WorkFingerprint } from "@/common/library/audit/audit_types";
import type { SurveyResult, WorkSurvey } from "@/scripts/library/survey";
import { surveyMarkdown } from "@/scripts/library/survey";
import {
  CENSUS_SNAPSHOT_FILE,
  MANIFEST_FILE,
  censusSnapshot,
  fingerprintManifest,
  writeAuditFiles,
} from "@/scripts/library/survey_snapshot";

const SOURCE = { repo: "canonical-latinLit", commit: "abc", dirty: false };

function fingerprint(rows: number): WorkFingerprint {
  return {
    textParts: ["section"],
    rows,
    pages: 1,
    citableRows: rows,
    firstCitation: "1",
    lastCitation: String(rows),
    notes: 0,
    nodes: { span: rows },
  };
}

function work(workId: string, onboarded: boolean, ok: boolean): WorkSurvey {
  return {
    workId,
    path: `data/${workId}.xml`,
    scope: "perseus-lat",
    onboarded,
    bytes: 10,
    v1: ok
      ? { ok, category: "OK", detail: "" }
      : { ok, category: "other: x", detail: "x" },
    fingerprint: ok ? fingerprint(2) : undefined,
    checks: ok
      ? {
          hasCitableRow: true,
          arityOk: true,
          pagesOrdered: true,
          rowsOutsidePages: 0,
        }
      : undefined,
  };
}

function census(onboarded: boolean) {
  return {
    path: "p",
    onboarded,
    elements: ["p"],
    noteElements: [],
    rends: [],
    noteRends: [],
    attrs: [],
    noteAttrs: [],
  };
}

const RESULT: SurveyResult = {
  root: "/corpus",
  works: [work("b", true, true), work("a", true, true), work("c", false, true)],
  census: { b: census(true), c: census(false), a: census(true) },
};

describe("censusSnapshot", () => {
  it("sorts works by id and keeps all of them", () => {
    const snapshot = censusSnapshot(RESULT, SOURCE);
    expect(snapshot.schema).toBe(1);
    expect(snapshot.source).toEqual(SOURCE);
    expect(Object.keys(snapshot.works)).toEqual(["a", "b", "c"]);
    expect(snapshot.works.c.onboarded).toBe(false);
  });
});

describe("fingerprintManifest", () => {
  it("keeps only onboarded works that processed, sorted", () => {
    const result: SurveyResult = {
      ...RESULT,
      works: [...RESULT.works, work("d", true, false)],
    };
    const manifest = fingerprintManifest(result, SOURCE);
    expect(Object.keys(manifest.works)).toEqual(["a", "b"]);
    expect(manifest.works.a).toEqual(fingerprint(2));
  });
});

describe("writeAuditFiles", () => {
  it("writes stable JSON with a trailing newline", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-"));
    try {
      writeAuditFiles(RESULT, SOURCE, dir);
      const first = fs.readFileSync(
        path.join(dir, CENSUS_SNAPSHOT_FILE),
        "utf8"
      );
      writeAuditFiles(RESULT, SOURCE, dir);
      expect(
        fs.readFileSync(path.join(dir, CENSUS_SNAPSHOT_FILE), "utf8")
      ).toBe(first);
      expect(first.endsWith("}\n")).toBe(true);
      const manifest = JSON.parse(
        fs.readFileSync(path.join(dir, MANIFEST_FILE), "utf8")
      );
      expect(Object.keys(manifest.works)).toEqual(["a", "b"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("surveyMarkdown", () => {
  it("renders the status table", () => {
    const md = surveyMarkdown(RESULT, "label");
    expect(md).toContain("# Library survey: label");
    expect(md).toContain("| All surveyed | 3 | 3 |");
    expect(md).toContain("| Onboarded | 2 | 2 |");
  });
});
