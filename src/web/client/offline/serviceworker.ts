/* istanbul ignore file */

import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import {
  IndexedDbDict,
  LS_CONFIG,
  SH_CONFIG,
  type IndexDbDictConfig,
} from "@/common/dictionaries/indexdb_backing";
import { SmithAndHall } from "@/common/smith_and_hall/sh_dict";
import { CompletionsFusedApi, DictsFusedApi } from "@/web/api_routes";
import {
  extractInput,
  RouteAndHandler,
} from "@/web/client/offline/offline_rpc";
import { registerMessageListener } from "@/web/client/offline/communication/sw_comms";
import { encodeMessage, isString } from "@/web/utils/rpc/parsing";
import {
  OFFLINE_SETTINGS_SW_DB,
  type OfflineSettings,
} from "@/web/client/offline/offline_settings_storage";
import { singletonOf } from "@/common/misc_utils";
import {
  fetchMorceusTables,
  reviveTables,
  saveOfflineDict,
} from "@/web/client/offline/offline_data";
import {
  cacheKeyForPath,
  populateCache,
  returnCachedResource,
} from "@/web/client/offline/offline_cache";
import { LewisAndShort } from "@/common/lewis_and_short/ls_dict";
import { CruncherOptions, type CruncherTables } from "@/morceus/cruncher_types";
import { MorceusCruncher } from "@/morceus/crunch";
import { SingleItemStore } from "@/web/client/offline/single_item_store";

interface SwLifecycleEvent extends Event {
  waitUntil: (input: Promise<unknown>) => void;
}
interface InstallEvent extends SwLifecycleEvent {}
interface ActivatedEvent extends SwLifecycleEvent {}

interface FetchEvent extends Event {
  request: Request;
  respondWith: (response: Response | Promise<Response>) => void;
}

type FetchHandler = (event: FetchEvent) => unknown;

const DOWNLOAD_CONFIG = new Map<
  keyof OfflineSettings,
  [string, IndexDbDictConfig]
>([
  ["shDownloaded", ["shDict", SH_CONFIG]],
  ["lsDownloaded", ["lsDict", LS_CONFIG]],
]);

const DICTIONARY = new FusedDictionary([
  new SmithAndHall(IndexedDbDict.backing(SH_CONFIG)),
  new LewisAndShort(IndexedDbDict.backing(LS_CONFIG), async (input) => {
    const tables = await MORCEUS_TABLES.get().get();
    return MorceusCruncher.make(tables)(input, CruncherOptions.DEFAULT);
  }),
]);
const DICTS_FUSED = RouteAndHandler.create(DictsFusedApi, (i) =>
  DICTIONARY.getEntry(i)
);
const COMPLETIONS_FUSED = RouteAndHandler.create(CompletionsFusedApi, (i) =>
  DICTIONARY.getCompletions(i)
);

const MORCEUS_TABLES = singletonOf(() => {
  let current: CruncherTables | undefined = undefined;
  let initialStale = false;
  const initial = SingleItemStore.forKey("morceusTables", isString)
    .get()
    .then(reviveTables);
  initial.then((value) => {
    if (!initialStale) {
      current = value;
    }
  });

  return {
    get: () => current ?? initial,
  };
});

const OFFLINE_SETTINGS = singletonOf(() => {
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
});

function fetchHandler(handlers: RouteAndHandler<any, any>[]): FetchHandler {
  const findApiHandler = (url: URL) => {
    for (const handler of handlers) {
      if (url.pathname.startsWith(`${handler.route.path}/`)) {
        return handler;
      }
    }
    return undefined;
  };

  async function handleRequest<I, O>(
    request: Request,
    settingsPromise: OfflineSettings | Promise<OfflineSettings>,
    apiHandler?: RouteAndHandler<I, O>,
    cacheKey?: string
  ): Promise<Response> {
    const settings = await settingsPromise;
    if (settings.offlineModeEnabled !== true) {
      return fetch(request);
    }
    if (apiHandler !== undefined) {
      const maybeInput = extractInput(request, apiHandler.route);
      if (maybeInput instanceof Error) {
        console.debug(
          `Error parsing request, deferring to server.\n${maybeInput}`
        );
        return fetch(request);
      }
      const start = performance.now();
      const apiResponse = await apiHandler.handler(maybeInput[0]);
      const totalMs = (performance.now() - start).toFixed(2);
      console.debug(`[SW] ${apiHandler.route.path} ${totalMs} ms`);
      const encoded = encodeMessage(
        {
          data: apiResponse,
          metadata: { commit: undefined },
        },
        apiHandler.route.registry
      );
      return new Response(encoded);
    }
    if (cacheKey !== undefined) {
      const result = await returnCachedResource(cacheKey);
      return result ?? fetch(request);
    }
    return fetch(request);
  }

  return (event: FetchEvent) => {
    const settings = OFFLINE_SETTINGS.get().get();
    if (!("then" in settings) && settings.offlineModeEnabled !== true) {
      // If we had a value cached and offline mode is disabled, then we
      // can return immediately.
      return;
    }
    const url = new URL(event.request.url);
    const apiHandler = findApiHandler(url);
    const cacheKey = cacheKeyForPath(url.pathname);
    if (apiHandler === undefined && cacheKey === undefined) {
      // We have two ways of dealing with fetch requests - either a cache
      // lookup or an API handler. If none work for the current fetch, we
      // can't do anything more.
      return;
    }
    // At this point we know we can (at least try to) handle the request,
    // so we can await the settings promise if needed and return a response;
    event.respondWith(
      handleRequest(event.request, settings, apiHandler, cacheKey)
    );
  };
}

const FETCH_HANDLER = fetchHandler([DICTS_FUSED, COMPLETIONS_FUSED]);

registerMessageListener(async (req, respond) => {
  const desiredValue = req.data.desiredValue === true;
  if (!desiredValue || req.data.settingKey === "offlineModeEnabled") {
    try {
      await OFFLINE_SETTINGS.get().set((old) => {
        const settings = { ...old };
        settings[req.data.settingKey] = desiredValue;
        return settings;
      });
      respond({ success: true, complete: true });
    } catch {
      respond({ success: false, complete: true });
    }
    return;
  }
  if (req.data.settingKey === "morceusDownloaded") {
    try {
      await fetchMorceusTables();
      await OFFLINE_SETTINGS.get().set((old) => {
        const settings = { ...old };
        settings.morceusDownloaded = desiredValue;
        return settings;
      });
      respond({ success: true, complete: true });
    } catch {
      respond({ success: false, complete: true });
    }
    return;
  }
  const downloadConfig = DOWNLOAD_CONFIG.get(req.data.settingKey);
  if (downloadConfig === undefined) {
    respond({ success: false, complete: true });
    return;
  }
  try {
    const [resource, config] = downloadConfig;
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

function prewarm() {
  OFFLINE_SETTINGS.get().get();
}

// @ts-expect-error [SW only]
self.addEventListener("install", (event: InstallEvent) => {
  // @ts-expect-error [SW only]
  // This lets the current service worker activate.
  const skip: Promise<unknown> = self.skipWaiting();
  // We don't mind an error in `skipWaiting`.
  event.waitUntil(Promise.all([populateCache(), skip.catch(() => {})]));
});
// @ts-expect-error [SW only]
self.addEventListener("activate", (event: ActivatedEvent) => {
  // Pre-warm the cached value so that fetch handling doesn't need to wait on this.
  // However, note that this MUST NOT move any earlier than `activate` because before
  // there could be another service worker just about to do a write. Waiting until `activate`
  // ensures that no other service workers can be getting events.
  prewarm();
  // @ts-expect-error [SW only]
  // This lets the current service worker take over existing pages.
  event.waitUntil(self.clients.claim());
});
// @ts-expect-error [SW only]
self.addEventListener("fetch", FETCH_HANDLER);
// @ts-expect-error [SW only]
if (self.serviceWorker.state === "activated") {
  // Note that this is called both in the `activate` listener and also here.
  // This covers the case that we're not replacing any existing service worker.
  prewarm();
}
