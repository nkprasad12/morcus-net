/* eslint-disable @typescript-eslint/no-require-imports */
const stylelint = require("stylelint");
const selectorParser = require("postcss-selector-parser");
/* eslint-enable @typescript-eslint/no-require-imports */

const ruleName = "morcus/no-ancestor-gate-in-has";
const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: (attr, detail) =>
    `JS gate attribute \`[${attr}]\` inside \`:has()\` ${detail}. ` +
    `Scope gate attributes in \`:has()\` to a specific element tag or class ` +
    `(e.g. \`morcus-reader-view:not([data-upgraded])\`) to avoid catastrophic ` +
    `style invalidation in Firefox.`,
});

const GATE_ATTRIBUTES = new Set(["data-upgraded", "data-js-failed"]);

/**
 * Returns all sibling nodes belonging to the same compound selector as `node`
 * (i.e. delimited by combinators).
 */
function getCompoundNodes(node) {
  const nodes = node.parent ? node.parent.nodes : [];
  const idx = nodes.indexOf(node);
  if (idx === -1) return [node];
  let start = idx;
  while (start > 0 && nodes[start - 1].type !== "combinator") start--;
  let end = idx;
  while (end < nodes.length - 1 && nodes[end + 1].type !== "combinator") end++;
  return nodes.slice(start, end + 1);
}

/**
 * Checks whether a compound selector contains a qualifying tag, class, or id.
 */
function hasQualifyingScope(compoundNodes) {
  return compoundNodes.some(
    (n) =>
      (n.type === "tag" && n.value !== "*") ||
      n.type === "class" ||
      n.type === "id"
  );
}

const plugin = stylelint.createPlugin(ruleName, (primary) => {
  return (root, result) => {
    const validOptions = stylelint.utils.validateOptions(result, ruleName, {
      actual: primary,
      possible: [true, false],
    });
    if (!validOptions || !primary) return;

    root.walkRules((rule) => {
      if (!rule.selector || !rule.selector.includes(":has(")) return;

      try {
        selectorParser((ast) => {
          ast.walkPseudos((pseudo) => {
            if (pseudo.value !== ":has") return;

            pseudo.walkAttributes((attr) => {
              if (!GATE_ATTRIBUTES.has(attr.attribute)) return;

              // Find any enclosing pseudo inside :has() (e.g. :not)
              let curr = attr.parent;
              let innerPseudo = null;
              while (curr && curr !== pseudo) {
                if (curr.type === "pseudo" && curr.value !== ":has") {
                  innerPseudo = curr;
                  break;
                }
                curr = curr.parent;
              }

              if (innerPseudo) {
                // Combinator inside pseudo (e.g. :not([data-upgraded] *))
                const nodes = attr.parent.nodes;
                const idx = nodes.indexOf(attr);
                let hasCombinator = false;
                for (let i = idx + 1; i < nodes.length; i++) {
                  if (nodes[i].type === "combinator") {
                    hasCombinator = true;
                    break;
                  }
                }
                if (hasCombinator) {
                  stylelint.utils.report({
                    ruleName,
                    result,
                    node: rule,
                    word: attr.parent.toString(),
                    message: messages.rejected(
                      attr.attribute,
                      `must not use combinators inside \`${
                        innerPseudo.value
                      }()\` (found \`${attr.parent.toString()}\`)`
                    ),
                  });
                  return;
                }

                // Check that innerPseudo is attached to a qualifying element
                const outerCompound = getCompoundNodes(innerPseudo);
                if (!hasQualifyingScope(outerCompound)) {
                  stylelint.utils.report({
                    ruleName,
                    result,
                    node: rule,
                    word: innerPseudo.toString(),
                    message: messages.rejected(
                      attr.attribute,
                      `inside \`${innerPseudo.value}()\` must be qualified on a specific element tag or class`
                    ),
                  });
                  return;
                }
              } else {
                // Direct attribute inside :has()
                const compound = getCompoundNodes(attr);
                if (!hasQualifyingScope(compound)) {
                  stylelint.utils.report({
                    ruleName,
                    result,
                    node: rule,
                    word: compound.map((n) => n.toString()).join(""),
                    message: messages.rejected(
                      attr.attribute,
                      `must be qualified on a specific element tag or class (found bare \`${compound
                        .map((n) => n.toString())
                        .join("")}\`)`
                    ),
                  });
                  return;
                }

                // Check if followed by universal descendant combinator (e.g. tag[data-upgraded] *)
                const nodes = attr.parent.nodes;
                const idx = nodes.indexOf(attr);
                for (let i = idx + 1; i < nodes.length - 1; i++) {
                  if (
                    nodes[i].type === "combinator" &&
                    nodes[i + 1].type === "universal"
                  ) {
                    stylelint.utils.report({
                      ruleName,
                      result,
                      node: rule,
                      word: `${attr.toString()} *`,
                      message: messages.rejected(
                        attr.attribute,
                        `must not be followed by universal descendant \`*\``
                      ),
                    });
                    break;
                  }
                }
              }
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
