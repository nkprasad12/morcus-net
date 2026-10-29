/**
 * Builds and writes the checked-in audit files under
 * `src/common/library/audit/` from a survey result.
 */

import fs from "fs";
import path from "path";

import {
  AUDIT_SCHEMA_VERSION,
  type AuditSource,
  type CensusSnapshot,
  type FingerprintManifest,
  type WorkCensus,
  type WorkFingerprint,
} from "@/common/library/audit/audit_types";
import type { SurveyResult } from "@/scripts/library/survey";

export const AUDIT_DIR = "src/common/library/audit";
export const CENSUS_SNAPSHOT_FILE = "census_snapshot.json";
export const MANIFEST_FILE = "manifest.json";

function sortedRecord<T>(entries: [string, T][]): Record<string, T> {
  return Object.fromEntries(
    entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  );
}

export function censusSnapshot(
  result: SurveyResult,
  source: AuditSource
): CensusSnapshot {
  return {
    schema: AUDIT_SCHEMA_VERSION,
    source,
    works: sortedRecord<WorkCensus>(Object.entries(result.census)),
  };
}

/** Fingerprints of the onboarded works that V1 processes. */
export function fingerprintManifest(
  result: SurveyResult,
  source: AuditSource
): FingerprintManifest {
  const entries: [string, WorkFingerprint][] = [];
  for (const w of result.works) {
    if (w.onboarded && w.fingerprint !== undefined) {
      entries.push([w.workId, w.fingerprint]);
    }
  }
  return {
    schema: AUDIT_SCHEMA_VERSION,
    source,
    works: sortedRecord(entries),
  };
}

/** Stable JSON: two-space indent, trailing newline. */
export function toJson(value: unknown): string {
  return JSON.stringify(value, undefined, 2) + "\n";
}

/** Writes both audit files into `dir`; returns the paths written. */
export function writeAuditFiles(
  result: SurveyResult,
  source: AuditSource,
  dir: string = AUDIT_DIR
): string[] {
  fs.mkdirSync(dir, { recursive: true });
  const censusPath = path.join(dir, CENSUS_SNAPSHOT_FILE);
  const manifestPath = path.join(dir, MANIFEST_FILE);
  fs.writeFileSync(censusPath, toJson(censusSnapshot(result, source)));
  fs.writeFileSync(manifestPath, toJson(fingerprintManifest(result, source)));
  return [censusPath, manifestPath];
}
