import { useMemo } from "react";

import { arrayMapBy } from "@/common/data_structures/collect_map";
import { safeParseInt } from "@/common/misc_utils";
import { Router } from "@/web/client/router/router_v2";

export interface TextHighlightRange {
  start: number;
  end: number;
}

interface TextHighlight extends TextHighlightRange {
  id: string;
}

export function textHighlightParams(
  highlights: TextHighlight[]
): Record<string, string> {
  const chunks: string[] = [];
  for (const hl of highlights) {
    chunks.push(`${hl.id},${hl.start},${hl.end}`);
  }
  return { matchText: chunks.join("~") };
}

function parseTextHighlight(input: string): TextHighlight | undefined {
  const parts = input.split(",");
  if (parts.length !== 3) {
    return undefined;
  }
  const start = safeParseInt(parts[1]);
  if (start === undefined) {
    return undefined;
  }
  const end = safeParseInt(parts[2]);
  if (end === undefined) {
    return undefined;
  }
  return { id: parts[0].trim(), start, end };
}

function parseTextHighlights(raw?: string): TextHighlight[] | undefined {
  const input = raw?.trim();
  if (input === undefined || input.length === 0) {
    return [];
  }
  const results: TextHighlight[] = [];
  for (const chunk of input.split("~")) {
    const highlight = parseTextHighlight(chunk);
    if (highlight === undefined) {
      // If one of them is invalid, there is probably some broader issue.
      return undefined;
    }
    results.push(highlight);
  }
  return results;
}

export function useTextHighlights():
  | Map<string, TextHighlightRange[]>
  | undefined {
  const { route } = Router.useRouter();

  const urlMatchText = route.params?.matchText;

  return useMemo(() => {
    const highlights = parseTextHighlights(urlMatchText);
    if (highlights === undefined || highlights.length === 0) {
      return undefined;
    }
    return arrayMapBy(highlights, (hl) => hl.id).map;
  }, [urlMatchText]);
}
