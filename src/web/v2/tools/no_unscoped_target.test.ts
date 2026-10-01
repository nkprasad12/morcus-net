jest.mock("stylelint", () => {
  return {
    utils: {
      validateOptions: jest.fn((result, ruleName, primary) => {
        if (primary.actual !== true && primary.actual !== false) {
          result.warn(
            `Invalid option value "${primary.actual}" for rule "${ruleName}"`
          );
          return false;
        }
        return true;
      }),
      report: jest.fn((options) => {
        options.result.warnings.push({
          rule: options.ruleName,
          message: options.message,
          word: options.word,
        });
      }),
      ruleMessages: jest.fn((ruleName, msgs) => msgs),
    },
    createPlugin: jest.fn((ruleName, rule) => ({ ruleName, rule })),
  };
});

import postcss from "postcss";
import plugin, {
  ruleName,
  messages,
} from "@/web/v2/tools/no_unscoped_target.cjs";

describe("morcus/no-unscoped-target stylelint rule", () => {
  function flagged(css: string, primary: unknown = true): string[] {
    const warnings: Array<{ word: string }> = [];
    const mockResult = { warnings, warn() {} };
    plugin.rule(primary as boolean)(
      postcss.parse(css) as never,
      mockResult as never
    );
    return warnings.map((w) => w.word);
  }

  it("exports valid rule metadata and messages", () => {
    expect(ruleName).toBe("morcus/no-unscoped-target");
    expect(messages.rejected(":target")).toContain("Unscoped `:target`");
  });

  it.each([
    ":target",
    "*:target",
    "[id]:target",
    ":target .x",
    "body :target",
    "html:has(:target) .x",
    ":is(:target, :has(:target))",
  ])("flags %s", (selector) => {
    expect(flagged(`${selector} { color: var(--c); }`)).toEqual([selector]);
  });

  it.each([
    ".reader-note:target",
    ".dict-card :target",
    "a.reader-note-ref:target",
    ".reader-dict-panel:is(:target, :has(:target)):not([data-upgraded] *)",
    ".x:not(:is(:target, :has(:target)):not([data-upgraded] *))",
    ".reader-panel-views:not(:has(> .active, :target)) > .y",
    "body:has(.drawer:target:not(.reader-dict-panel)) .back-to-top",
    "[hidden]:not(.reader-toc-drawer:target:not([data-upgraded] *))",
  ])("allows %s", (selector) => {
    expect(flagged(`${selector} { color: var(--c); }`)).toEqual([]);
  });

  it("reports only the unscoped selector in a list", () => {
    expect(flagged(".a:target, :target .b { color: var(--c); }")).toEqual([
      ":target .b",
    ]);
  });

  it("checks rules inside at-rules but not rules nested in rules", () => {
    expect(
      flagged("@media (width <= 640px) { :target { color: red; } }")
    ).toEqual([":target"]);
    expect(flagged(".slice { :target { color: red; } }")).toEqual([]);
  });

  it("does nothing when disabled", () => {
    expect(flagged(":target { color: red; }", false)).toEqual([]);
  });
});
