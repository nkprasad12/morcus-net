import { InflectionData } from "@/common/dictionaries/dict_result";
import * as he from "he";

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

function usageNoteHtml(inflection: InflectionData): string {
  return inflection.usageNote
    ? ` <span class="v2-usage-note">(${he.encode(inflection.usageNote)})</span>`
    : "";
}

/** Renders analyses as a two column table. */
export function renderInflectionTable(inflections: InflectionData[]): string {
  const rows = inflections
    .map(
      (inflection) => `
            <tr>
              <td>${he.escape(formatInflectionForm(inflection.form))}</td>
              <td>${he.encode(inflection.data)}${usageNoteHtml(inflection)}</td>
            </tr>`
    )
    .join("");
  return `
            <div class="v2-table-scroller">
              <table class="v2-inflection-table">
                <thead>
                  <tr><th>Form</th><th>Analysis</th></tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>`;
}

/**
 * Renders a single analysis as one line of prose.
 *
 * A table costs far more vertical space than a lone analysis justifies, which
 * matters most in the embedded reader panel where subsection matches are common.
 */
export function renderInflectionInline(inflection: InflectionData): string {
  return `<p class="v2-subsection-inline-inf"><b>${he.escape(
    formatInflectionForm(inflection.form)
  )}</b> — ${he.encode(inflection.data)}${usageNoteHtml(inflection)}</p>`;
}
