import { run, sleep, tryRun } from "@/scripts/helper_images/docker";

/**
 * Validates that a LatinCy JSON response contains the expected lemma at
 * `response[0][1]` (compared case-insensitively).
 */
export function assertLatincyLemma(
  responseText: string,
  expectedLemma: string
): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new Error(`LatinCy returned invalid JSON: ${responseText}`);
  }
  if (
    !Array.isArray(parsed) ||
    !Array.isArray(parsed[0]) ||
    typeof parsed[0][1] !== "string" ||
    parsed[0][1].toLowerCase() !== expectedLemma.toLowerCase()
  ) {
    throw new Error(
      `Expected first token lemma '${expectedLemma}', got: ${responseText}`
    );
  }
}

/**
 * Starts `morcus-latincy` and verifies the sample request from its README
 * returns the expected lemma ("Gallia").
 */
export async function smokeTestLatincy(imageRef: string): Promise<void> {
  tryRun("docker", ["rm", "-f", "latincy-test"]);
  try {
    run("docker", [
      "run",
      "-d",
      "--name",
      "latincy-test",
      "-p",
      "127.0.0.1:5758:8000",
      imageRef,
    ]);

    for (let attempt = 0; attempt < 30; attempt++) {
      let res: Response;
      let text: string;
      try {
        res = await fetch("http://127.0.0.1:5758/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            words: ["Gallia", " ", "est"],
            spaces: [false, true, false],
          }),
          signal: AbortSignal.timeout(5000),
        });
        text = await res.text();
      } catch {
        // Server still loading model; retry.
        await sleep(2000);
        continue;
      }

      if (!res.ok) {
        const logs = tryRun("docker", ["logs", "latincy-test"]) ?? "";
        throw new Error(
          `LatinCy returned HTTP ${res.status}: ${text}\nLogs:\n${logs}`
        );
      }
      console.log(`LatinCy response: ${text}`);
      assertLatincyLemma(text, "Gallia");
      console.log("morcus-latincy smoke test passed.");
      return;
    }
    const logs = tryRun("docker", ["logs", "latincy-test"]) ?? "";
    throw new Error(`morcus-latincy failed to respond within 60s:\n${logs}`);
  } finally {
    tryRun("docker", ["rm", "-f", "latincy-test"]);
  }
}
