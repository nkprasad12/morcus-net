/* eslint-disable @typescript-eslint/no-require-imports */
const stylelint = require("stylelint");
const {
  DEFAULT_MIN_DECLARATIONS,
  contextKey,
  declarationKey,
  isKeyframeStep,
} = require("./css_declaration_key.cjs");
/* eslint-enable @typescript-eslint/no-require-imports */

const ruleName = "morcus/no-duplicate-declaration-blocks";
const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: (count, first) =>
    `Declaration block of ${count} declarations duplicates the one on \`${first}\`. ` +
    `Extract a shared class instead of repeating the block.`,
});

const plugin = stylelint.createPlugin(ruleName, (primary, secondary) => {
  const options = secondary || {};
  const minDeclarations = options.minDeclarations ?? DEFAULT_MIN_DECLARATIONS;
  const ignoreSelectors = (options.ignoreSelectors || []).map(
    (pattern) => new RegExp(pattern)
  );

  return (root, result) => {
    const validOptions = stylelint.utils.validateOptions(
      result,
      ruleName,
      { actual: primary, possible: [true, false] },
      {
        actual: options,
        possible: {
          minDeclarations: (v) => typeof v === "number" && v > 0,
          ignoreSelectors: (v) => Array.isArray(v),
        },
        optional: true,
      }
    );
    if (!validOptions || !primary) return;

    // Keyed by at-rule context + declaration payload; holds the first rule seen.
    const seen = new Map();

    root.walkRules((rule) => {
      // Keyframe steps legitimately repeat identical blocks (e.g. `from`/`to`).
      if (isKeyframeStep(rule)) {
        return;
      }
      if (ignoreSelectors.some((re) => re.test(rule.selector))) return;

      const { key, declCount } = declarationKey(rule);
      if (declCount < minDeclarations) return;

      const fullKey = `${contextKey(rule)}##${key}`;
      const first = seen.get(fullKey);
      if (first === undefined) {
        seen.set(fullKey, rule);
        return;
      }

      stylelint.utils.report({
        ruleName,
        result,
        node: rule,
        message: messages.rejected(
          declCount,
          first.selector.replace(/\s+/g, " ")
        ),
      });
    });
  };
});

module.exports = plugin;
module.exports.ruleName = ruleName;
module.exports.messages = messages;
