// eslint-disable-next-line @typescript-eslint/no-require-imports
const stylelint = require("stylelint");

const ruleName = "morcus/max-file-lines";
const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: (actual, max) =>
    `File has ${actual} lines, exceeding the maximum limit of ${max} lines.`,
});

const plugin = stylelint.createPlugin(ruleName, (maxLines) => {
  return (root, result) => {
    const validOptions = stylelint.utils.validateOptions(result, ruleName, {
      actual: maxLines,
      possible: (v) => typeof v === "number" && v > 0,
    });

    if (!validOptions || !maxLines) {
      return;
    }

    const cssContent = root.source?.input?.css ?? "";
    const lineCount = cssContent ? cssContent.split(/\r?\n/).length : 0;

    if (lineCount > maxLines) {
      stylelint.utils.report({
        ruleName,
        result,
        node: root,
        message: messages.rejected(lineCount, maxLines),
      });
    }
  };
});

module.exports = plugin;
module.exports.ruleName = ruleName;
module.exports.messages = messages;
