import {
  currentIframeSrc,
  navigateFrameReplace,
  queryUpgraded,
} from "@/web/ui/core/index.client";

export interface EmbeddedDictLookupRequest {
  q: string;
  lang: "La";
  inflected: boolean;
}

export type EmbeddedDictLookupResult = "unchanged" | "swapped" | "declined";

export type DictFrameLookupOutcome =
  | "unchanged"
  | "swapped"
  | "navigated"
  | "none";

/**
 * Looks up `request` in an embedded `/dicts?embedded=1` iframe in place when
 * its `<morcus-dict-search>` is upgraded and accepts the request, or falls back
 * to replacing the iframe document at `fallbackSrc`.
 *
 * Cross-bundle boundary: the host page's chunk (`reader.js`, `macronizer.js`)
 * and the iframe's `dict.js` load independently and may come from different
 * builds across a deploy. Any missing method, thrown error, or unrecognized
 * return value safely degrades to the full-navigation fallback.
 */
export function lookupInDictFrame(
  iframe: HTMLIFrameElement,
  request: EmbeddedDictLookupRequest,
  fallbackSrc: string
): DictFrameLookupOutcome {
  try {
    const doc = iframe.contentDocument;
    const result =
      doc &&
      queryUpgraded(doc, "morcus-dict-search")?.lookupEmbeddedWord?.(request);
    if (result === "unchanged" || result === "swapped") {
      return result;
    }
  } catch {
    // Fall back to full iframe navigation below.
  }

  if (currentIframeSrc(iframe) === fallbackSrc) {
    return "none";
  }
  navigateFrameReplace(iframe, fallbackSrc);
  return "navigated";
}
