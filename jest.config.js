const { pathsToModuleNameMapper } = require("ts-jest");

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>"],
  modulePaths: ["./src"],
  testPathIgnorePatterns: [".*/integration/server_integration_test"],
  moduleNameMapper: pathsToModuleNameMapper({
    "@/*": ["*"],
  }),
  collectCoverageFrom: ["src/**/*.ts", "src/**/*.tsx"],
};
