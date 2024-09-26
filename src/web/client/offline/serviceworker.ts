/* istanbul ignore file */

import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import {
  IndexedDbDict,
  SH_CONFIG,
} from "@/common/dictionaries/indexdb_backing";
import { SmithAndHall } from "@/common/smith_and_hall/sh_dict";
import { CompletionsFusedApi, DictsFusedApi } from "@/web/api_routes";
import {
  extractInput,
  RouteAndHandler,
} from "@/web/client/offline/offline_rpc";
import { registerMessageListener } from "@/web/client/offline/communication/sw_comms";
import { encodeMessage } from "@/web/utils/rpc/parsing";
import {
  OFFLINE_SETTINGS_SW_DB,
  type OfflineSettings,
} from "@/web/client/offline/offline_settings_storage";
import { singletonOf } from "@/common/misc_utils";
import { saveOfflineDict } from "@/web/client/offline/offline_data";
import { getCommitHash } from "@/web/client/define_vars";

const CACHE_NAME = "morcusOfflineData";
const NON_INDEX_PATHS = ["/api/", "/offlineData/", "/public/", "/.well-known/"];
const INDEX = "/index.html";
const FAVICON = "/public/favicon.ico";

const SERVICE_WORKER_VERSION = "1.0";

console.log(getCommitHash());

interface InstallEvent extends Event {
  waitUntil: (input: Promise<unknown>) => void;
}

interface FetchEvent extends Event {
  request: Request;
  respondWith: (response: Response | Promise<Response>) => void;
}

type FetchHandler = (event: FetchEvent) => unknown;

const DICTIONARY = new FusedDictionary([
  new SmithAndHall(IndexedDbDict.backing(SH_CONFIG)),
]);
const DICTS_FUSED = RouteAndHandler.create(DictsFusedApi, (i) =>
  DICTIONARY.getEntry(i)
);
const COMPLETIONS_FUSED = RouteAndHandler.create(CompletionsFusedApi, (i) =>
  DICTIONARY.getCompletions(i)
);

function offlineSettings() {
  let current: OfflineSettings | undefined = undefined;
  let initialStale = false;
  const initial = OFFLINE_SETTINGS_SW_DB.get().get();
  initial.then((value) => {
    if (!initialStale) {
      current = value;
    }
  });

  return {
    get: () => current ?? initial,
    set: (reducer: (oldValue: OfflineSettings) => OfflineSettings) => {
      initialStale = true;
      current = reducer({ ...(current ?? {}) });
      return OFFLINE_SETTINGS_SW_DB.get().set(current);
    },
  };
}

const OFFLINE_SETTINGS = singletonOf(offlineSettings);

async function returnCachedResource(pathname: string) {
  for (const prefix of NON_INDEX_PATHS) {
    if (pathname.startsWith(prefix)) {
      return undefined;
    }
  }
  if (pathname.endsWith(".js")) {
    console.log("Should fetch bundle.");
    return undefined;
  }
  console.log(`SW should get from cache: ${pathname}`);
  // Open the app's cache.
  const cache = await caches.open(CACHE_NAME);
  if (pathname === FAVICON) {
    return cache.match(FAVICON);
  }
  return cache.match(INDEX);
  // if (cachedResponse) {
  //   // Return the resource.
  //   return cachedResponse;
  // } else {
  //   // The resource wasn't found in the cache, so fetch it from the network.
  //   const fetchResponse = await fetch(event.request.url);
  //   // Put the response in cache.
  //   cache.put(event.request.url, fetchResponse.clone());
  //   // And return the response.
  //   return fetchResponse;
  // }
}

// event.respondWith(returnCachedResource());

function fetchHandler(handlers: RouteAndHandler<any, any>[]): FetchHandler {
  const handler = async (e: FetchEvent) => {
    const settings = await OFFLINE_SETTINGS.get().get();
    if (!settings.offlineModeEnabled) {
      return;
    }
    const url = new URL(e.request.url);
    const cachedResult = await returnCachedResource(url.pathname);
    if (cachedResult !== undefined) {
      // e.respondWith();
      return cachedResult;
    }
    for (const option of handlers) {
      if (!url.pathname.startsWith(`${option.route.path}/`)) {
        continue;
      }
      console.debug(
        `Service Worker [${SERVICE_WORKER_VERSION}] handling ${option.route.path}`
      );
      const result = extractInput(e.request, option.route);
      if (result instanceof Error) {
        console.debug(`Error parsing request, deferring to server.\n${result}`);
        return;
      }
      const apiRequest = result[0];
      const t = performance.now();
      const apiResponse = await option.handler(apiRequest);
      // e.respondWith(
      //   option.handler(apiRequest).then((apiResponse) => {
      console.log(performance.now() - t);
      return new Response(
        encodeMessage(
          {
            data: apiResponse,
            metadata: { commit: undefined },
          },
          option.route.registry
        )
      );
      //   })
      // );
    }
  };
  return (e) =>
    e.respondWith(handler(e).then((response) => response ?? fetch(e.request)));
}

const FETCH_HANDLER = fetchHandler([DICTS_FUSED, COMPLETIONS_FUSED]);

registerMessageListener(async (req, respond) => {
  const desiredValue = req.data.desiredValue === true;
  if (!desiredValue || req.data.settingKey === "offlineModeEnabled") {
    await OFFLINE_SETTINGS.get().set((old) => {
      const settings = { ...old };
      settings[req.data.settingKey] = desiredValue;
      return settings;
    });
    respond({ success: true, complete: true });
    return;
  }
  if (req.data.settingKey !== "shDownloaded") {
    respond({ success: false, complete: true });
    return;
  }
  try {
    const resource = "shDict";
    const config = SH_CONFIG;
    await saveOfflineDict(resource, config, (progress) =>
      respond({ progress })
    );
    await OFFLINE_SETTINGS.get().set((old) => {
      const settings = { ...old };
      settings[req.data.settingKey] = desiredValue;
      return settings;
    });
    respond({ success: true, complete: true });
  } catch {
    respond({ success: false, complete: true });
  }
});
// @ts-expect-error
self.addEventListener("fetch", FETCH_HANDLER);
// @ts-expect-error
self.addEventListener("install", (event: InstallEvent) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([INDEX, FAVICON]))
  );
});
