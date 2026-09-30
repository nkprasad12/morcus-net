/**
 * ESLint rule `morcus/native-takeover`.
 *
 * Flags every call that takes over native browser behaviour or state:
 *
 * - `event.preventDefault()`, `event.stopPropagation()`,
 *   `event.stopImmediatePropagation()`
 * - `history.pushState(...)` / `history.replaceState(...)` (the URL changes
 *   without a navigation, so `:target` and `hashchange` do not follow)
 * - assignments to `history.scrollRestoration`
 *
 * Each one needs a marker comment on the line(s) directly above its statement,
 * in the style of `eslint-disable-next-line`:
 *
 *     // native-takeover(owner-checked): hands the fragment to the target's owner
 *     e.preventDefault();
 *
 * Kinds:
 * - `self`: this code performs the replacement itself (or owns the state it
 *   writes, e.g. its own query parameter).
 * - `own-subtree`: a component acting on events or DOM it owns.
 * - `owner-checked`: the replacement is handed to another owner (a component's
 *   revealer, say). The rule verifies the call is guarded by
 *   `ownersUpgraded(...)` (`core/js_gate.client.ts`): inside
 *   `if (ownersUpgraded(x)) { ... }` / `ownersUpgraded(x) && ...`, or after an
 *   early `if (!ownersUpgraded(x)) return;` in the same function.
 *
 * Why: a global handler that suppresses a native action on behalf of a
 * component that never upgraded (a route chunk that failed to load, an
 * `onConnect` that threw) breaks that component's No-JS fallback too. See
 * src/web/v2/CHUNK_ORDERING.md §8 and "Native takeovers" in
 * src/web/v2/README.md.
 *
 * Marker comments that do not sit directly above a flagged call are reported
 * as stale.
 */

const KINDS = ["self", "own-subtree", "owner-checked"];
const MARKER = /^\s*native-takeover(?:\(([^)]*)\))?:?\s*(.*)$/;
const EVENT_METHODS = new Set([
  "preventDefault",
  "stopPropagation",
  "stopImmediatePropagation",
]);
const HISTORY_METHODS = new Set(["pushState", "replaceState"]);
const OWNER_CHECK = "ownersUpgraded";

// Appended to every failure that asks for a decision. The marker is the only
// check on this: a wrong kind passes lint and every test, and breaks the No-JS
// fallback exactly when a route chunk fails to load in production.
const STAKES =
  "GET THIS RIGHT: this marker is the only review of whether this call can " +
  "break a component's No-JS fallback (e.g. when its chunk fails to load). " +
  "A wrong kind passes lint and tests and fails silently for users. Do not " +
  "pick a kind just to make lint pass; read the README section, and if you " +
  "are not sure the code owns this event or DOM, ask a reviewer.";

function propertyName(member) {
  if (member.type !== "MemberExpression") return undefined;
  if (!member.computed && member.property.type === "Identifier") {
    return member.property.name;
  }
  if (member.property.type === "Literal") return String(member.property.value);
  return undefined;
}

function isHistoryObject(node) {
  if (node.type === "Identifier") return node.name === "history";
  return propertyName(node) === "history";
}

/** What a node takes over, or undefined if it is not a takeover. */
function takeoverOf(node) {
  if (node.type === "CallExpression") {
    const callee = node.callee;
    const name = propertyName(callee);
    if (name === undefined) return undefined;
    if (EVENT_METHODS.has(name)) return `${name}()`;
    if (HISTORY_METHODS.has(name) && isHistoryObject(callee.object)) {
      return `history.${name}()`;
    }
    return undefined;
  }
  if (node.type === "AssignmentExpression") {
    const left = node.left;
    if (
      propertyName(left) === "scrollRestoration" &&
      isHistoryObject(left.object)
    ) {
      return "history.scrollRestoration";
    }
  }
  return undefined;
}

const FUNCTION_TYPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
]);

/**
 * The node whose first line the marker must sit above: the enclosing
 * statement, or an arrow function's expression body.
 */
function anchorOf(node) {
  let current = node;
  while (current.parent) {
    const parent = current.parent;
    if (/(Statement|Declaration)$/.test(current.type)) return current;
    if (parent.type === "ArrowFunctionExpression" && parent.body === current) {
      return current;
    }
    current = parent;
  }
  return current;
}

function isOwnerCall(node) {
  return (
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    node.callee.name === OWNER_CHECK
  );
}

/** `test` is truthy only if an owner check passed. */
function isPositiveGuard(test) {
  if (isOwnerCall(test)) return true;
  if (test.type === "LogicalExpression" && test.operator === "&&") {
    return isPositiveGuard(test.left) || isPositiveGuard(test.right);
  }
  return false;
}

/** `test` is truthy whenever an owner check failed. */
function isNegativeGuard(test) {
  if (test.type === "UnaryExpression" && test.operator === "!") {
    return isOwnerCall(test.argument);
  }
  if (test.type === "LogicalExpression" && test.operator === "||") {
    return isNegativeGuard(test.left) || isNegativeGuard(test.right);
  }
  return false;
}

function exits(statement) {
  if (!statement) return false;
  if (statement.type === "ReturnStatement") return true;
  if (statement.type === "BlockStatement") {
    return exits(statement.body[statement.body.length - 1]);
  }
  return false;
}

/** Whether `node` only runs after `ownersUpgraded(...)` returned true. */
function isOwnerGuarded(node) {
  let child = node;
  let parent = node.parent;
  while (parent) {
    if (
      parent.type === "IfStatement" &&
      parent.consequent === child &&
      isPositiveGuard(parent.test)
    ) {
      return true;
    }
    if (
      parent.type === "LogicalExpression" &&
      parent.operator === "&&" &&
      parent.right === child &&
      isPositiveGuard(parent.left)
    ) {
      return true;
    }
    if (parent.type === "BlockStatement") {
      const index = parent.body.indexOf(child);
      for (let i = 0; i < index; i++) {
        const earlier = parent.body[i];
        if (
          earlier.type === "IfStatement" &&
          isNegativeGuard(earlier.test) &&
          exits(earlier.consequent)
        ) {
          return true;
        }
      }
    }
    if (FUNCTION_TYPES.has(parent.type)) return false;
    child = parent;
    parent = parent.parent;
  }
  return false;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require a `native-takeover(kind): reason` marker on calls that take " +
        "over native browser behaviour, and an ownersUpgraded guard for " +
        "`owner-checked` ones.",
    },
    schema: [],
    messages: {
      missing:
        "`{{what}}` takes over native browser behaviour. Add " +
        "`// native-takeover(<self|own-subtree|owner-checked>): <reason>` " +
        "directly above it (src/web/v2/README.md, 'Native takeovers'). " +
        STAKES,
      badKind:
        "Unknown native-takeover kind '{{kind}}'. Use one of: " +
        KINDS.join(", ") +
        ". " +
        STAKES,
      noReason:
        "native-takeover marker needs a reason after the colon: " +
        "`// native-takeover({{kind}}): <why this is safe>`. " +
        STAKES,
      unguarded:
        "`{{what}}` is marked owner-checked but is not guarded by " +
        "`ownersUpgraded(...)`. Put it inside `if (ownersUpgraded(x))`, or " +
        "after `if (!ownersUpgraded(x)) return;` in the same function. " +
        STAKES,
      stale:
        "native-takeover marker is not directly above a takeover call. " +
        "Move it, or delete it.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    /** Parsed markers keyed by the last line of their comment block. */
    const markersByEndLine = new Map();
    const used = new Set();

    const lineComments = sourceCode
      .getAllComments()
      .filter(
        (c) =>
          c.type === "Line" &&
          sourceCode.lines[c.loc.start.line - 1].trim().startsWith("//")
      );
    const commentAtLine = new Map(
      lineComments.map((c) => [c.loc.start.line, c])
    );

    for (const comment of lineComments) {
      const match = MARKER.exec(comment.value);
      if (!match) continue;
      // The marker applies to the statement after its comment block, so a
      // reason can wrap onto following `//` lines.
      let endLine = comment.loc.end.line;
      while (commentAtLine.has(endLine + 1)) {
        const next = commentAtLine.get(endLine + 1);
        if (MARKER.test(next.value)) break;
        endLine++;
      }
      markersByEndLine.set(endLine, {
        comment,
        kind: (match[1] ?? "").trim(),
        reason: match[2].trim(),
      });
    }

    function check(node) {
      const what = takeoverOf(node);
      if (what === undefined) return;
      const anchor = anchorOf(node);
      const marker = markersByEndLine.get(anchor.loc.start.line - 1);
      if (!marker) {
        context.report({ node, messageId: "missing", data: { what } });
        return;
      }
      used.add(marker);
      if (!KINDS.includes(marker.kind)) {
        context.report({
          loc: marker.comment.loc,
          messageId: "badKind",
          data: { kind: marker.kind },
        });
        return;
      }
      if (!marker.reason) {
        context.report({
          loc: marker.comment.loc,
          messageId: "noReason",
          data: { kind: marker.kind },
        });
      }
      if (marker.kind === "owner-checked" && !isOwnerGuarded(node)) {
        context.report({ node, messageId: "unguarded", data: { what } });
      }
    }

    return {
      CallExpression: check,
      AssignmentExpression: check,
      "Program:exit"() {
        for (const marker of markersByEndLine.values()) {
          if (!used.has(marker)) {
            context.report({ loc: marker.comment.loc, messageId: "stale" });
          }
        }
      },
    };
  },
};

module.exports = rule;
module.exports.KINDS = KINDS;
