module.exports = {
  modulePaths: ["./src"],
  moduleNameMapper: {
    "^@/(.+)$": "<rootDir>/src/$1",
  },
  collectCoverageFrom: ["src/**/*.ts", "src/**/*.tsx"],
  // Jest discovers tests from the repo root, so scratch files under `.investigation/`
  // would otherwise be collected. See src/common/library/v2/docs/README.md.
  testPathIgnorePatterns: ["/node_modules/", "/\\.investigation/"],
  transform: {
    "^.+\\.(t|j)sx?$": [
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
