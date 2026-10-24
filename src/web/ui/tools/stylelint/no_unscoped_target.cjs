/* eslint-disable @typescript-eslint/no-require-imports */
const stylelint = require("stylelint");
const selectorParser = require("postcss-selector-parser");
/* eslint-enable @typescript-eslint/no-require-imports */

const ruleName = "morcus/no-unscoped-target";
const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: (selector) =>
    `Unscoped \`:target\` in \`${selector}\`. \`:target\` matches on the URL hash ` +
    `alone, and app.css bundles every slice onto every page, so this applies ` +
    `app-wide. Qualify it with a slice-owned class, either on the same element ` +
    `(\`.reader-note:target\`) or an ancestor (\`.dict-card :target\`).`,
});

/** Tags that exist on every page and so do not scope anything. */
const GLOBAL_TAGS = new Set(["html", "body", "*"]);

function isScoping(node) {
  return (
    node.type === "class" ||
    node.type === "id" ||
    node.type === "nesting" ||
    (node.type === "tag" && !GLOBAL_TAGS.has(node.value.toLowerCase()))
  );
}

/**
 * Whether `node` is scoped within its own selector: some compound up to and
 * including the one containing `node` has a slice-specific class, id, tag or
 * `&`. Compounds after `node` (its descendants) do not count.
 */
function scopedWithinSelector(node) {
  const nodes = node.parent.nodes;
  const idx = nodes.indexOf(node);
  let end = idx;
  while (end < nodes.length - 1 && nodes[end + 1].type !== "combinator") end++;
  return nodes.slice(0, end + 1).some(isScoping);
}

/**
 * Whether a `:target` pseudo is scoped. If it is not scoped within its own
 * selector but sits inside a functional pseudo (`:is()`, `:not()`, `:has()`,
 * `:where()`), the enclosing pseudo is checked in its selector instead.
 */
function isScopedTarget(target) {
  let node = target;
  for (;;) {
    if (scopedWithinSelector(node)) return true;
    const enclosingPseudo = node.parent.parent;
    if (!enclosingPseudo || enclosingPseudo.type !== "pseudo") return false;
    node = enclosingPseudo;
  }
}

const plugin = stylelint.createPlugin(ruleName, (primary) => {
  return (root, result) => {
    const validOptions = stylelint.utils.validateOptions(result, ruleName, {
      actual: primary,
      possible: [true, false],
    });
    if (!validOptions || !primary) return;

    root.walkRules((rule) => {
      if (!rule.selector || !rule.selector.includes(":target")) return;
      // A nested rule is scoped by its parent rule's selector.
      if (rule.parent && rule.parent.type === "rule") return;

      try {
        selectorParser((ast) => {
          ast.each((selector) => {
            let unscoped = false;
            selector.walkPseudos((pseudo) => {
              if (pseudo.value === ":target" && !isScopedTarget(pseudo)) {
                unscoped = true;
              }
            });
            if (!unscoped) return;
            const text = selector.toString().trim();
            stylelint.utils.report({
              ruleName,
              result,
              node: rule,
              word: text,
              message: messages.rejected(text),
            });
          });
        }).processSync(rule.selector);
      } catch {
        // Syntax errors in selector will be caught by other CSS rules
      }
    });
  };
});

module.exports = plugin;
module.exports.ruleName = ruleName;
module.exports.messages = messages;
