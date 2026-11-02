import { checkSequentialIds } from "@/scripts/thelatinlibrary/converters/checks";
import { textOf } from "@/scripts/thelatinlibrary/converters/html";
import {
  checkNoTextLost,
  fail,
  readPageContent,
  type PageConversion,
} from "@/scripts/thelatinlibrary/converters/page";
import { splitAtSequentialMarkers } from "@/scripts/thelatinlibrary/converters/strict_markers";

/**
 * Converter for one speech of the pseudo-Quintilian Declamationes Maiores:
 *
 *   <p class=pagehead>M. FABI QVINTILIANI DECLAMATIO MAIOR SECVNDA</p>
 *   <p>Theme of the speech ...</p>                 -> <speech>.thema
 *   <p>[1] Sentio, iudices, ... [2] ...</p>         -> <speech>.1, <speech>.2
 *   <p>... continuation of section 2 ... [3] ...</p>
 *
 * Section markers `[N]` can fall anywhere in a paragraph, so the page's
 * paragraphs are read as one stream and split at the markers, which must run
 * 1, 2, 3, ... without gaps.
 */

const ORDINALS = [
  "PRIMA",
  "SECVNDA",
  "TERTIA",
  "QVARTA",
  "QVINTA",
  "SEXTA",
  "SEPTIMA",
  "OCTAVA",
  "NONA",
  "DECIMA",
  "VNDECIMA",
  "DVODECIMA",
  "TERTIA DECIMA",
  "QVARTA DECIMA",
  "QVINTA DECIMA",
  "SEXTA DECIMA",
  "SEPTIMA DECIMA",
  "DVODEVICESIMA",
  "VNDEVICESIMA",
];

/** The speech number named by the page title, if it uses a known ordinal. */
export function speechNumberFromTitle(title: string): number | undefined {
  const m = /DECLAMATIO MAIOR\s+(.+)$/.exec(title.toUpperCase().trim());
  if (m === null) return undefined;
  // Some titles use the masculine (SEXTVS), U for V, or -VICENSIMA.
  const spoken = m[1]
    .replace(/U/g, "V")
    .replace(/VS$/, "A")
    .replace(/VICENSIMA$/, "VICESIMA")
    .replace(/\s+/g, " ")
    .trim();
  const index = ORDINALS.indexOf(spoken);
  return index < 0 ? undefined : index + 1;
}

export function splitInlineSections(
  paragraphs: readonly string[],
  speech: number
): { rows: [string[], string][]; sectionCount: number } {
  const label = `Declamation ${speech}`;
  const split = splitAtSequentialMarkers(paragraphs, {
    label,
    allowInlineSplits: true,
    allowLeadingPr: true,
  });
  checkSequentialIds(
    split.map(([secId]) => secId),
    label
  );
  if (split[0]?.[0] !== "pr") {
    fail(`${label} has no theme.`);
  }
  const id = String(speech);
  const rows: [string[], string][] = split.map(([secId, text]) => {
    if (secId === "pr") {
      // The theme. One speech prints it in square brackets; drop them.
      const theme = text.replace(/^\[(.*)\]$/s, "$1").trim();
      if (theme.length === 0) fail(`${label} has no theme.`);
      return [[id, "thema"], theme];
    }
    return [[id, secId], text];
  });
  return { rows, sectionCount: split.length - 1 };
}

export function convertDeclamation(
  html: string,
  speech: number
): PageConversion {
  const content = readPageContent(html);
  if (content.nav !== undefined || content.headings.length > 0) {
    fail("Unexpected navigation or heading on a declamation page.");
  }
  const titleNumber = speechNumberFromTitle(content.pageTitle);
  if (titleNumber !== speech) {
    fail(
      `Page title '${content.pageTitle}' does not name declamation ${speech}.`
    );
  }

  const { rows, sectionCount } = splitInlineSections(
    content.paragraphs.map(textOf),
    speech
  );

  return {
    rows,
    pageTitle: content.pageTitle,
    bodyText: content.bodyText,
    report: [
      `sections: theme + [1]..[${sectionCount}] in order`,
      checkNoTextLost(content.paragraphs, rows, sectionCount),
    ],
  };
}
