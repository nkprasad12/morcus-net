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
} from "@/web/v2/tools/no_ancestor_gate_in_has.cjs";

describe("morcus/no-ancestor-gate-in-has stylelint rule", () => {
  function runPlugin(css: string, primary: unknown = true) {
    const warnings: Array<{
      rule: string;
      message: string;
      selector: string;
      word?: string;
    }> = [];
    const invalidOptions: string[] = [];
    const mockResult = {
      warnings,
      warn(msg: string) {
        invalidOptions.push(msg);
      },
    };

    const root = postcss.parse(css);
    const ruleFn = plugin.rule(primary as boolean);
    ruleFn(root as never, mockResult as never);
    return { warnings, invalidOptions };
  }

  it("exports valid rule metadata and messages", () => {
    expect(ruleName).toBe("morcus/no-ancestor-gate-in-has");
    expect(messages.rejected("data-upgraded", "test detail")).toContain(
      "JS gate attribute `[data-upgraded]` inside `:has()` test detail"
    );
  });

  it("flags ancestor gate pattern inside :not() inside :has()", () => {
    const { warnings } = runPlugin(`
      body:has(.reader-dict-panel:target, .reader-dict-panel :target:not([data-upgraded] *)) .back-to-top {
        bottom: 50px;
      }
    `);

    expect(warnings).toHaveLength(1);
    expect(warnings[0].rule).toBe("morcus/no-ancestor-gate-in-has");
    expect(warnings[0].message).toContain("Combinator inside `:not(");
  });

  it("flags bare gate attribute inside :has()", () => {
    const { warnings } = runPlugin(`
      body:has([data-upgraded] .child) { opacity: 1; }
    `);

    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain(
      "must be qualified on a specific element tag or class"
    );
  });

  it("flags bare :not([data-upgraded]) inside :has()", () => {
    const { warnings } = runPlugin(`
      body:has(:not([data-upgraded])) { opacity: 1; }
    `);

    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain(
      "inside `:not()` must be qualified on a specific element tag or class"
    );
  });

  it("flags [data-js-failed] ancestor patterns inside :has()", () => {
    const { warnings } = runPlugin(`
      body:has(:not([data-js-failed] *)) { opacity: 1; }
    `);

    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("Combinator inside `:not(");
  });

  it("flags universal descendant following a qualified gate", () => {
    const { warnings } = runPlugin(`
      body:has(morcus-reader-view[data-upgraded] *) { opacity: 1; }
    `);

    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain(
      "must not be followed by universal descendant `*`"
    );
  });

  it("allows qualified element gate with :not() inside :has()", () => {
    const { warnings } = runPlugin(`
      body:has(.reader-dict-panel:target, morcus-reader-view:not([data-upgraded]) .reader-dict-panel :target) .back-to-top {
        bottom: 50px;
      }
    `);

    expect(warnings).toHaveLength(0);
  });

  it("allows qualified element gate attribute directly inside :has()", () => {
    const { warnings } = runPlugin(`
      :root:has(morcus-reader-view[data-upgraded] .settings-touch-nav :checked) {
        touch-action: pan-y;
      }
    `);

    expect(warnings).toHaveLength(0);
  });

  it("allows class-qualified gate attribute inside :has()", () => {
    const { warnings } = runPlugin(`
      body:has(.drawer:not([data-upgraded])) {
        overflow: hidden;
      }
    `);

    expect(warnings).toHaveLength(0);
  });

  it("allows gate patterns outside of :has()", () => {
    const { warnings } = runPlugin(`
      morcus-external-loader:not([data-js-failed], [data-js-failed] *):has(.tab:checked) {
        display: block;
      }
      .back-to-top:not([data-upgraded]) {
        opacity: 0.85;
      }
    `);

    expect(warnings).toHaveLength(0);
  });

  it("does nothing when the rule is disabled", () => {
    const { warnings } = runPlugin(
      `body:has([data-upgraded] *) { opacity: 1; }`,
      false
    );

    expect(warnings).toHaveLength(0);
  });

  it("validates options and rejects a non-boolean primary", () => {
    const { warnings, invalidOptions } = runPlugin(
      `body:has([data-upgraded] *) { opacity: 1; }`,
      "invalid"
    );

    expect(invalidOptions).toHaveLength(1);
    expect(invalidOptions[0]).toContain('Invalid option value "invalid"');
    expect(warnings).toHaveLength(0);
  });

  // Measured in Firefox: a combinator inside :not() within :has() is ~20x
  // slower whatever the attribute or class, so these are flagged too.
  it.each([
    "body:has(.panel .zz:not(.hot *)) .x",
    "body:has(.panel .zz:not([data-open] *)) .x",
    "body:has(.panel .zz:not([data-open] .y)) .x",
    "body:has(.zz:not(morcus-s[data-open] *)) .x",
  ])("flags a combinator inside :not() inside :has(): %s", (selector) => {
    const { warnings } = runPlugin(`${selector} { opacity: 1; }`);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("Combinator inside `:not(");
  });

  // Measured in Firefox: these cost the same as a class-qualified selector.
  it.each([
    "body:has([data-open] .zz) .x",
    "body:has([data-open] * .zz) .x",
    "body:has(.drawer:target:not(.reader-dict-panel)) .x",
    ".a:not(.b *):has(.c) .x",
  ])("allows %s", (selector) => {
    expect(runPlugin(`${selector} { opacity: 1; }`).warnings).toEqual([]);
  });
});
