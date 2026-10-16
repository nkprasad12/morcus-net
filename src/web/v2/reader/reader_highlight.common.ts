const LIST_SEPARATOR = "__";
const TUPLE_SEPARATOR = "~";

export interface TextHighlightRange {
  readonly start: number;
  readonly end: number;
}

export interface TextHighlight extends TextHighlightRange {
  readonly id: string;
}

function parseSafeInt(input: string | undefined): number | undefined {
  if (input === undefined || !/^-?\d+$/.test(input)) {
    return undefined;
  }
  return Number.parseInt(input, 10);
}

export function textHighlightParams(
  highlights: readonly TextHighlight[]
): Record<string, string> {
  const chunks: string[] = [];
  for (const hl of highlights) {
    chunks.push(
      `${hl.id}${TUPLE_SEPARATOR}${hl.start}${TUPLE_SEPARATOR}${hl.end}`
    );
  }
  return { matchText: chunks.join(LIST_SEPARATOR) };
}

function parseSingleHighlight(input: string): TextHighlight | undefined {
  const parts = input.split(TUPLE_SEPARATOR);
  if (parts.length !== 3) {
    return undefined;
  }
  const id = parts[0].trim();
  if (!id) {
    return undefined;
  }
  const start = parseSafeInt(parts[1]);
  if (start === undefined) {
    return undefined;
  }
  const end = parseSafeInt(parts[2]);
  if (end === undefined) {
    return undefined;
  }
  return { id, start, end };
}

/**
 * Parses the `matchText` query parameter (`id~start~end__id2~start2~end2`)
 * into a per-section map of `[start, end)` word token ranges.
 *
 * Returns `undefined` when `raw` is empty or if any chunk is malformed,
 * matching V1 `useTextHighlights` semantics.
 */
export function parseTextHighlights(
  raw?: string
): Map<string, TextHighlightRange[]> | undefined {
  const input = raw?.trim();
  if (!input) {
    return undefined;
  }
  const map = new Map<string, TextHighlightRange[]>();
  for (const chunk of input.split(LIST_SEPARATOR)) {
    const hl = parseSingleHighlight(chunk);
    if (hl === undefined) {
      return undefined;
    }
    const existing = map.get(hl.id);
    if (existing) {
      existing.push({ start: hl.start, end: hl.end });
    } else {
      map.set(hl.id, [{ start: hl.start, end: hl.end }]);
    }
  }
  return map.size > 0 ? map : undefined;
}

/**
 * Extracts the first section ID from a valid `matchText` query parameter so
 * server routes can resolve the target page when `:page` or `id` is omitted.
 */
export function getFirstHighlightSectionId(raw?: string): string | undefined {
  const map = parseTextHighlights(raw);
  if (!map) {
    return undefined;
  }
  const first = map.keys().next();
  return first.done ? undefined : first.value;
}

/**
 * Checks whether a 0-based word index within a section falls inside any
 * `[start, end)` highlight range for that section.
 */
export function isWordIndexHighlighted(
  wordIndex: number,
  ranges?: readonly TextHighlightRange[]
): boolean {
  if (!ranges || ranges.length === 0) {
    return false;
  }
  return ranges.some((hl) => hl.start <= wordIndex && wordIndex < hl.end);
}
