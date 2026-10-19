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
  await get("/dicts?q=habeo&dict=LnS,SnH");
  await Promise.allSettled([
    get("/dicts?q=canaba&dict=LnS,SnH&format=partial"),
    get("/dicts?q=unda&dict=LnS,SnH&format=partial"),
  ]);
  void get("/dicts?q=canem&dict=LnS,SnH&o=1&format=partial");
  void get("/api/completions?prefix=ca");
}

setInterval(() => void generateLoad(), 1000);
