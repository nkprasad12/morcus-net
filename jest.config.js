module.exports = {
  modulePaths: ["./src"],
  moduleNameMapper: {
    "^@/(.+)$": "<rootDir>/src/$1",
  },
  collectCoverageFrom: ["src/**/*.ts", "src/**/*.tsx"],
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
};
