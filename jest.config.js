// Settings shared by every project below.
const base = {
  rootDir: __dirname,
  modulePaths: ["./src"],
  moduleNameMapper: {
    "^@/(.+)$": "<rootDir>/src/$1",
  },
  // Jest discovers tests from the repo root, so scratch files under `.investigation/`
  // would otherwise be collected. See src/common/library/preprocess/docs/README.md.
  // src/integration holds Playwright suites, which Jest can't run.
  testPathIgnorePatterns: [
    "/node_modules/",
    "/\\.investigation/",
    "<rootDir>/src/integration/",
  ],
  // `@csstools/selector-*` ship ESM only; transform just those two so CJS
  // tests can import them (see tools/css_audit_cascade.ts).
  transformIgnorePatterns: [
    "/node_modules/(?!@csstools/selector-(specificity|resolve-nested)/)",
  ],
  transform: {
    "^.+\\.(t|j)sx?$|\\.mjs$": [
      "@swc/jest",
      {
        jsc: {
          transform: {
            react: {
              runtime: "automatic",
            },
          },
        },
      },
    ],
  },
  setupFilesAfterEnv: ["<rootDir>/src/web/ui/testing/setup_tests.ts"],
};

// Jest's default `testMatch`.
const ALL_TESTS = [
  "**/__tests__/**/*.?([mc])[jt]s?(x)",
  "**/?(*.)+(spec|test).?([mc])[jt]s?(x)",
];

// Whole-system suites: they check invariants across the whole app (every SSR
// fixture, every module, every stylesheet), so they depend on nearly
// everything and are slow. They run once before each commit, not after every
// edit; see `./morcus.sh test` and src/web/ui/docs/TESTING.md §3.
//
// The split uses `testMatch` rather than `testPathIgnorePatterns` because a
// `--testPathIgnorePatterns` CLI flag would replace the latter and put these
// suites back into the `unit` project.
const WHOLE_SYSTEM_TESTS = [
  "**/*_conformance.test.ts",
  "**/inventory_ratchet.test.ts",
];

module.exports = {
  collectCoverageFrom: ["src/**/*.ts", "src/**/*.tsx"],
  projects: [
    {
      ...base,
      displayName: "unit",
      testMatch: [
        ...ALL_TESTS,
        ...WHOLE_SYSTEM_TESTS.map((pattern) => `!${pattern}`),
      ],
    },
    {
      ...base,
      displayName: "whole-system",
      testMatch: WHOLE_SYSTEM_TESTS,
    },
  ],
};
