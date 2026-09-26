jest.mock("stylelint", () => {
  return {
    utils: {
      validateOptions: jest.fn((result, ruleName, options) => {
        if (typeof options.actual !== "number" || options.actual <= 0) {
          result.warn(
            `Invalid option value "${options.actual}" for rule "${ruleName}"`
          );
          return false;
        }
        return true;
      }),
      report: jest.fn((options) => {
        options.result.warnings.push({
          rule: options.ruleName,
          message: options.message,
        });
      }),
      ruleMessages: jest.fn((ruleName, msgs) => msgs),
    },
    createPlugin: jest.fn((ruleName, rule) => ({
      ruleName,
      rule,
    })),
  };
});

import plugin, { ruleName, messages } from "@/web/v2/tools/max_file_lines.cjs";

describe("morcus/max-file-lines stylelint rule", () => {
  function runPlugin(css: string, maxLines: unknown) {
    const warnings: Array<{ rule: string; message: string }> = [];
    const invalidOptions: string[] = [];

    const mockResult = {
      warnings,
      warn(msg: string) {
        invalidOptions.push(msg);
      },
    };

    const mockRoot = {
      source: {
        input: {
          css,
        },
      },
    };

    const ruleFn = plugin.rule(maxLines as number);
    ruleFn(mockRoot as never, mockResult as never);

    return { warnings, invalidOptions };
  }

  it("exports valid rule metadata and messages", () => {
    expect(ruleName).toBe("morcus/max-file-lines");
    expect(typeof messages.rejected).toBe("function");
    expect(messages.rejected(700, 650)).toBe(
      "File has 700 lines, exceeding the maximum limit of 650 lines."
    );
  });

  it("passes when CSS line count is within limit", () => {
    const css = `.card {\n  display: block;\n  padding: 8px;\n}\n`;
    const { warnings, invalidOptions } = runPlugin(css, 10);

    expect(invalidOptions).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it("reports error when CSS line count exceeds limit", () => {
    const css = `.card {\n  display: block;\n  padding: 8px;\n}\n`;
    const { warnings, invalidOptions } = runPlugin(css, 3);

    expect(invalidOptions).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].rule).toBe("morcus/max-file-lines");
    expect(warnings[0].message).toBe(
      "File has 5 lines, exceeding the maximum limit of 3 lines."
    );
  });

  it("handles CRLF line endings correctly", () => {
    const css = `.card {\r\n  display: block;\r\n  padding: 8px;\r\n}\r\n`;
    const { warnings } = runPlugin(css, 3);

    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toBe(
      "File has 5 lines, exceeding the maximum limit of 3 lines."
    );
  });

  it("handles empty code without error", () => {
    const { warnings, invalidOptions } = runPlugin("", 10);

    expect(invalidOptions).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it("validates options and rejects non-positive or non-number limits", () => {
    const css = `.card { display: block; }`;
    const { warnings, invalidOptions } = runPlugin(css, -5);

    expect(invalidOptions).toHaveLength(1);
    expect(invalidOptions[0]).toContain(
      'Invalid option value "-5" for rule "morcus/max-file-lines"'
    );
    expect(warnings).toHaveLength(0);
  });
});
