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
          selector: options.node.selector,
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
} from "@/web/v2/tools/no_duplicate_declaration_blocks.cjs";

describe("morcus/no-duplicate-declaration-blocks stylelint rule", () => {
  function runPlugin(
    css: string,
    primary: unknown = true,
    secondary?: Record<string, unknown>
  ) {
    const warnings: Array<{
      rule: string;
      message: string;
      selector: string;
    }> = [];
    const invalidOptions: string[] = [];
    const mockResult = {
      warnings,
      warn(msg: string) {
        invalidOptions.push(msg);
      },
    };

    const root = postcss.parse(css);
    const ruleFn = plugin.rule(primary as boolean, secondary);
    ruleFn(root as never, mockResult as never);
    return { warnings, invalidOptions };
  }

  it("exports valid rule metadata and messages", () => {
    expect(ruleName).toBe("morcus/no-duplicate-declaration-blocks");
    expect(messages.rejected(3, ".foo")).toContain(
      "Declaration block of 3 declarations duplicates the one on `.foo`"
    );
  });

  it("reports the second rule when two blocks are identical", () => {
    const { warnings } = runPlugin(`
      .a { color: red; padding: 1px; margin: 2px; }
      .b { color: red; padding: 1px; margin: 2px; }
    `);

    expect(warnings).toHaveLength(1);
    expect(warnings[0].selector).toBe(".b");
    expect(warnings[0].message).toContain("duplicates the one on `.a`");
  });

  it("reports every repeat beyond the first", () => {
    const { warnings } = runPlugin(`
      .a { color: red; padding: 1px; margin: 2px; }
      .b { color: red; padding: 1px; margin: 2px; }
      .c { color: red; padding: 1px; margin: 2px; }
    `);

    expect(warnings.map((w) => w.selector)).toEqual([".b", ".c"]);
  });

  it("treats blocks differing only in declaration order as duplicates", () => {
    const { warnings } = runPlugin(`
      .a { color: red; padding: 1px; margin: 2px; }
      .b { margin: 2px; color: red; padding: 1px; }
    `);

    expect(warnings).toHaveLength(1);
  });

  it("ignores blocks smaller than minDeclarations", () => {
    const { warnings } = runPlugin(`
      .a { color: red; padding: 1px; }
      .b { color: red; padding: 1px; }
    `);

    expect(warnings).toHaveLength(0);
  });

  it("honors a custom minDeclarations threshold", () => {
    const css = `
      .a { color: red; padding: 1px; margin: 2px; }
      .b { color: red; padding: 1px; margin: 2px; }
    `;

    expect(runPlugin(css, true, { minDeclarations: 4 }).warnings).toHaveLength(
      0
    );
    expect(runPlugin(css, true, { minDeclarations: 3 }).warnings).toHaveLength(
      1
    );
  });

  it("does not pair rules across different at-rule contexts", () => {
    // A media query deliberately restating a base block is an override, not
    // duplication: the two cannot be collapsed into one class.
    const { warnings } = runPlugin(`
      .a { color: red; padding: 1px; margin: 2px; }
      @media (width <= 640px) {
        .a { color: red; padding: 1px; margin: 2px; }
      }
    `);

    expect(warnings).toHaveLength(0);
  });

  it("pairs rules sharing the same at-rule context", () => {
    const { warnings } = runPlugin(`
      @media (width <= 640px) {
        .a { color: red; padding: 1px; margin: 2px; }
        .b { color: red; padding: 1px; margin: 2px; }
      }
    `);

    expect(warnings).toHaveLength(1);
    expect(warnings[0].selector).toBe(".b");
  });

  it("skips keyframe steps, where repetition is legitimate", () => {
    const { warnings } = runPlugin(`
      @keyframes pulse {
        from { opacity: 1; transform: scale(1); color: red; }
        to { opacity: 1; transform: scale(1); color: red; }
      }
    `);

    expect(warnings).toHaveLength(0);
  });

  it("does not pair blocks whose nested children differ", () => {
    const { warnings } = runPlugin(`
      .a { color: red; padding: 1px; margin: 2px; &:hover { color: blue; } }
      .b { color: red; padding: 1px; margin: 2px; &:focus { color: blue; } }
    `);

    expect(warnings).toHaveLength(0);
  });

  it("respects ignoreSelectors patterns", () => {
    const css = `
      .a { color: red; padding: 1px; margin: 2px; }
      .a-clone { color: red; padding: 1px; margin: 2px; }
    `;

    expect(runPlugin(css, true).warnings).toHaveLength(1);
    expect(
      runPlugin(css, true, { ignoreSelectors: ["^\\.a-clone$"] }).warnings
    ).toHaveLength(0);
  });

  it("does nothing when the rule is disabled", () => {
    const { warnings } = runPlugin(
      `
      .a { color: red; padding: 1px; margin: 2px; }
      .b { color: red; padding: 1px; margin: 2px; }
    `,
      false
    );

    expect(warnings).toHaveLength(0);
  });

  it("validates options and rejects a non-boolean primary", () => {
    const { warnings, invalidOptions } = runPlugin(
      `.a { color: red; padding: 1px; margin: 2px; }`,
      "yes"
    );

    expect(invalidOptions).toHaveLength(1);
    expect(invalidOptions[0]).toContain('Invalid option value "yes"');
    expect(warnings).toHaveLength(0);
  });
});
