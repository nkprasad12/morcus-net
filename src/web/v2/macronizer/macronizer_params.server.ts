import type {
  MacronizedConfidence,
  MacronizedResult,
} from "@/macronizer/macronizer_types";
import { MACRONIZER_MAX_CHARS } from "@/web/v2/macronizer/macronizer_slots.common";

export type MacronizeInputParseResult =
  | { kind: "ok"; text: string }
  | { kind: "empty"; text: string }
  | { kind: "too_long"; text: string; length: number };

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null;
}

function readStringField(record: Record<string, unknown>, key: string): string {
  const val = record[key];
  if (typeof val === "string") {
    return val;
  }
  if (Array.isArray(val) && typeof val[0] === "string") {
    return val[0];
  }
  return "";
}

/**
 * Parses and validates the `POST /macronizer` request body without trimming
 * leading/trailing whitespace from `text`. Line breaks are normalized to `\n`:
 * browsers submit form values with CRLF, but `maxlength` counts a line break
 * as one character.
 */
export function parseMacronizeBody(body: unknown): MacronizeInputParseResult {
  const record = isRecord(body) ? body : {};
  const text = readStringField(record, "text").replace(/\r\n?/g, "\n");
  if (text.trim().length === 0) {
    return { kind: "empty", text };
  }
  if (text.length > MACRONIZER_MAX_CHARS) {
    return { kind: "too_long", text, length: text.length };
  }
  return { kind: "ok", text };
}

export interface DecodedSuggestion {
  index: number;
  confidence: MacronizedConfidence;
}

const CONFIDENCE_TO_CODE: Record<MacronizedConfidence, string> = {
  weak: "w",
  tied: "t",
  confident: "c",
};

const CODE_TO_CONFIDENCE: Record<string, MacronizedConfidence | undefined> = {
  w: "weak",
  t: "tied",
  c: "confident",
};

/**
 * Encodes first-run POS-tagger suggestions as `N:k:c` joined by `,`.
 */
export function encodeSuggestions(result: MacronizedResult): string {
  const parts: string[] = [];
  let wordIndex = 0;
  for (const token of result) {
    if (typeof token === "string") {
      continue;
    }
    if (token.suggested !== undefined) {
      const code = CONFIDENCE_TO_CODE[token.confidence ?? "confident"];
      parts.push(`${wordIndex}:${token.suggested}:${code}`);
    }
    wordIndex++;
  }
  return parts.join(",");
}

const SUGGESTION_RE = /^(\d+):(\d+):([wtc])$/;

/**
 * Decodes `sug` (`N:k:c,...`) into a map keyed by word index `N`.
 * Malformed entries are silently ignored.
 */
export function decodeSuggestions(raw: string): Map<number, DecodedSuggestion> {
  const map = new Map<number, DecodedSuggestion>();
  if (!raw) {
    return map;
  }
  for (const entry of raw.split(",")) {
    if (!entry) continue;
    const match = SUGGESTION_RE.exec(entry);
    if (match === null) continue;
    const confidence = CODE_TO_CONFIDENCE[match[3]];
    if (!confidence) continue;
    map.set(Number(match[1]), { index: Number(match[2]), confidence });
  }
  return map;
}

export type PriorShownEntry =
  | { kind: "chosen"; optionIndex: number }
  | { kind: "edited"; longPositions: Set<number> };

/**
 * Encodes prior Apply decisions (`N:c:k` or `N:e:p1.p2`) for the hidden `shown`
 * field so subsequent Apply submissions know the pre-render shown state.
 */
export function encodePriorShown(
  entries: ReadonlyMap<number, PriorShownEntry>
): string {
  const parts: string[] = [];
  for (const [n, entry] of entries) {
    if (entry.kind === "chosen") {
      parts.push(`${n}:c:${entry.optionIndex}`);
    } else {
      const positions = Array.from(entry.longPositions)
        .sort((a, b) => a - b)
        .join(".");
      parts.push(`${n}:e:${positions}`);
    }
  }
  return parts.join(",");
}

/**
 * Decodes the hidden `shown` field into a map keyed by word index `N`.
 * Malformed entries are silently ignored.
 */
export function decodePriorShown(raw: string): Map<number, PriorShownEntry> {
  const map = new Map<number, PriorShownEntry>();
  if (!raw) {
    return map;
  }
  for (const item of raw.split(",")) {
    if (!item) continue;
    const pieces = item.split(":");
    if (pieces.length !== 3) continue;
    const n = Number(pieces[0]);
    if (!Number.isInteger(n) || n < 0) continue;
    const mode = pieces[1];
    const payload = pieces[2];
    if (mode === "c") {
      const k = Number(payload);
      if (Number.isInteger(k) && k >= 0) {
        map.set(n, { kind: "chosen", optionIndex: k });
      }
    } else if (mode === "e") {
      const longPositions = new Set<number>();
      let valid = true;
      if (payload.length > 0) {
        for (const pStr of payload.split(".")) {
          const p = Number(pStr);
          if (!Number.isInteger(p) || p < 0) {
            valid = false;
            break;
          }
          longPositions.add(p);
        }
      }
      if (valid) {
        map.set(n, { kind: "edited", longPositions });
      }
    }
  }
  return map;
}

interface ParsedApplyParams {
  parseResult: MacronizeInputParseResult;
  suggestions: Map<number, DecodedSuggestion>;
  priorShown: Map<number, PriorShownEntry>;
  wordChoices: Map<number, number>;
  vowelSubmissions: Map<number, Set<number>>;
}

const WORD_FIELD_RE = /^w(\d+)$/;
const VOWEL_FIELD_RE = /^m(\d+)$/;

/**
 * Parses `POST /macronizer/apply` form fields (`text`, `sug`, `shown`, `wN`, `mN`).
 * Malformed indices or values are ignored rather than throwing.
 */
export function parseApplyBody(body: unknown): ParsedApplyParams {
  const parseResult = parseMacronizeBody(body);
  const record = isRecord(body) ? body : {};
  const suggestions = decodeSuggestions(readStringField(record, "sug"));
  const priorShown = decodePriorShown(readStringField(record, "shown"));
  const wordChoices = new Map<number, number>();
  const vowelSubmissions = new Map<number, Set<number>>();

  for (const [key, rawVal] of Object.entries(record)) {
    const wMatch = WORD_FIELD_RE.exec(key);
    if (wMatch) {
      const n = Number(wMatch[1]);
      let valStr = "";
      if (typeof rawVal === "string") {
        valStr = rawVal;
      } else if (Array.isArray(rawVal)) {
        const last: unknown = rawVal[rawVal.length - 1];
        if (typeof last === "string") {
          valStr = last;
        }
      }
      const k = Number(valStr);
      if (
        Number.isInteger(n) &&
        n >= 0 &&
        valStr !== "" &&
        Number.isInteger(k) &&
        k >= 0
      ) {
        wordChoices.set(n, k);
      }
      continue;
    }

    const mMatch = VOWEL_FIELD_RE.exec(key);
    if (mMatch) {
      const n = Number(mMatch[1]);
      if (!Number.isInteger(n) || n < 0) continue;
      const values = Array.isArray(rawVal) ? rawVal : [rawVal];
      const positions = new Set<number>();
      for (const v of values) {
        if (typeof v !== "string" || v === "") continue;
        const p = Number(v);
        if (Number.isInteger(p) && p >= 0) {
          positions.add(p);
        }
      }
      vowelSubmissions.set(n, positions);
    }
  }

  return {
    parseResult,
    suggestions,
    priorShown,
    wordChoices,
    vowelSubmissions,
  };
}
