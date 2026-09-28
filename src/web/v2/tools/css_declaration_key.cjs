const DEFAULT_MIN_DECLARATIONS = 3;

/**
 * Returns true if the rule is a step inside an `@keyframes` at-rule, where
 * repeating identical declaration blocks (e.g. `from`/`to`) is legitimate.
 *
 * @param {import("postcss").Rule} rule
 * @returns {boolean}
 */
function isKeyframeStep(rule) {
  return Boolean(
    rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name)
  );
}

/**
 * Builds a canonical key for a rule's own declarations.
 *
 * Declarations are sorted so that blocks differing only in authoring order are
 * still recognized as duplicates. Nested rules contribute a marker rather than
 * their contents: two blocks with identical declarations but different nested
 * children are not interchangeable, so they must not collide.
 *
 * @param {import("postcss").Rule} rule
 * @returns {{ key: string, declCount: number, declarations: string[] }}
 */
function declarationKey(rule) {
  /** @type {string[]} */
  const parts = [];
  /** @type {string[]} */
  const declarations = [];
  rule.each((node) => {
    if (node.type === "decl") {
      const normalized = `${node.prop
        .trim()
        .toLowerCase()}:${node.value.trim()}`;
      parts.push(normalized);
      declarations.push(normalized);
    } else if (node.type === "rule") {
      parts.push(`@nested{${node.selector}}`);
    } else if (node.type === "atrule") {
      parts.push(`@nested-at{${node.name} ${node.params}}`);
    }
  });
  declarations.sort();
  return {
    key: parts.sort().join(";"),
    declCount: declarations.length,
    declarations,
  };
}

/**
 * Identifies the enclosing at-rule context, so that an override inside a media
 * query is not reported as duplicating the base rule it deliberately restates.
 *
 * @param {import("postcss").Rule} rule
 * @returns {string}
 */
function contextKey(rule) {
  /** @type {string[]} */
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

module.exports = {
  DEFAULT_MIN_DECLARATIONS,
  isKeyframeStep,
  declarationKey,
  contextKey,
};
