/**
 * @jest-environment jsdom
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { renderReaderContentHtml } from "@/web/v2/reader/reader.server";

jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/v2/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/v2/reader/reader_loader.server", () =>
  jest.requireActual("@/web/v2/testing/mock_reader_loader")
);

type ReaderScenario = "work-page" | "work-with-macra";

interface SelectorEntry {
  readonly id?: string;
  readonly selector?: string;
  readonly requiredIn?: readonly ReaderScenario[];
  readonly optionalIn?: readonly ReaderScenario[];
}

export const READER_SELECTORS: Record<string, SelectorEntry> = {
  // TOC Drawer (reader_toc.client.ts)
  tocDrawer: {
    id: "reader-toc-drawer",
    requiredIn: ["work-page", "work-with-macra"],
  },
  tocBackdrop: {
    id: "reader-toc-backdrop",
    requiredIn: ["work-page", "work-with-macra"],
  },
  tocBtn: {
    id: "reader-toc-btn",
    requiredIn: ["work-page", "work-with-macra"],
  },
  tocCloseBtn: {
    id: "reader-toc-close-btn",
    requiredIn: ["work-page", "work-with-macra"],
  },
  tocList: {
    id: "reader-toc-list",
    requiredIn: ["work-page", "work-with-macra"],
  },
  tocActiveItem: {
    selector: ".reader-toc-item.active",
    requiredIn: ["work-page", "work-with-macra"],
  },

  // Settings Popover (reader_settings.client.ts)
  settingsPopover: {
    id: "reader-settings-popover",
    requiredIn: ["work-page", "work-with-macra"],
  },
  settingsBtn: {
    id: "reader-settings-btn",
    requiredIn: ["work-page", "work-with-macra"],
  },
  settingsBackdrop: {
    id: "reader-settings-backdrop",
    requiredIn: ["work-page", "work-with-macra"],
  },
  settingsCloseBtn: {
    id: "reader-settings-close-btn",
    requiredIn: ["work-page", "work-with-macra"],
  },
  settingsResetBtn: {
    id: "reader-settings-reset-btn",
    requiredIn: ["work-page", "work-with-macra"],
  },
  readerSizeDec: {
    id: "reader-size-dec",
    requiredIn: ["work-page", "work-with-macra"],
  },
  readerSizeInc: {
    id: "reader-size-inc",
    requiredIn: ["work-page", "work-with-macra"],
  },
  readerSizeLabel: {
    id: "reader-size-label",
    requiredIn: ["work-page", "work-with-macra"],
  },
  dictSizeDec: {
    id: "dict-size-dec",
    requiredIn: ["work-page", "work-with-macra"],
  },
  dictSizeInc: {
    id: "dict-size-inc",
    requiredIn: ["work-page", "work-with-macra"],
  },
  dictSizeLabel: {
    id: "dict-size-label",
    requiredIn: ["work-page", "work-with-macra"],
  },
  fontSelect: {
    id: "font-select",
    requiredIn: ["work-page", "work-with-macra"],
  },
  lineHeightSelect: {
    id: "line-height-select",
    requiredIn: ["work-page", "work-with-macra"],
  },
  toggleGutter: {
    id: "toggle-gutter",
    requiredIn: ["work-page", "work-with-macra"],
  },
  toggleMacra: { id: "toggle-macra", optionalIn: ["work-with-macra"] },
};

function toCssSelector(entry: SelectorEntry): string {
  return entry.selector ?? `#${entry.id}`;
}

function extractClientBoundSelectors(sourceCode: string): string[] {
  const queryRegex =
    /(?:querySelector(?:All)?|this\.\$\$?)\s*(?:<[^>]+>)?\s*\(\s*["']([^"']+)["']\s*\)/g;
  const idRegex = /getElementById\s*\(\s*["']([^"']+)["']\s*\)/g;

  const selectors = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = queryRegex.exec(sourceCode)) !== null) {
    const raw = match[1].trim();
    // Skip generic multi-element focus-trap selector lists
    if (!raw.includes(",")) {
      selectors.add(raw);
    }
  }
  while ((match = idRegex.exec(sourceCode)) !== null) {
    selectors.add(`#${match[1].trim()}`);
  }
  return Array.from(selectors).sort();
}

describe("Reader Selector Inventory Contract Tests", () => {
  const scenarios: ReaderScenario[] = ["work-page", "work-with-macra"];
  const scenarioDoms = {} as Record<ReaderScenario, HTMLElement>;

  beforeAll(async () => {
    const [workPageHtml, workWithMacraHtml] = await Promise.all([
      renderReaderContentHtml({ workId: "dbg", pageId: "1.1" }),
      renderReaderContentHtml({ workId: "catullus", pageId: "1" }),
    ]);

    scenarioDoms["work-page"] = document.createElement("div");
    scenarioDoms["work-page"].innerHTML = workPageHtml;

    scenarioDoms["work-with-macra"] = document.createElement("div");
    scenarioDoms["work-with-macra"].innerHTML = workWithMacraHtml;
  });

  for (const [key, entry] of Object.entries(READER_SELECTORS)) {
    const selector = toCssSelector(entry);

    test(`selector "${key}" (${selector}) matches declared scenario contract`, () => {
      const activeScenarios = [
        ...(entry.requiredIn ?? []),
        ...(entry.optionalIn ?? []),
      ];
      expect(activeScenarios.length).toBeGreaterThan(0);

      for (const scenario of scenarios) {
        const match = scenarioDoms[scenario].querySelector(selector);
        if (activeScenarios.includes(scenario)) {
          expect(match).not.toBeNull();
        } else {
          expect(match).toBeNull();
        }
      }
    });
  }

  test("every selector queried in reader_toc.client.ts and reader_settings.client.ts is declared in READER_SELECTORS and resolves in >= 1 server scenario", () => {
    const tocSelectors = extractClientBoundSelectors(
      fs.readFileSync(path.join(__dirname, "reader_toc.client.ts"), "utf-8")
    );
    const settingsSelectors = extractClientBoundSelectors(
      fs.readFileSync(
        path.join(__dirname, "reader_settings.client.ts"),
        "utf-8"
      )
    );
    const clientSelectors = Array.from(
      new Set([...tocSelectors, ...settingsSelectors])
    ).sort();

    const declaredSelectors = new Set(
      Object.values(READER_SELECTORS).map(toCssSelector)
    );

    const undeclared = clientSelectors.filter((s) => !declaredSelectors.has(s));
    const dead = clientSelectors.filter((s) =>
      scenarios.every((sc) => scenarioDoms[sc].querySelector(s) === null)
    );

    expect({ undeclared, dead }).toEqual({ undeclared: [], dead: [] });
  });
});
