import { InflectionData } from "@/common/dictionaries/dict_result";
import * as he from "he";

const INFLECTION_PROVENANCE_NOTE =
  "Automated morphological analysis (not from dictionary!)";

/**
 * Decodes Morpheus diacritic markings (^ for breve, _ for macron, + for diaeresis)
 * into standard Unicode characters with canonical NFC normalization.
 */
export function formatInflectionForm(rawForm: string): string {
  return rawForm
    .replaceAll("^", "\u0306")
    .replaceAll("_", "\u0304")
    .replaceAll("+", "\u0308")
    .normalize("NFC");
}

/**
 * Removes analyses that are identical once formatted.
 *
 * A single query can match several orthographic variants of the same form
 * (e.g. `gallus` and `Gallus`), each of which produces its own analysis. Those
 * collapse into visually identical rows, so we drop the duplicates.
 */
export function dedupeInflections(
  inflections: InflectionData[]
): InflectionData[] {
  const seen = new Set<string>();
  const result: InflectionData[] = [];
  for (const inflection of inflections) {
    const key = [
      formatInflectionForm(inflection.form),
      inflection.data,
      inflection.usageNote ?? "",
    ].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(inflection);
  }
  return result;
}

function formatAnalysis(inflection: InflectionData): string {
  const note = inflection.usageNote
    ? ` <span class="usage-note">(${he.escape(inflection.usageNote)})</span>`
    : "";
  return `${he.escape(inflection.data)}${note}`;
}

/**
 * Renders inflection analyses grouped by macronized form, one line per form,
 * with multiple analyses of the same form joined by ` · `.
 */
export function renderInflections(inflections: InflectionData[]): string {
  const deduped = dedupeInflections(inflections);
  if (deduped.length === 0) {
    return "";
  }
  const byForm = new Map<string, string[]>();
  for (const inflection of deduped) {
    const form = formatInflectionForm(inflection.form);
    const analysis = formatAnalysis(inflection);
    const existing = byForm.get(form);
    if (existing === undefined) {
      byForm.set(form, [analysis]);
    } else if (!existing.includes(analysis)) {
      existing.push(analysis);
    }
  }
  const lines = Array.from(
    byForm.entries(),
    ([form, analyses]) =>
      `<p class="inflection-line"><b>${he.escape(form)}</b>: ${analyses.join(
        " · "
      )}</p>`
  ).join("");
  const infoIcon = `<span class="inflection-info lsHover" tabindex="0" role="button" aria-label="${INFLECTION_PROVENANCE_NOTE}" title="${INFLECTION_PROVENANCE_NOTE}">ⓘ</span>`;
  return `<div class="entry-inflections">${infoIcon}<div class="inflection-lines">${lines}</div></div>`;
}
