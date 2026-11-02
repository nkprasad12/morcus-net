import { fail } from "@/scripts/thelatinlibrary/converters/page";

export interface SequentialSplitOptions {
  label: string;
  markerPattern?: RegExp;
  /** Whether multiple markers may appear inside a single `<p>` (e.g. Declamations 9 & 17). */
  allowInlineSplits?: boolean;
  /** Text before `[1]` becomes section `"pr"` when true. */
  allowLeadingPr?: boolean;
  /** Parses the captured marker string into a 1-based section number (defaults to `Number`). */
  parseMarkerValue?: (raw: string) => number | undefined;
  /**
   * When true in inline mode, a regex match whose number is not `expected` is
   * left in the text (e.g. Roman numerals like `V. milia` in Justin) instead of
   * failing.
   */
  ignoreOutOfOrderInline?: boolean;
}

const DEFAULT_INLINE_MARKER = /\[\s*(\d+)\s*\]/g;
const DEFAULT_LEADING_MARKER = /^\[\s*(\d+)\s*\]\s*/;

function capturedValue(match: RegExpExecArray): string {
  for (let i = 1; i < match.length; i++) {
    if (match[i] !== undefined) return match[i];
  }
  return match[0];
}

/**
 * Splits a page's paragraphs at sequential section markers `1, 2, 3, ...`.
 * Throws `ConversionError` if markers are missing, out of order, or produce
 * empty sections.
 */
export function splitAtSequentialMarkers(
  paragraphs: readonly string[],
  options: SequentialSplitOptions
): [sectionId: string, text: string][] {
  const {
    label,
    allowInlineSplits = false,
    allowLeadingPr = false,
    parseMarkerValue = (raw: string) => {
      const n = Number(raw);
      return Number.isInteger(n) && n > 0 ? n : undefined;
    },
    ignoreOutOfOrderInline = false,
  } = options;

  if (!allowInlineSplits) {
    const pattern = options.markerPattern ?? DEFAULT_LEADING_MARKER;
    const rows: [string, string][] = [];
    let expected = 1;
    for (const p of paragraphs) {
      const m = pattern.exec(p);
      if (m !== null) {
        const raw = capturedValue(m);
        const n = parseMarkerValue(raw);
        if (n !== expected) {
          fail(
            `${label}: marker [${raw}] found where [${expected}] was expected (out of order).`
          );
        }
        const body = p.slice(m[0].length).trim();
        if (body.length === 0) {
          fail(`${label}: empty section ${n}.`);
        }
        rows.push([String(n), body]);
        expected += 1;
        continue;
      }
      if (expected === 1 && allowLeadingPr) {
        if (rows.some(([id]) => id === "pr")) {
          fail(`${label}: more than one unnumbered paragraph before [1].`);
        }
        const body = p.trim();
        if (body.length === 0) {
          fail(`${label}: empty preamble.`);
        }
        rows.push(["pr", body]);
        continue;
      }
      fail(
        `${label}: unnumbered paragraph '${p.slice(
          0,
          60
        )}' where [${expected}] was expected.`
      );
    }
    if (expected === 1) {
      fail(`${label}: no sections found.`);
    }
    return rows;
  }

  // Inline mode: join paragraphs with single spaces and split at sequential markers.
  const basePattern = options.markerPattern ?? DEFAULT_INLINE_MARKER;
  const flags = basePattern.flags.includes("g")
    ? basePattern.flags
    : `${basePattern.flags}g`;
  const pattern = new RegExp(basePattern.source, flags);

  const stream = paragraphs.join(" ");
  const rows: [string, string][] = [];
  let expected = 1;
  let cursor = 0;
  let currentId: string | undefined = undefined;

  const flush = (end: number) => {
    const text = stream.slice(cursor, end).trim();
    if (currentId === undefined) {
      if (text.length === 0) return;
      if (!allowLeadingPr) {
        fail(`${label}: text before [1]: '${text.slice(0, 60)}'`);
      }
      rows.push(["pr", text]);
    } else {
      if (text.length === 0) {
        fail(`${label}: empty section ${currentId}.`);
      }
      rows.push([currentId, text]);
    }
  };

  for (const m of stream.matchAll(pattern)) {
    const raw = capturedValue(m);
    const n = parseMarkerValue(raw);
    if (n !== expected) {
      if (ignoreOutOfOrderInline) continue;
      fail(
        `${label}: marker [${raw}] found where [${expected}] was expected (out of order).`
      );
    }
    flush(m.index);
    currentId = String(n);
    cursor = m.index + m[0].length;
    expected += 1;
  }

  if (currentId === undefined) {
    fail(`${label}: no sections found.`);
  }
  flush(stream.length);
  return rows;
}
