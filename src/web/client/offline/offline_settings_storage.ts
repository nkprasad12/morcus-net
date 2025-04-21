import { assertEqual } from "@/common/assert";
import { singletonOf } from "@/common/misc_utils";
import type { SingleStoreDbConfig } from "@/web/client/utils/indexdb/types";
import {
  NO_MATCH_FOR_GET,
  simpleIndexDbStore,
} from "@/web/client/utils/indexdb/wrappers";

const OFFLINE_SETTINGS_CHANGED = "OfflineSettingsChanged";

/** Exposed only for unit tests. */
export const BROADCAST_CHANNEL = singletonOf(
  () => new BroadcastChannel(OFFLINE_SETTINGS_CHANGED)
);

interface OfflineSettingsReadonlyDb {
  /** Returns the current value from the database. */
  get: () => Promise<OfflineSettings>;
}
interface OfflineSettingsDb extends OfflineSettingsReadonlyDb {
  /** Sets a new value in the database and notifies listeners. */
  set: (settings: OfflineSettings) => Promise<void>;
}
interface OfflineSettingsInternal extends OfflineSettings {
  // We need a key for the DB, but we'll only ever have one object.
  id: 0;
}
const DEFAULT_SETTINGS: OfflineSettingsInternal = { id: 0 };
const OFFLINE_SETTINGS_CONFIG: SingleStoreDbConfig<OfflineSettingsInternal> = {
  dbName: "OfflineModeSettings",
  version: 1,
  stores: [{ name: "main", keyPath: "id" }],
};
function offlineSettingsDb(): OfflineSettingsDb {
  const db = simpleIndexDbStore(OFFLINE_SETTINGS_CONFIG);
  return {
    get: () =>
      db.get(0).catch((e) => {
        // Intended only to handle the case where no one has set the initial value yet.
        assertEqual(e, NO_MATCH_FOR_GET);
        return DEFAULT_SETTINGS;
      }),
    set: (settings) =>
      db
        .update({ ...settings, id: 0 })
        .then(() => BROADCAST_CHANNEL.get().postMessage(settings)),
  };
}

/** Settings required for Offline mode. */
export interface OfflineSettings {
  offlineModeEnabled?: boolean;
  lsDownloaded?: boolean;
  shDownloaded?: boolean;
  morceusDownloaded?: boolean;
  raDownloaded?: boolean;
  gafDownloaded?: boolean;
  georgesDownloaded?: boolean;
}

export const OFFLINE_SETTINGS_KEYS: (keyof OfflineSettings)[] = [
  "offlineModeEnabled",
  "lsDownloaded",
  "shDownloaded",
  "morceusDownloaded",
  "raDownloaded",
  "gafDownloaded",
];

/**
 * Exposed for use on the service worker side ONLY - the app side should not
 * try to set the values, only read them.
 */
export const OFFLINE_SETTINGS_SW_DB = singletonOf(offlineSettingsDb);

/**
 * Exposed for use on the app side.
 *
 * Most usages should prefer to use the hook instead.
 */
export const OFFLINE_SETTINGS_APP_DB: OfflineSettingsReadonlyDb = {
  get: () => OFFLINE_SETTINGS_SW_DB.get().get(),
};

export type OfflineSettingsChangeListener = (
  e: MessageEvent<OfflineSettings>
) => unknown;
/**
 * Exposed only for use in the client-side offline settings hook.
 * Should not be used anywhere else.
 * - The service worker is considered the source of truth for the offline mode
 *   state, and so will never need to subscribe to updates. For posting new
 *   updates, the service worker should not call this directly but use
 *   the `OfflineSettingsDb` instead.
 * - The app side should never modify the offline mode settings (since the
 *   service worker side is considered the source of truth). To access the
 *   value, the client side should use the provided hook instead.
 */
export const addOfflineSettingsChangeListener = (
  listener: OfflineSettingsChangeListener
) => BROADCAST_CHANNEL.get().addEventListener("message", listener);
export const removeOfflineSettingsChangeListener = (
  listener: OfflineSettingsChangeListener
) => BROADCAST_CHANNEL.get().removeEventListener("message", listener);
