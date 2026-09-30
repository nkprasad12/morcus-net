import { RuleTester } from "eslint";

// The parser's types only resolve under node16/bundler module resolution.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tsParser = require("@typescript-eslint/parser");

import rule from "@/web/v2/tools/native_takeover.cjs";

const tester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: "latest",
    sourceType: "module",
  },
});

tester.run("morcus/native-takeover", rule, {
  valid: [
    // Unrelated calls are ignored.
    { code: "el.addEventListener('click', f); e.defaultPrevented;" },
    // Each kind with a reason.
    {
      code: [
        "// native-takeover(self): scrolls to the top itself",
        "e.preventDefault();",
      ].join("\n"),
    },
    {
      code: [
        "// native-takeover(own-subtree): the toolbar's own buttons",
        "e.stopPropagation();",
      ].join("\n"),
    },
    // The reason may wrap onto following comment lines.
    {
      code: [
        "// native-takeover(self): writes the component's own query",
        "// parameter; no fragment is involved.",
        "window.history.pushState(null, '', path);",
      ].join("\n"),
    },
    // Multi-line statements anchor on their first line.
    {
      code: [
        "// native-takeover(self): clears a hash only used without JS",
        "win.history.replaceState(",
        "  null,",
        "  '',",
        "  path",
        ");",
      ].join("\n"),
    },
    // Arrow expression bodies anchor on the body.
    {
      code: [
        "const f = (e) =>",
        "  // native-takeover(own-subtree): the dialog's own form",
        "  e.preventDefault();",
      ].join("\n"),
    },
    {
      code: [
        "// native-takeover(self): restores scroll itself",
        "history.scrollRestoration = 'manual';",
      ].join("\n"),
    },
    // owner-checked inside a positive guard.
    {
      code: [
        "if (target && ownersUpgraded(target)) {",
        "  // native-takeover(owner-checked): the owner's revealer opens it",
        "  e.preventDefault();",
        "}",
      ].join("\n"),
    },
    // owner-checked after an early return.
    {
      code: [
        "function onClick(e, target) {",
        "  if (!target || !ownersUpgraded(target)) return;",
        "  // native-takeover(owner-checked): the owner's revealer opens it",
        "  e.preventDefault();",
        "}",
      ].join("\n"),
    },
    // owner-checked on the right of `&&`.
    {
      code: [
        "// native-takeover(owner-checked): the owner's revealer opens it",
        "ownersUpgraded(t) && e.preventDefault();",
      ].join("\n"),
    },
  ],
  invalid: [
    {
      code: "e.preventDefault();",
      errors: [{ messageId: "missing" }],
    },
    {
      code: "e?.stopImmediatePropagation();",
      errors: [{ messageId: "missing" }],
    },
    {
      code: "window.history.replaceState(null, '', p);",
      errors: [{ messageId: "missing" }],
    },
    {
      code: "history.pushState(null, '', p);",
      errors: [{ messageId: "missing" }],
    },
    {
      code: "window.history.scrollRestoration = 'manual';",
      errors: [{ messageId: "missing" }],
    },
    // A marker separated by a blank line does not count, and is stale.
    {
      code: ["// native-takeover(self): x", "", "e.preventDefault();"].join(
        "\n"
      ),
      errors: [{ messageId: "stale" }, { messageId: "missing" }],
    },
    // A trailing comment on a code line is not a marker block.
    {
      code: ["foo(); // native-takeover(self): x", "e.preventDefault();"].join(
        "\n"
      ),
      errors: [{ messageId: "missing" }],
    },
    {
      code: ["// native-takeover(yolo): x", "e.preventDefault();"].join("\n"),
      errors: [{ messageId: "badKind" }],
    },
    {
      code: ["// native-takeover(self):", "e.preventDefault();"].join("\n"),
      errors: [{ messageId: "noReason" }],
    },
    {
      code: ["// native-takeover: x", "e.preventDefault();"].join("\n"),
      errors: [{ messageId: "badKind" }],
    },
    // owner-checked without a guard.
    {
      code: [
        "// native-takeover(owner-checked): trust me",
        "e.preventDefault();",
      ].join("\n"),
      errors: [{ messageId: "unguarded" }],
    },
    // A negated check is not a positive guard.
    {
      code: [
        "if (!ownersUpgraded(t)) {",
        "  // native-takeover(owner-checked): wrong branch",
        "  e.preventDefault();",
        "}",
      ].join("\n"),
      errors: [{ messageId: "unguarded" }],
    },
    // The else branch of a positive check is not guarded.
    {
      code: [
        "if (ownersUpgraded(t)) {} else {",
        "  // native-takeover(owner-checked): wrong branch",
        "  e.preventDefault();",
        "}",
      ].join("\n"),
      errors: [{ messageId: "unguarded" }],
    },
    // An early return that does not exit is not a guard.
    {
      code: [
        "function f(e, t) {",
        "  if (!ownersUpgraded(t)) log();",
        "  // native-takeover(owner-checked): no exit",
        "  e.preventDefault();",
        "}",
      ].join("\n"),
      errors: [{ messageId: "unguarded" }],
    },
    // A guard in an outer function does not cover a nested callback.
    {
      code: [
        "if (ownersUpgraded(t)) {",
        "  el.addEventListener('click', (e) => {",
        "    // native-takeover(owner-checked): runs later",
        "    e.preventDefault();",
        "  });",
        "}",
      ].join("\n"),
      errors: [{ messageId: "unguarded" }],
    },
    // A marker with nothing under it is stale.
    {
      code: ["// native-takeover(self): nothing here", "foo();"].join("\n"),
      errors: [{ messageId: "stale" }],
    },
  ],
});
