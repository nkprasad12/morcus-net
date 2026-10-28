import fs from "fs";
import path from "path";

import {
  AUDIT_SCHEMA_VERSION,
  type CensusSnapshot,
  type WorkCensus,
} from "@/common/library/audit/audit_types";
import { allRendTokensIn, isKnownRend } from "@/common/library/perseus_rends";
import {
  CONTENT_ELEMENT_ALLOWLIST,
  KNOWN_NOTE_REND,
  NOTE_ELEMENT_ALLOWLIST,
  SWITCH_CONTENT_NODES,
  processRowContent,
  transformContentNode,
  transformNoteNode,
} from "@/common/library/process_work";
import { XmlNode } from "@/common/xml/xml_node";

const SNAPSHOT_PATH = path.resolve(__dirname, "census_snapshot.json");

/**
 * Corpus-census ratchet exclusion list.
 *
 * Every Perseus work in `census_snapshot.json` NOT listed in
 * `NOT_YET_ONBOARDED` must use only TEI elements and `rend` values accepted by
 * the production allowlists (`CONTENT_ELEMENT_ALLOWLIST`,
 * `NOTE_ELEMENT_ALLOWLIST`, `isKnownRend`, `KNOWN_NOTE_REND`).
 *
 * Ratchet rules:
 * 1. No onboarded work (`onboarded: true`) may appear in `NOT_YET_ONBOARDED`.
 * 2. When markup support is expanded so a work in `NOT_YET_ONBOARDED` no longer
 *    has unhandled markup (or when upstream deletes a file), the test fails
 *    until that work ID is removed from `NOT_YET_ONBOARDED`. This list must
 *    only shrink over time unless an upstream sync introduces new un-onboarded
 *    files that are explicitly triaged.
 */
export const NOT_YET_ONBOARDED: readonly string[] = [
  "phi0119.phi001.perseus-lat2",
  "phi0119.phi002.perseus-lat2",
  "phi0119.phi003.perseus-lat2",
  "phi0119.phi004.perseus-lat2",
  "phi0119.phi005.perseus-lat2",
  "phi0119.phi006.perseus-lat2",
  "phi0119.phi007.perseus-lat2",
  "phi0119.phi008.perseus-lat2",
  "phi0119.phi009.perseus-lat2",
  "phi0119.phi010.perseus-lat2",
  "phi0119.phi011.perseus-lat2",
  "phi0119.phi012.perseus-lat2",
  "phi0119.phi013.perseus-lat2",
  "phi0119.phi014.perseus-lat2",
  "phi0119.phi015.perseus-lat2",
  "phi0119.phi016.perseus-lat2",
  "phi0119.phi017.perseus-lat2",
  "phi0119.phi018.perseus-lat2",
  "phi0119.phi019.perseus-lat2",
  "phi0119.phi020.perseus-lat2",
  "phi0134.phi001.perseus-lat2",
  "phi0134.phi002.perseus-lat2",
  "phi0134.phi003.perseus-lat2",
  "phi0134.phi004.perseus-lat2",
  "phi0134.phi005.perseus-lat2",
  "phi0134.phi006.perseus-lat2",
  "phi0474.phi053.perseus-lat4",
  "phi0690.phi001.perseus-lat2",
  "phi0836.phi002.perseus-lat5",
  "phi0836.phi002.perseus-lat6",
  "phi1014.phi003.perseus-lat1",
  "phi1017.phi001.perseus-lat2",
  "phi1017.phi002.perseus-lat2",
  "phi1017.phi003.perseus-lat2",
  "phi1017.phi004.perseus-lat2",
  "phi1017.phi005.perseus-lat2",
  "phi1017.phi006.perseus-lat2",
  "phi1017.phi007.perseus-lat2",
  "phi1017.phi008.perseus-lat2",
  "phi1017.phi009.perseus-lat2",
  "phi1017.phi010.perseus-lat2",
  "phi1348.abo011.perseus-lat2",
  "stoa0054.stoa006.perseus-lat1",
];

export interface WorkMarkupViolations {
  workId: string;
  unhandledContentElements: string[];
  unhandledNoteElements: string[];
  unknownRends: string[];
  unknownNoteRends: string[];
}

export interface CensusRatchetReport {
  passed: boolean;
  violations: WorkMarkupViolations[];
  onboardedInExclusionList: string[];
  missingFromSnapshot: string[];
  staleExclusions: string[];
}

function splitElemAttr(entry: string): [string, string] {
  const at = entry.indexOf("@");
  return at === -1 ? [entry, ""] : [entry.slice(0, at), entry.slice(at + 1)];
}

/**
 * Checks whether a `noteRends` census entry (`element@rend`) is accepted by
 * `transformNoteNode`: `<lb>` and `<gap>` return before the `KNOWN_NOTE_REND`
 * assertion (e.g. `<gap rend=". . . ."/>` in `stoa0023.stoa001.perseus-lat2`),
 * while all other note elements must satisfy `KNOWN_NOTE_REND`.
 */
function isAcceptedNoteRendEntry(entry: string): boolean {
  const [elem, rend] = splitElemAttr(entry);
  if (elem === "lb" || (elem === "gap" && isKnownRend(rend))) {
    return true;
  }
  return allRendTokensIn(rend, KNOWN_NOTE_REND);
}

export function findWorkViolations(
  workId: string,
  work: WorkCensus
): WorkMarkupViolations | null {
  const unhandledContentElements = work.elements.filter(
    (el) => !CONTENT_ELEMENT_ALLOWLIST.has(el)
  );
  const unhandledNoteElements = work.noteElements.filter(
    (el) => !NOTE_ELEMENT_ALLOWLIST.has(el)
  );
  const unknownRends = work.rends.filter((entry) => {
    const [, rend] = splitElemAttr(entry);
    return !isKnownRend(rend);
  });
  const unknownNoteRends = work.noteRends.filter(
    (entry) => !isAcceptedNoteRendEntry(entry)
  );
  if (
    unhandledContentElements.length === 0 &&
    unhandledNoteElements.length === 0 &&
    unknownRends.length === 0 &&
    unknownNoteRends.length === 0
  ) {
    return null;
  }
  return {
    workId,
    unhandledContentElements,
    unhandledNoteElements,
    unknownRends,
    unknownNoteRends,
  };
}

export function evaluateCensusRatchet(
  snapshot: CensusSnapshot,
  excludedWorkIds: readonly string[] = NOT_YET_ONBOARDED
): CensusRatchetReport {
  const excludedSet = new Set(excludedWorkIds);
  const violations: WorkMarkupViolations[] = [];
  const onboardedInExclusionList: string[] = [];
  const missingFromSnapshot: string[] = [];
  const staleExclusions: string[] = [];

  for (const id of excludedWorkIds) {
    const work = snapshot.works[id];
    if (!work) {
      missingFromSnapshot.push(id);
      continue;
    }
    if (work.onboarded) {
      onboardedInExclusionList.push(id);
      continue;
    }
    if (findWorkViolations(id, work) === null) {
      staleExclusions.push(id);
    }
  }

  for (const [workId, work] of Object.entries(snapshot.works)) {
    if (excludedSet.has(workId)) {
      continue;
    }
    const v = findWorkViolations(workId, work);
    if (v !== null) {
      violations.push(v);
    }
  }

  const passed =
    violations.length === 0 &&
    onboardedInExclusionList.length === 0 &&
    missingFromSnapshot.length === 0 &&
    staleExclusions.length === 0;

  return {
    passed,
    violations,
    onboardedInExclusionList,
    missingFromSnapshot,
    staleExclusions,
  };
}

export function formatCensusRatchetReport(report: CensusRatchetReport): string {
  if (report.passed) return "";
  const lines: string[] = ["Corpus census ratchet check failed:"];
  if (report.violations.length > 0) {
    lines.push(
      `  Unhandled markup in ${report.violations.length} non-excluded work(s):`
    );
    for (const v of report.violations) {
      const items = [
        ...v.unhandledContentElements.map((e) => `<${e}>`),
        ...v.unhandledNoteElements.map((e) => `note:<${e}>`),
        ...v.unknownRends.map((r) => `rend:${r}`),
        ...v.unknownNoteRends.map((r) => `note-rend:${r}`),
      ];
      lines.push(`    - ${v.workId}: ${items.join(", ")}`);
    }
  }
  if (report.onboardedInExclusionList.length > 0) {
    lines.push(
      `  Onboarded work(s) must not appear in NOT_YET_ONBOARDED: ${report.onboardedInExclusionList.join(
        ", "
      )}`
    );
  }
  if (report.missingFromSnapshot.length > 0) {
    lines.push(
      `  Work(s) in NOT_YET_ONBOARDED missing from census_snapshot.json: ${report.missingFromSnapshot.join(
        ", "
      )}`
    );
  }
  if (report.staleExclusions.length > 0) {
    lines.push(
      `  Stale NOT_YET_ONBOARDED entries (now pass all markup allowlists — remove them): ${report.staleExclusions.join(
        ", "
      )}`
    );
  }
  return lines.join("\n");
}

describe("process_work allowlist consistency", () => {
  it("handles every element in SWITCH_CONTENT_NODES in transformContentNode's switch", () => {
    for (const name of SWITCH_CONTENT_NODES) {
      const children = name === "gap" || name === "lb" ? [] : ["Samplecontent"];
      const parent =
        name === "corr" || name === "abbr"
          ? new XmlNode("choice", [], [])
          : undefined;
      const node = new XmlNode(name, [], children);
      expect(() => transformContentNode(node, children, parent)).not.toThrow();
    }
  });

  it("handles every non-skipped element in CONTENT_ELEMENT_ALLOWLIST via processRowContent", () => {
    const preprocessOnly = new Set([
      "#comment",
      "pb",
      "milestone",
      "headLabel",
      "item",
    ]);
    for (const name of CONTENT_ELEMENT_ALLOWLIST) {
      if (preprocessOnly.has(name)) continue;
      let node: XmlNode;
      let parent: XmlNode | undefined;
      if (name === "list") {
        node = new XmlNode(
          "list",
          [["type", "simple"]],
          [
            new XmlNode("headLabel", [], ["Heading"]),
            new XmlNode("label", [], ["I"]),
            new XmlNode("item", [], [new XmlNode("date", [], ["Id. Mart."])]),
          ]
        );
      } else if (name === "choice") {
        node = new XmlNode(
          "choice",
          [],
          [new XmlNode("reg", [], ["recte"]), new XmlNode("orig", [], ["male"])]
        );
      } else if (name === "note") {
        node = new XmlNode("note", [["noteId", "0"]], []);
      } else if (name === "gap" || name === "lb") {
        node = new XmlNode(name, [], []);
      } else {
        if (name === "corr" || name === "abbr") {
          parent = new XmlNode("choice", [], []);
        }
        node = new XmlNode(name, [], ["Textus"]);
      }
      expect(() => processRowContent(node, parent)).not.toThrow();
    }
  });

  it("rejects unknown content elements in transformContentNode", () => {
    const unknown = new XmlNode("unknownElement", [], ["text"]);
    expect(() => transformContentNode(unknown, ["text"])).toThrow(
      "Unknown node: unknownElement"
    );
  });

  it("handles every element in NOTE_ELEMENT_ALLOWLIST via transformNoteNode", () => {
    for (const name of NOTE_ELEMENT_ALLOWLIST) {
      const node = new XmlNode(name, [], name === "figure" ? [] : ["note text"]);
      expect(() => transformNoteNode(node)).not.toThrow();
    }
  });

  it("rejects unknown note elements in transformNoteNode", () => {
    const unknown = new XmlNode("unknownNoteElement", [], ["text"]);
    expect(() => transformNoteNode(unknown)).toThrow("unknownNoteElement");
  });
});

describe("evaluateCensusRatchet on synthetic fixtures", () => {
  const cleanWork: WorkCensus = {
    path: "data/phi0448/phi001/phi0448.phi001.perseus-lat1.xml",
    onboarded: true,
    elements: ["body", "div", "p", "hi", "note"],
    noteElements: ["hi", "foreign"],
    rends: ["hi@italic", "p@indent"],
    noteRends: ["hi@italic"],
    attrs: ["div@n", "div@subtype", "div@type"],
    noteAttrs: ["foreign@xml:lang"],
  };

  function makeFixture(works: Record<string, WorkCensus>): CensusSnapshot {
    return {
      schema: AUDIT_SCHEMA_VERSION,
      source: { repo: "canonical-latinLit", commit: "deadbeef", dirty: false },
      works,
    };
  }

  it("passes when all non-excluded works use allowlisted markup", () => {
    const snapshot = makeFixture({
      "clean.work": cleanWork,
      "excluded.work": {
        ...cleanWork,
        onboarded: false,
        elements: [...cleanWork.elements, "sp", "speaker"],
      },
    });
    const report = evaluateCensusRatchet(snapshot, ["excluded.work"]);
    expect(report.passed).toBe(true);
    expect(formatCensusRatchetReport(report)).toBe("");
  });

  it("fails and names offending work ids and items on unknown elements or rends", () => {
    const snapshot = makeFixture({
      "bad.work": {
        ...cleanWork,
        onboarded: false,
        elements: ["div", "speaker"],
        noteElements: ["hi", "stage"],
        rends: ["p@inddent"],
        noteRends: ["hi@unknownNoteRend"],
      },
    });
    const report = evaluateCensusRatchet(snapshot, []);
    expect(report.passed).toBe(false);
    const msg = formatCensusRatchetReport(report);
    expect(msg).toContain("bad.work");
    expect(msg).toContain("<speaker>");
    expect(msg).toContain("note:<stage>");
    expect(msg).toContain("rend:p@inddent");
    expect(msg).toContain("note-rend:hi@unknownNoteRend");
  });

  it("fails when an onboarded work is placed in NOT_YET_ONBOARDED or an exclusion is stale", () => {
    const snapshot = makeFixture({
      "onboarded.work": cleanWork,
      "now.clean.work": { ...cleanWork, onboarded: false },
    });
    const report = evaluateCensusRatchet(snapshot, [
      "onboarded.work",
      "now.clean.work",
      "deleted.work",
    ]);
    expect(report.passed).toBe(false);
    expect(report.onboardedInExclusionList).toEqual(["onboarded.work"]);
    expect(report.staleExclusions).toEqual(["now.clean.work"]);
    expect(report.missingFromSnapshot).toEqual(["deleted.work"]);
  });
});

describe("corpus census ratchet against census_snapshot.json", () => {
  it("verifies every non-excluded work in census_snapshot.json uses only allowlisted markup", () => {
    const raw = fs.readFileSync(SNAPSHOT_PATH, "utf8");
    const snapshot: CensusSnapshot = JSON.parse(raw);
    expect(snapshot.schema).toBe(AUDIT_SCHEMA_VERSION);

    const report = evaluateCensusRatchet(snapshot, NOT_YET_ONBOARDED);
    if (!report.passed) {
      throw new Error(formatCensusRatchetReport(report));
    }
    expect(report.passed).toBe(true);
  });
});
