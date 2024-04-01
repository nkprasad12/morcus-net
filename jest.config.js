const { pathsToModuleNameMapper } = require("ts-jest");

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>"],
  modulePaths: ["./src"],
  moduleNameMapper: pathsToModuleNameMapper({
    "@/*": ["*"],
  }),
  collectCoverageFrom: ["src/**/*.ts", "src/**/*.tsx"],
};
