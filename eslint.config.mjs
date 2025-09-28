import { fixupConfigRules, fixupPluginRules } from "@eslint/compat";
import react from "eslint-plugin-react";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import jest from "eslint-plugin-jest";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  {
    ignores: [
      "**/jest.config.js",
      "**/genfiles_static/",
      "**/build/",
      "src/py/",
      "**/venv/",
      "**/android/",
      "**/coverage/",
      "**/gaffiot.js",
      "**/eslint.config.mjs",
      "**/corpus_driver.js",
      "target/",
    ],
  },
  ...fixupConfigRules(
    compat.extends(
      "eslint:recommended",
      "plugin:react/recommended",
      "plugin:react-hooks/recommended",
      "plugin:@typescript-eslint/recommended"
    )
  ),
  {
    plugins: {
      react: fixupPluginRules(react),
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

    settings: {
      react: {
        version: "detect",
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

      "react/prop-types": "off",
      "react/no-unstable-nested-components": "error",

      "react/no-unknown-property": [
        "error",
        {
          ignore: ["spellcheck"],
        },
      ],

      "no-constant-condition": "off",
      "no-inner-declarations": "off",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["./", "../"],
              message: "Relative imports are not allowed.",
            },
          ],
        },
      ],
      "no-empty": [
        "error",
        {
          allowEmptyCatch: true,
        },
      ],

      "react/jsx-boolean-value": "error",
      "react/hook-use-state": "error",
      "react/jsx-fragments": "error",
      "react/jsx-closing-bracket-location": "off",
      "react/jsx-uses-react": "off",
      "react/react-in-jsx-scope": "off",
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
  {
    files: ["**/*.test.ts*"],

    rules: {
      "@typescript-eslint/consistent-type-assertions": "off",
    },
  },
];
