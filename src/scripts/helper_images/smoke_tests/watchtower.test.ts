import { readFileSync } from "node:fs";
import {
  findLogProblems,
  parseJsonLogs,
  pinnedWatchtowerVersion,
  type LogEntry,
} from "@/scripts/helper_images/smoke_tests/watchtower";

describe("watchtower smoke test helpers", () => {
  describe("pinnedWatchtowerVersion", () => {
    test("reads the pinned version from the Dockerfile's FROM line", () => {
      const dockerfile = readFileSync("src/devops/watchtower/Dockerfile");
      const version = pinnedWatchtowerVersion(dockerfile);
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    test("reads version from default path when no argument passed", () => {
      const version = pinnedWatchtowerVersion();
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    test("parses a digest-pinned FROM line", () => {
      const digest = "a".repeat(64);
      expect(
        pinnedWatchtowerVersion(
          `# comment\nFROM ghcr.io/nicholas-fedor/watchtower:1.24.0@sha256:${digest}\nENV A=b\n`
        )
      ).toBe("1.24.0");
    });

    test("throws on a FROM line that isn't pinned by digest", () => {
      expect(() =>
        pinnedWatchtowerVersion(
          "FROM ghcr.io/nicholas-fedor/watchtower:1.23.2\n"
        )
      ).toThrow("Could not find a digest-pinned");
    });

    test("throws on a Dockerfile without the upstream FROM line", () => {
      expect(() =>
        pinnedWatchtowerVersion("FROM alpine:3.20\nRUN echo hello\n")
      ).toThrow("Could not find a digest-pinned");
    });
  });

  describe("parseJsonLogs", () => {
    test("parses JSON objects and skips non-JSON and non-object lines", () => {
      const output = [
        "time=2026-10-28 msg=starting", // plain text
        '{"level":"info","message":"Watchtower 1.23.2 starting"}',
        "not json at all",
        "[1, 2, 3]", // array, not an object
        '{"level":"warn","message":"a warning"}',
        "   ",
        '{"invalid json": ',
        '{"level":"info","message":"done"}',
      ].join("\n");

      const entries = parseJsonLogs(output);
      expect(entries).toEqual([
        {
          level: "info",
          message: "Watchtower 1.23.2 starting",
        },
        {
          level: "warn",
          message: "a warning",
        },
        {
          level: "info",
          message: "done",
        },
      ]);
    });
  });

  describe("findLogProblems", () => {
    const version = "1.23.2";
    const container = "wt-smoke-app";
    const stopTimeoutS = 3;

    function goodLogs(): LogEntry[] {
      return [
        {
          level: "info",
          message: `Watchtower ${version} using Docker API v1.45`,
        },
        {
          level: "warn",
          message: "Could not identify Watchtower's own container",
        },
        {
          level: "info",
          message: "Stopping container",
          container: "/wt-smoke-app",
          timeout: 3000,
        },
        {
          level: "info",
          message: "Update session completed",
          updated: 1,
          failed: 0,
        },
      ];
    }

    test("returns empty array on synthetic good log with a warning", () => {
      const problems = findLogProblems(goodLogs(), {
        version,
        container,
        stopTimeoutS,
      });
      expect(problems).toEqual([]);
    });

    test("detects an error line", () => {
      const logs = [
        ...goodLogs(),
        { level: "error", message: "Failed to connect to docker daemon" },
      ];
      const problems = findLogProblems(logs, {
        version,
        container,
        stopTimeoutS,
      });
      expect(problems.some((p) => p.includes("level error"))).toBe(true);
    });

    test("detects v0.0.0-unknown in the startup line", () => {
      const logs = goodLogs().map((e) =>
        typeof e.message === "string" && e.message.startsWith("Watchtower ")
          ? {
              ...e,
              message: "Watchtower v0.0.0-unknown using Docker API v1.45",
            }
          : e
      );
      const problems = findLogProblems(logs, {
        version,
        container,
        stopTimeoutS,
      });
      expect(
        problems.some((p) =>
          p.includes("Startup log message does not start with")
        )
      ).toBe(true);
    });

    test("detects updated: 0", () => {
      const logs = goodLogs().map((e) =>
        e.message === "Update session completed" ? { ...e, updated: 0 } : e
      );
      const problems = findLogProblems(logs, {
        version,
        container,
        stopTimeoutS,
      });
      expect(problems.some((p) => p.includes("updated === 1"))).toBe(true);
    });

    test("detects failed: 1", () => {
      const logs = goodLogs().map((e) =>
        e.message === "Update session completed" ? { ...e, failed: 1 } : e
      );
      const problems = findLogProblems(logs, {
        version,
        container,
        stopTimeoutS,
      });
      expect(problems.some((p) => p.includes("failed === 0"))).toBe(true);
    });

    test("detects timeout: 30000", () => {
      const logs = goodLogs().map((e) =>
        e.message === "Stopping container" ? { ...e, timeout: 30000 } : e
      );
      const problems = findLogProblems(logs, {
        version,
        container,
        stopTimeoutS,
      });
      expect(problems.some((p) => p.includes("expected timeout 3000"))).toBe(
        true
      );
    });

    test("detects missing session line", () => {
      const logs = goodLogs().filter(
        (e) => e.message !== "Update session completed"
      );
      const problems = findLogProblems(logs, {
        version,
        container,
        stopTimeoutS,
      });
      expect(
        problems.some((p) =>
          p.includes('Missing "Update session completed" log entry')
        )
      ).toBe(true);
    });
  });
});
