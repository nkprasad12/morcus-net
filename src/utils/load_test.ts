/* istanbul ignore file */

import { CompletionsFusedApi, DictsFusedApi } from "@/web/api_routes";
import { callApi } from "@/web/utils/rpc/client_rpc";

// @ts-expect-error
global.location = {
  origin: `https://dev-hz.morcus.net`,
};

async function generateLoad() {
  await fetch("https://dev-hz.morcus.net/Root.X3PSYSMZ.js");
  await callApi(DictsFusedApi, { query: "habeo", dicts: ["L&S", "S&H"] });
  await Promise.allSettled([
    callApi(DictsFusedApi, { query: "canaba", dicts: ["L&S", "S&H"] }),
    callApi(DictsFusedApi, { query: "unda", dicts: ["L&S", "S&H"] }),
  ]);
  callApi(DictsFusedApi, { query: "canem", dicts: ["L&S", "S&H"], mode: 1 });
  callApi(CompletionsFusedApi, {
    query: "c",
    dicts: ["S&H", "L&S"],
  });
}

setInterval(generateLoad, 1000);
