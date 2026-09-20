// eslint-disable-next-line @typescript-eslint/no-require-imports
const stylelint = require("stylelint");

const ruleName = "morcus/no-duplicate-declaration-blocks";
const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: (count, first) =>
    `Declaration block of ${count} declarations duplicates the one on \`${first}\`. ` +
    `Extract a shared class instead of repeating the block.`,
});

/**
 * Builds a canonical key for a rule's own declarations.
 *
 * Declarations are sorted so that blocks differing only in authoring order are
 * still recognized as duplicates. Nested rules contribute a marker rather than
 * their contents: two blocks with identical declarations but different nested
 * children are not interchangeable, so they must not collide.
 */
function declarationKey(rule) {
  const parts = [];
  rule.each((node) => {
    if (node.type === "decl") {
      parts.push(`${node.prop.trim().toLowerCase()}:${node.value.trim()}`);
    } else if (node.type === "rule") {
      parts.push(`@nested{${node.selector}}`);
    } else if (node.type === "atrule") {
      parts.push(`@nested-at{${node.name} ${node.params}}`);
    }
  });
  const declCount = parts.filter((p) => !p.startsWith("@nested")).length;
  return { key: parts.sort().join(";"), declCount };
}

/**
 * Identifies the enclosing at-rule context, so that an override inside a media
 * query is not reported as duplicating the base rule it deliberately restates.
 */
function contextKey(rule) {
  const context = [];
  for (
    let node = rule.parent;
    node && node.type !== "root";
    node = node.parent
  ) {
    if (node.type === "atrule") context.push(`@${node.name} ${node.params}`);
  }
  return context.join("|");
}

const plugin = stylelint.createPlugin(ruleName, (primary, secondary) => {
  const options = secondary || {};
  const minDeclarations = options.minDeclarations ?? 3;
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
      if (
        rule.parent?.type === "atrule" &&
        /keyframes$/i.test(rule.parent.name)
      ) {
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
