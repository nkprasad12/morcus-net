/* istanbul ignore file */

import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import {
  IndexedDbDict,
  LS_CONFIG,
  SH_CONFIG,
  type IndexDbDictConfig,
} from "@/common/dictionaries/indexdb_backing";
import { SmithAndHall } from "@/common/smith_and_hall/sh_dict";
import {
  CompletionsFusedApi,
  DictsFusedApi,
  ListLibraryWorks,
} from "@/web/api_routes";
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
  INDEX_CACHE_KEY,
  populateCache,
  returnCachedResource,
} from "@/web/client/offline/offline_cache";
import { LewisAndShort } from "@/common/lewis_and_short/ls_dict";
import { CruncherOptions, type CruncherTables } from "@/morceus/cruncher_types";
import { MorceusCruncher } from "@/morceus/crunch";
import { SingleItemStore } from "@/web/client/offline/single_item_store";
import { ListLibraryWorksResponse } from "@/common/library/library_types";
import { callApi } from "@/web/utils/rpc/client_rpc";
import { NumeralDict } from "@/common/dictionaries/numeral/numeral_dict";

interface SwLifecycleEvent extends Event {
  waitUntil: (input: Promise<unknown>) => void;
}
type InstallEvent = SwLifecycleEvent;
type ActivatedEvent = SwLifecycleEvent;

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
  new NumeralDict(),
]);
const DICTS_FUSED = RouteAndHandler.create(DictsFusedApi, (i) =>
  DICTIONARY.getEntry(i)
);
const COMPLETIONS_FUSED = RouteAndHandler.create(CompletionsFusedApi, (i) =>
  DICTIONARY.getCompletions(i)
);
const LIST_LIBRARY_WORKS = RouteAndHandler.create(ListLibraryWorks, (_) =>
  SingleItemStore.forKey(
    ListLibraryWorks.path,
    ListLibraryWorksResponse.isMatch
  ).get()
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
    set: (tables: CruncherTables) => {
      initialStale = true;
      current = tables;
    },
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
    setKey: async (key: keyof OfflineSettings, desiredValue: boolean) => {
      const oldValue = current ?? (await initial);
      initialStale = true;
      current = { ...oldValue };
      current[key] = desiredValue;
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
    const shouldOverride = shouldOverrideOff(settings, cacheKey);
    if (settings.offlineModeEnabled !== true && !shouldOverride) {
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
      if (result !== undefined && shouldOverride) {
        try {
          await OFFLINE_SETTINGS.get().setKey("offlineModeEnabled", true);
          await SingleItemStore.forKey("forcedOfflineMode").set(true);
          return result;
        } catch {
          // Don't try to handle failure, just fall through.
        }
      }
      return result ?? fetch(request);
    }
    return fetch(request);
  }

  function shouldOverrideOff(settings: OfflineSettings, cacheKey?: string) {
    // Explicitly handle the `undefined` case - we don't want to override
    // in that case.
    const noNetwork = navigator?.onLine === false;
    return (
      settings.offlineModeEnabled !== true &&
      cacheKey === INDEX_CACHE_KEY &&
      noNetwork
    );
  }

  return (event: FetchEvent) => {
    const url = new URL(event.request.url);
    const cacheKey = cacheKeyForPath(url.pathname);
    const settings = OFFLINE_SETTINGS.get().get();
    if (
      !("then" in settings) &&
      settings.offlineModeEnabled !== true &&
      !shouldOverrideOff(settings, cacheKey)
    ) {
      // If we should override the enabled value, then continue on to the handler logic.
      // Otherwise, if we had a value cached and offline mode is disabled, then we
      // can return immediately.
      return;
    }
    const apiHandler = findApiHandler(url);
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

const FETCH_HANDLER = fetchHandler([
  DICTS_FUSED,
  COMPLETIONS_FUSED,
  LIST_LIBRARY_WORKS,
]);

registerMessageListener(async (req, respond) => {
  const settingKey = req.data.settingKey;
  const desiredValue = req.data.desiredValue === true;

  async function tryToExecuteThenUpdateState(
    customLogic?: () => Promise<unknown>
  ) {
    try {
      await customLogic?.();
      await OFFLINE_SETTINGS.get().setKey(settingKey, desiredValue);
      respond({ success: true, complete: true });
    } catch {
      respond({ success: false, complete: true });
    }
  }

  if (!desiredValue) {
    // We just want to update the offline settings state to the requested one.
    tryToExecuteThenUpdateState();
    return;
  }
  if (settingKey === "offlineModeEnabled") {
    tryToExecuteThenUpdateState(() =>
      callApi(ListLibraryWorks, true)
        .then((workList) =>
          SingleItemStore.forKey(ListLibraryWorks.path).set(workList)
        )
        // Cache the list of works on a best-effort basis. We don't
        // need to fail the whole operation on this.
        .catch(() => {})
    );
    return;
  }
  if (settingKey === "morceusDownloaded") {
    tryToExecuteThenUpdateState(async () => {
      const tables = await fetchMorceusTables();
      MORCEUS_TABLES.get().set(tables);
    });
    return;
  }

  // From here we just have dictionary downloads.
  const downloadConfig = DOWNLOAD_CONFIG.get(settingKey);
  if (downloadConfig === undefined) {
    respond({ success: false, complete: true });
    return;
  }
  tryToExecuteThenUpdateState(async () => {
    const [resource, config] = downloadConfig;
    await saveOfflineDict(resource, config, (progress) =>
      respond({ progress })
    );
  });
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
