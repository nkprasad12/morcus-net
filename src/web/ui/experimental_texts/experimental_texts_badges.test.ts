/**
 * The period and source chips on /experimentalTexts rows are drawn in CSS
 * (`content` on `.experimental-texts-work-badges::before` / `::after`, keyed
 * on the row's `data-period` / `data-source`), so their labels live only in
 * `experimental_texts.css`. These records are typed by the catalog's period
 * and source unions: adding a new one fails to compile here until it gets a
 * label, and then fails below until the stylesheet draws it.
 */

import * as fs from "fs";
import * as path from "path";
import {
  EXPERIMENTAL_TEXT_PERIODS,
  type ExperimentalTextPeriod,
  type ExperimentalTextSourceId,
} from "@/common/experimental_texts/catalog_types";

const PERIOD_LABELS: Readonly<Record<ExperimentalTextPeriod, string>> = {
  ancient: "Ancient",
  medieval: "Medieval",
  neolatin: "Neo-Latin",
};

const SOURCE_LABELS: Readonly<Record<ExperimentalTextSourceId, string>> = {
  patrologia_latina: "Patrologia Latina",
  thelatinlibrary: "The Latin Library",
};

const CSS = fs.readFileSync(
  path.join(__dirname, "experimental_texts.css"),
  "utf8"
);

/** The `content` the stylesheet gives `selector`, if it has a rule for it. */
function contentFor(selector: string): string | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{[^}]*content:\\s*"([^"]*)"`).exec(
    CSS
  );
  return match?.[1];
}

describe("Experimental Texts row chips (CSS)", () => {
  it.each(EXPERIMENTAL_TEXT_PERIODS)("draws the %s period chip", (period) => {
    expect(
      contentFor(
        `[data-period="${period}"] > .experimental-texts-work-badges::before`
      )
    ).toBe(PERIOD_LABELS[period]);
  });

  it.each(Object.keys(SOURCE_LABELS) as ExperimentalTextSourceId[])(
    "draws the %s source chip",
    (source) => {
      expect(
        contentFor(
          `[data-source="${source}"] > .experimental-texts-work-badges::after`
        )
      ).toBe(SOURCE_LABELS[source]);
    }
  );

  it("has no label rules for periods or sources the catalog doesn't have", () => {
    const periods = [...CSS.matchAll(/\[data-period="([^"]+)"\]/g)].map(
      (m) => m[1]
    );
    const sources = [...CSS.matchAll(/\[data-source="([^"]+)"\]/g)].map(
      (m) => m[1]
    );
    expect(new Set(periods)).toEqual(new Set(EXPERIMENTAL_TEXT_PERIODS));
    expect(new Set(sources)).toEqual(new Set(Object.keys(SOURCE_LABELS)));
  });
});
