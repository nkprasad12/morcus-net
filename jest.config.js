module.exports = {
  modulePaths: ["./src"],
  moduleNameMapper: {
    "^@/(.+)$": "<rootDir>/src/$1",
  },
  collectCoverageFrom: ["src/**/*.ts", "src/**/*.tsx"],
  // Jest discovers tests from the repo root, so scratch files under `.investigation/`
  // would otherwise be collected. See src/common/library/v2/docs/README.md.
  testPathIgnorePatterns: ["/node_modules/", "/\\.investigation/"],
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
  setupFilesAfterEnv: ["<rootDir>/src/web/v2/testing/setup_tests.ts"],
};
