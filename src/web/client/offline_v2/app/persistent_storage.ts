/* istanbul ignore file */

import { getBrowserType, isIOS } from "@/web/client/offline_v2/app/browsers";
import { isPwa } from "@/web/client/pwa/pwa_manager";

export type PersistentStorageStatus = "Unsupported" | "Not Granted" | "Granted";
export type StorageRequirement =
  | "[Chr] Needs More Signal"
  | "[FF] Not Granted"
  | "[iOS] Open From Home Screen";

/** Whether persistent storage is enabled.  */
export async function hasPersistedStorage(): Promise<PersistentStorageStatus> {
  if (navigator?.storage?.persisted === undefined) {
    return "Unsupported";
  }
  try {
    const enabled = await navigator.storage.persisted();
    return enabled ? "Granted" : "Not Granted";
  } catch (e) {
    return "Not Granted";
  }
}

/**
 * Requests persistent storage if needed.
 */
export async function requestPersistedStorage(): Promise<
  Exclude<PersistentStorageStatus, "Not Granted"> | StorageRequirement
> {
  if (isIOS() && !isPwa()) {
    // If on iOS, we much be in the PWA mode to have persistent storage;
    // note that iOS doesn't share storage between browser and the PWA, so we
    // should always force the user to open from home screen.
    return "[iOS] Open From Home Screen";
  }
  if (navigator?.storage?.persist === undefined) {
    return "Unsupported";
  }
  if (getBrowserType() === "Firefox") {
    // Firefox has a specific prompt for persistent storage.
    const granted = await navigator.storage.persist();
    return granted ? "Granted" : "[FF] Not Granted";
  }

  try {
    const enabled = await navigator.storage.persist();
    return enabled ? "Granted" : "[Chr] Needs More Signal";
  } catch (e) {
    return "Unsupported";
  }
}
