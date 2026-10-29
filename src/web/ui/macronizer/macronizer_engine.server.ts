import { fakeLatincyTagger } from "@/latincy/fake_latincy_tagger";
import { latincyAnalysis } from "@/latincy/latincy_client";
import {
  analyzeWithMorceus,
  macronizeInput,
  toUnsuggestedResult,
  type Tagger,
} from "@/macronizer/morcronizer";
import type { MacronizedResult } from "@/macronizer/macronizer_types";

/** Thrown by `macronize` when no POS tagger is configured. */
export class MacronizerUnavailableError extends Error {
  constructor(message = "Macronizer service is not configured.") {
    super(message);
    this.name = "MacronizerUnavailableError";
  }
}

export interface MacronizerEngine {
  macronize(text: string): Promise<MacronizedResult>;
  /** Morceus only; never calls the tagger. Used by Apply. */
  analyzeOnly(text: string): Promise<MacronizedResult>;
  /** Whether `macronize`'s suggestions are simulated (dev and E2E only). */
  readonly simulated?: boolean;
}

/**
 * The macronizer engine: Morceus plus `tagger` for suggestions. Without a
 * tagger, `macronize` rejects with `MacronizerUnavailableError` while
 * `analyzeOnly` (Morceus only) keeps working, so Apply works regardless.
 */
export function createMacronizerEngine(
  tagger?: Tagger,
  options: { simulated?: boolean } = {}
): MacronizerEngine {
  return {
    macronize: (text) =>
      tagger === undefined
        ? Promise.reject(new MacronizerUnavailableError())
        : macronizeInput(text, tagger),
    analyzeOnly: (text) =>
      new Promise((resolve) =>
        resolve(toUnsuggestedResult(analyzeWithMorceus(text)))
      ),
    simulated: options.simulated === true,
  };
}

const MACRONIZER_ENGINE_MODES = ["latincy", "fake-latincy", "off"];

/**
 * Builds the engine selected by `MACRONIZER_ENGINE`:
 * - `latincy`: the LatinCy server at `LATINCY_SERVER_ADDRESS` (required).
 * - `fake-latincy`: an in-process tagger that simulates suggestions from
 *   Morceus data, for dev and E2E.
 * - `off`: no tagger; Macronize answers 503.
 *
 * When `MACRONIZER_ENGINE` is unset, the mode is `latincy` if
 * `LATINCY_SERVER_ADDRESS` is set and `off` otherwise. Deployed compose files
 * predate `MACRONIZER_ENGINE` and only set the address (see the compatibility
 * note in `src/devops/docker-compose.yaml`), so they must keep getting LatinCy.
 *
 * Throws on an unknown mode or a missing address, so a misconfigured server
 * fails at startup instead of on the first request.
 */
export function macronizerEngineFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  warn: (message: string) => void = console.warn
): MacronizerEngine {
  const address = env.LATINCY_SERVER_ADDRESS;
  const hasAddress = address !== undefined && address.length > 0;
  // Empty counts as unset: compose's `${MACRONIZER_ENGINE}` with the host
  // variable unset passes "".
  const mode = env.MACRONIZER_ENGINE || (hasAddress ? "latincy" : "off");
  switch (mode) {
    case "latincy": {
      if (address === undefined || address.length === 0) {
        throw new Error(
          "MACRONIZER_ENGINE=latincy requires LATINCY_SERVER_ADDRESS to be set."
        );
      }
      return createMacronizerEngine((words, spaces) =>
        latincyAnalysis(words, spaces, address)
      );
    }
    case "fake-latincy":
      warn(
        "MACRONIZER_ENGINE=fake-latincy: macronizer suggestions are SIMULATED. " +
          "Never use this in production."
      );
      return createMacronizerEngine(fakeLatincyTagger, { simulated: true });
    case "off":
      if (hasAddress) {
        warn(
          [
            "",
            "*".repeat(72),
            "* WARNING: LATINCY_SERVER_ADDRESS is set, but MACRONIZER_ENGINE is",
            "* off, so the macronizer is DISABLED.",
            "* Set MACRONIZER_ENGINE=latincy to use the LatinCy server.",
            "*".repeat(72),
            "",
          ].join("\n")
        );
      }
      return createMacronizerEngine();
    default:
      throw new Error(
        `Unknown MACRONIZER_ENGINE "${mode}". Valid values: ` +
          `${MACRONIZER_ENGINE_MODES.join(", ")}.`
      );
  }
}
