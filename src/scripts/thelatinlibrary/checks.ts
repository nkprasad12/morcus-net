import {
  rowPlainText,
  type TheLatinLibraryWork,
} from "@/common/library/process_thelatinlibrary";
import { normalizeSpace, wordTokens } from "@/scripts/thelatinlibrary/html";
import { fail } from "@/scripts/thelatinlibrary/page";

/**
 * Verifies that `ids` (ignoring an optional leading `"pr"` or `"thema"`)
 * are `"1"`, `"2"`, ..., `String(n)` in strict sequential order.
 */
export function checkSequentialIds(
  ids: readonly string[],
  label: string
): void {
  let expected = 1;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (i === 0 && (id === "pr" || id === "thema")) continue;
    if (id !== String(expected)) {
      fail(`${label}: expected section '${expected}', found '${id}'.`);
    }
    expected += 1;
  }
}

/** Pages whose text names a modern edition, copyright or permission. */
const PROVENANCE_PATTERNS: RegExp[] = [
  /\bedited by\b/i,
  /\bedition\b/i,
  // Not `ed. <Name>`: legal texts cite "ad ed." (ad edictum) constantly.
  /\bherausgegeben\b/i,
  /\bcopyright\b/i,
  /©/,
  /\bpermission\b/i,
  /\btranscribed by\b/i,
  /\bsubmitted by\b/i,
  /\btext (?:is )?(?:taken )?from\b/i,
];

/** Returns the provenance statements found in the page text, if any. */
export function findProvenanceStatements(bodyText: string): string[] {
  const hits: string[] = [];
  for (const pattern of PROVENANCE_PATTERNS) {
    const m = pattern.exec(bodyText);
    if (m !== null) {
      const start = Math.max(0, m.index - 60);
      hits.push(normalizeSpace(bodyText.slice(start, m.index + 100)));
    }
  }
  return hits;
}

/** Comparable word tokens: no diacritics, u/v and i/j merged, numbers dropped. */
function normalizeForCompare(text: string): string[] {
  return wordTokens(text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase())
    .filter((t) => !/^\d+$/.test(t))
    .map((t) => t.replace(/j/g, "i").replace(/v/g, "u"));
}

function shingles(tokens: string[], k = 5): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + k <= tokens.length; i++) {
    out.add(tokens.slice(i, i + k).join(" "));
  }
  return out;
}

/**
 * 5-word shingle overlap between our rows and an independent copy of the
 * same text (e.g. the CLTK plain-text dump). Returns the share of our
 * shingles found in the reference, and vice versa. Our shingles are taken
 * within each row, so windows spanning a chapter boundary (where the
 * reference has a marker like "[ 12 ]") don't count against us.
 */
export function crossCheck(
  rows: TheLatinLibraryWork["rows"],
  referenceText: string
): { oursInRef: number; refInOurs: number } {
  const ours = new Set<string>();
  for (const [, text] of rows) {
    shingles(normalizeForCompare(rowPlainText(text))).forEach((s) =>
      ours.add(s)
    );
  }
  const ref = shingles(normalizeForCompare(referenceText));
  let a = 0;
  for (const s of ours) if (ref.has(s)) a++;
  let b = 0;
  for (const s of ref) if (ours.has(s)) b++;
  return {
    oursInRef: ours.size === 0 ? 0 : a / ours.size,
    refInOurs: ref.size === 0 ? 0 : b / ref.size,
  };
}
