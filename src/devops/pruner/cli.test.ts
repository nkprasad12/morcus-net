import {
  EXIT_ERROR,
  EXIT_OK,
  EXIT_SIGINT,
  EXIT_SIGTERM,
  parseIntSetting,
  runPruneLoop,
  StopController,
  type PruneLoopDeps,
} from "@/devops/pruner/cli";
import type { PrunePassResult } from "@/devops/pruner/pruner";

const CLEAN: PrunePassResult = {
  prunedWeeks: [],
  errors: [],
  stoppedEarly: false,
};
const WITH_ERRORS: PrunePassResult = {
  prunedWeeks: [],
  errors: ["boom"],
  stoppedEarly: false,
};

function makeDeps(
  passes: Array<PrunePassResult | Error | ((stop: StopController) => void)>,
  stop: StopController
) {
  const events: string[] = [];
  let i = 0;
  const deps: PruneLoopDeps = {
    runPass: async () => {
      const next = passes[i++];
      events.push("pass");
      if (next === undefined) {
        // Out of scripted passes: stop the loop.
        stop.request("SIGTERM");
        return { ...CLEAN, stoppedEarly: true };
      }
      if (next instanceof Error) throw next;
      if (typeof next === "function") {
        next(stop);
        return { ...CLEAN, stoppedEarly: true };
      }
      return next;
    },
    markHealthy: async () => {
      events.push("healthy");
    },
    markUnhealthy: async () => {
      events.push("unhealthy");
    },
    nextSleepMs: () => 0,
    log: () => {},
  };
  return { deps, events };
}

describe("pruner cli", () => {
  describe("parseIntSetting", () => {
    it("uses the fallback for blank values", () => {
      expect(parseIntSetting("X", undefined, 100, 7)).toBe(100);
      expect(parseIntSetting("X", "  ", 100, 7)).toBe(100);
    });

    it("accepts plain whole numbers at or above the minimum", () => {
      expect(parseIntSetting("X", " 7 ", 100, 7)).toBe(7);
      expect(parseIntSetting("X", "400", 100, 50)).toBe(400);
    });

    it("rejects non-integers and values below the minimum", () => {
      for (const bad of ["100d", "1e2", "0x64", "-5", "10.5", "4 00"]) {
        expect(() => parseIntSetting("X", bad, 100, 7)).toThrow(
          /must be a whole number/
        );
      }
      expect(() => parseIntSetting("TELEMETRY_MAX_MB", "4", 400, 50)).toThrow(
        /TELEMETRY_MAX_MB must be at least 50; got 4/
      );
    });
  });

  describe("StopController", () => {
    it("maps signals to exit codes, keeping the first one", () => {
      const stop = new StopController();
      expect(stop.shouldStop()).toBe(false);
      stop.request("SIGINT");
      stop.request("SIGTERM");
      expect(stop.exitCode).toBe(EXIT_SIGINT);
      expect(stop.shouldStop()).toBe(true);
    });

    it("cuts a sleep short when a stop is requested", async () => {
      const stop = new StopController();
      const sleeping = stop.sleep(60 * 60 * 1000);
      stop.request("SIGTERM");
      await expect(sleeping).resolves.toBeUndefined();
      // Already stopped: returns immediately.
      await expect(stop.sleep(60 * 60 * 1000)).resolves.toBeUndefined();
    });
  });

  describe("runPruneLoop --once", () => {
    it("exits 0 after a clean pass", async () => {
      const stop = new StopController();
      const { deps, events } = makeDeps([CLEAN], stop);
      expect(await runPruneLoop(true, stop, deps)).toBe(EXIT_OK);
      expect(events).toEqual(["pass"]);
    });

    it("exits 1 if the pass recorded errors or threw", async () => {
      let stop = new StopController();
      expect(
        await runPruneLoop(true, stop, makeDeps([WITH_ERRORS], stop).deps)
      ).toBe(EXIT_ERROR);
      stop = new StopController();
      expect(
        await runPruneLoop(true, stop, makeDeps([new Error("x")], stop).deps)
      ).toBe(EXIT_ERROR);
    });

    it("exits with the signal code if interrupted", async () => {
      const stop = new StopController();
      const { deps } = makeDeps([(s) => s.request("SIGINT")], stop);
      expect(await runPruneLoop(true, stop, deps)).toBe(EXIT_SIGINT);
    });
  });

  describe("runPruneLoop daemon", () => {
    it("marks healthy only after clean passes and exits 143 on SIGTERM", async () => {
      const stop = new StopController();
      const { deps, events } = makeDeps(
        [CLEAN, WITH_ERRORS, new Error("db down"), CLEAN],
        stop
      );
      expect(await runPruneLoop(false, stop, deps)).toBe(EXIT_SIGTERM);
      expect(events).toEqual([
        "pass",
        "healthy",
        "pass",
        "unhealthy",
        "pass",
        "unhealthy",
        "pass",
        "healthy",
        // Scripted passes exhausted: SIGTERM requested during this pass.
        "pass",
      ]);
    });

    it("does not touch the health file for a pass stopped early, and exits 130 on SIGINT", async () => {
      const stop = new StopController();
      const { deps, events } = makeDeps([(s) => s.request("SIGINT")], stop);
      expect(await runPruneLoop(false, stop, deps)).toBe(EXIT_SIGINT);
      expect(events).toEqual(["pass"]);
    });
  });
});
