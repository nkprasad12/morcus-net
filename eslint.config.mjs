import {
  fixupConfigRules,
  fixupPluginRules,
  includeIgnoreFile,
} from "@eslint/compat";
import react from "eslint-plugin-react";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import jest from "eslint-plugin-jest";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import nounsanitized from "eslint-plugin-no-unsanitized";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

// Shared `no-restricted-imports` patterns.
//
// NOTE: ESLint flat config *replaces* a rule's options when the same rule is
// configured again for a narrower set of files -- it does not merge them. The
// UI V2 blocks at the bottom of this file therefore have to re-state
// NO_RELATIVE_IMPORTS, or they would silently switch the relative-import ban
// back off for exactly the files they are meant to constrain.
const NO_RELATIVE_IMPORTS = {
  group: ["./", "../"],
  message: "Relative imports are not allowed.",
};

// UI V2 uses a target-suffix convention (see src/web/v2/README.md): `*.client.ts`
// runs in the browser, `*.server.ts` runs in Node, and `*.common.ts` must be safe
// in both. Only the first two are self-evident from the filename at a call site,
// so the boundary is enforced here rather than by review.
//
// `he` is singled out because it is ~100 KB of poorly tree-shakeable CommonJS: a
// `.common.ts` importing it would quietly land the whole thing in the client
// bundle. Browser-bound code should use the hand-rolled `escapeHtml` in
// `dict/search_bar.common.ts` instead.
const NO_SERVER_ONLY_IMPORTS = {
  group: [
    "**/*.server",
    "express",
    "he",
    "node:*",
    "child_process",
    "crypto",
    "fs",
    "fs/*",
    "http",
    "https",
    "os",
    "path",
    "stream",
    "worker_threads",
    "zlib",
  ],
  message:
    "Browser-bound code (*.client.ts / *.common.ts) must not import server-only " +
    "modules. Move the logic behind a route, or into a *.common.ts that has no " +
    "Node dependencies.",
};

const NO_CLIENT_IMPORTS = {
  group: ["**/*.client"],
  message:
    "Server-side code (*.server.ts / *.common.ts) must not import *.client.ts " +
    "modules, which expect browser globals and pull DOM code into the server build.",
};

export default [
  // Flat config does not read .gitignore on its own, so generated output such as
  // playwright-report/ (which contains bundled .js) would otherwise be linted.
  includeIgnoreFile(path.resolve(__dirname, ".gitignore")),
  {
    ignores: [
      "**/jest.config.js",
      "**/genfiles_static/",
      "**/build/",
      "**/build-tmp/",
      "src/py/",
      "**/venv/",
      "**/android/",
      "**/coverage/",
      "**/gaffiot.js",
      "**/eslint.config.mjs",
      "**/corpus_driver.js",
      "target/",
      "**/*.snap",
      // Local scratch space for investigations; never checked in.
      ".investigation/",
    ],
  },
  ...fixupConfigRules(
    compat.extends(
      "eslint:recommended",
      "plugin:@typescript-eslint/recommended"
    )
  ),
  ...fixupConfigRules(
    compat.extends("plugin:react/recommended", "plugin:react-hooks/recommended")
  ).map((config) => ({
    ...config,
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
    ignores: ["src/web/v2/**"],
  })),
  {
    plugins: {
      "@typescript-eslint": fixupPluginRules(typescriptEslint),
      jest,
    },

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },

      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",

      parserOptions: {
        project: true,
      },
    },

    rules: {
      "@typescript-eslint/prefer-find": "error",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-inferrable-types": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-this-alias": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/prefer-readonly": "error",

      "@typescript-eslint/no-confusing-void-expression": [
        "error",
        {
          ignoreArrowShorthand: true,
        },
      ],

      "@typescript-eslint/consistent-type-assertions": [
        "error",
        {
          assertionStyle: "never",
        },
      ],

      "no-constant-condition": "off",
      "no-inner-declarations": "off",
      "no-restricted-imports": ["error", { patterns: [NO_RELATIVE_IMPORTS] }],
      "no-empty": [
        "error",
        {
          allowEmptyCatch: true,
        },
      ],

      "jest/no-alias-methods": 2,
      "jest/valid-title": 2,
      "jest/valid-expect": 2,
      "jest/no-identical-title": 2,

      "jest/no-standalone-expect": [
        2,
        {
          additionalTestBlockFunctions: ["e2eTest"],
        },
      ],
    },
  },
  // React rules, settings, and plugins apply to legacy and tooling code, but are
  // explicitly excluded from UI V2 (src/web/v2), which contains no React and would
  // otherwise risk false positives on use* naming conventions in react-hooks rules.
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
    ignores: ["src/web/v2/**"],
    plugins: {
      react: fixupPluginRules(react),
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      "react/prop-types": "off",
      "react/no-unstable-nested-components": "error",

      "react/no-unknown-property": [
        "error",
        {
          ignore: ["spellcheck"],
        },
      ],

      "react/jsx-boolean-value": "error",
      "react/hook-use-state": "error",
      "react/jsx-fragments": "error",
      "react/jsx-closing-bracket-location": "off",
      "react/jsx-uses-react": "off",
      "react/react-in-jsx-scope": "off",
    },
  },
  {
    files: ["**/*.test.ts*"],

    rules: {
      "@typescript-eslint/consistent-type-assertions": "off",
    },
  },
  // UI V2 target-suffix import boundaries. These come last so they win the flat
  // config cascade. Colocated tests (`*.test.ts`) are deliberately not matched:
  // they legitimately exercise both tiers, and `foo.client.test.ts` ends in
  // `.test.ts`, so it falls outside these globs.
  //
  // The three blocks are kept mutually exclusive on purpose. `.common.ts` needs
  // *both* ban lists, and because configuring `no-restricted-imports` again
  // replaces rather than extends it, listing `.common.ts` in a client block and
  // again in a server block would leave it with only whichever came last.
  {
    files: ["src/web/v2/**/*.client.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [NO_RELATIVE_IMPORTS, NO_SERVER_ONLY_IMPORTS] },
      ],
    },
  },
  {
    files: ["src/web/v2/**/*.server.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [NO_RELATIVE_IMPORTS, NO_CLIENT_IMPORTS] },
      ],
    },
  },
  {
    files: ["src/web/v2/**/*.common.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            NO_RELATIVE_IMPORTS,
            NO_SERVER_ONLY_IMPORTS,
            NO_CLIENT_IMPORTS,
          ],
        },
      ],
    },
  },
  // V2 is new code and can hold a higher async-safety bar than the legacy tree, which
  // has 93 violations of these two rules.
  //
  // `no-misused-promises` is the load-bearing one: Express 4 ignores a handler's return
  // value, so an async handler that rejects produces an unhandled rejection, which Node
  // exits over. Two reader routes were doing exactly that. `no-floating-promises` makes
  // fire-and-forget calls state themselves as `void`.
  //
  // NOTE: this block must not configure `no-restricted-imports`. Flat config replaces a
  // rule's options rather than merging them, so naming it here would disable the
  // target-suffix bans in the three blocks above. Tests are included: there were no
  // violations in them, so there is nothing to exempt.
  {
    files: ["src/web/v2/**/*.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
  // XSS guardrail. Two of the three Phase 1 security fixes were an `innerHTML`
  // sink fed by a query parameter, so this is a bug class V2 has already
  // shipped twice.
  //
  // Markup should reach the DOM through `setHtml` / `replaceWithHtml` in
  // `core/dom.client.ts`, which accept only the `SafeHtml` produced by the
  // `html` tagged template. Note that the *type system* is what covers markup
  // coming back from a renderer function: this rule sees a call expression and
  // has no way to know whether the callee escapes its inputs. The rule's job is
  // to catch raw assignments that bypass the helpers altogether.
  //
  // Tests are exempt. Their fixtures deliberately inject arbitrary markup --
  // including the XSS payloads in the regression tests -- into a jsdom
  // document, where there is no untrusted input and no security boundary. This
  // is the opposite call from the async block above, which includes tests
  // precisely because they had nothing to exempt.
  {
    files: ["src/web/v2/**/*.ts"],
    ignores: ["src/web/v2/**/*.test.ts"],
    plugins: { "no-unsanitized": nounsanitized },
    rules: {
      "no-unsanitized/method": "error",
      "no-unsanitized/property": "error",
    },
  },
  // V2 opts back in to three rules that are off repo-wide (see the base block
  // near the top of this file). They are disabled globally because the older
  // React code cannot satisfy them; V2 is new code and need not inherit that
  // ceiling.
  //
  // The point is the ratchet, not the one-time cleanup: V2 is 100+ files and
  // still growing, and without these rules `any` and `!` accumulate silently.
  //
  // Tests are exempt, and the measured split is what justifies it -- against
  // `src/web/v2` at the time this landed:
  //
  //                              prod   test
  //   no-non-null-assertion        10    106
  //   no-explicit-any               3     19
  //   no-unused-vars                2      0
  //
  // A non-null assertion in a test is a deliberate, cheap way to say "the
  // fixture guarantees this exists," and it fails loudly as a test failure
  // rather than silently in production. Enforcing there would cost 125 changes
  // to buy nothing. Excluding tests is what makes this 15 fixes instead of 140.
  //
  // As with the async block above, this must not configure
  // `no-restricted-imports`.
  {
    files: ["src/web/v2/**/*.ts"],
    ignores: ["src/web/v2/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  // Prefer he.escape over he.encode in server templates: he.encode entity-encodes
  // all non-ASCII characters (including Greek and accented Latin), wasting CPU and
  // payload size on every render. Tests are exempt.
  //
  // NOTE: this block must not configure `no-restricted-imports`. Flat config replaces a
  // rule's options rather than merging them, so naming it here would disable the
  // target-suffix bans. Using no-restricted-properties and no-restricted-syntax avoids
  // this conflict entirely.
  {
    files: ["src/web/v2/**/*.ts", "src/common/library/v2/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "he",
          property: "encode",
          message:
            "Prefer he.escape over he.encode in server templates. he.encode entity-encodes all non-ASCII (including Greek and accented Latin), wasting CPU and payload on every render.",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ImportDeclaration[source.value='he'] > ImportSpecifier[imported.name='encode']",
          message: "Prefer importing he.escape over he.encode.",
        },
      ],
    },
  },
  // Enables type-checked rules for UI V2 production code. The expensive
  // TypeScript Program parsing (parserOptions: { project: true }) is already
  // paid for repo-wide; this captures the full safety value of
  // recommended-type-checked-only.
  //
  // Tests are exempt from the no-unsafe-* family and unbound-method: Supertest
  // response bodies and Jest spy assertions are dynamically typed by external
  // libraries, and forcing casts there adds test boilerplate with zero runtime
  // benefit. Async safety (no-floating-promises / no-misused-promises) remains
  // active for tests in the block above.
  //
  // NOTE: this block must not configure `no-restricted-imports`.
  {
    files: ["src/web/v2/**/*.ts"],
    ignores: ["src/web/v2/**/*.test.ts"],
    rules: {
      ...typescriptEslint.configs["recommended-type-checked-only"].rules,
    },
  },
];
