import {
  addOfflineSettingsChangeListener,
  OFFLINE_SETTINGS_APP_DB,
  OFFLINE_SETTINGS_KEYS,
  removeOfflineSettingsChangeListener,
  type OfflineSettings,
} from "@/web/client/offline/offline_settings_storage";
import { useEffect, useState } from "react";

/** Client side hook for reading settings for Offline mode. */
export function useOfflineSettings(): OfflineSettings | undefined {
  const [settings, setSettings] = useState<OfflineSettings | undefined>(
    undefined
  );

  useEffect(() => {
    let ignoreInitial = false;
    OFFLINE_SETTINGS_APP_DB.get().then((initial) => {
      if (!ignoreInitial) {
        setSettings(initial);
      }
    });

    const listener = (e: MessageEvent<OfflineSettings>) => {
      ignoreInitial = true;
      setSettings((current) => {
        const next = e.data;
        if (current === undefined) {
          return next;
        }
        for (const key of OFFLINE_SETTINGS_KEYS) {
          if (current[key] !== next[key]) {
            return next;
          }
        }
        // If all the properties are the same, return the current one
        // to avoid triggering a re-render.
        return current;
      });
    };

    addOfflineSettingsChangeListener(listener);
    return () => removeOfflineSettingsChangeListener(listener);
  }, []);

  return settings;
}
