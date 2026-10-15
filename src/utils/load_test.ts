/* istanbul ignore file */

/**
 * Generates steady load against a morcus.net server, roughly like one busy
 * dictionary user: a full page, a few in-page partial lookups, and
 * autocomplete. Run with `npm run tsnp src/utils/load_test.ts`, pointing
 * `BASE_URL` at the server (default: a local dev server).
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:5757";

function get(path: string): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    headers: { "accept-encoding": "gzip, br" },
  });
}

async function generateLoad() {
  await get("/dicts?q=habeo&dict=ls,sh");
  await Promise.allSettled([
    get("/dicts?q=canaba&dict=ls,sh&format=partial"),
    get("/dicts?q=unda&dict=ls,sh&format=partial"),
  ]);
  get("/dicts?q=canem&dict=ls,sh&o=1&format=partial");
  get("/api/completions?prefix=ca&dict=ls,sh");
}

setInterval(generateLoad, 1000);
