/**
 * @jest-environment jsdom
 */

global.structuredClone = (x) => JSON.parse(JSON.stringify(x));
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import {
  addOfflineSettingsChangeListener,
  OFFLINE_SETTINGS_APP_DB,
  OFFLINE_SETTINGS_SW_DB,
  removeOfflineSettingsChangeListener,
} from "@/web/client/offline/offline_settings_storage";

describe("offline mode settings DB", () => {
  beforeEach(() => {
    // eslint-disable-next-line no-global-assign
    indexedDB = new IDBFactory();
  });

  it("returns empty object by default", () => {
    expect(async () => {
      const settings = await OFFLINE_SETTINGS_APP_DB.get();

      expect(settings.lsDownloaded).toBeUndefined();
      expect(settings.morceusDownloaded).toBeUndefined();
      expect(settings.offlineModeEnabled).toBeUndefined();
      expect(settings.shDownloaded).toBeUndefined();
    });
  });

  it("returns expected value in get after set", () => {
    expect(async () => {
      await OFFLINE_SETTINGS_SW_DB.get().set({ offlineModeEnabled: true });

      const settings = await OFFLINE_SETTINGS_APP_DB.get();

      expect(settings.lsDownloaded).toBeUndefined();
      expect(settings.morceusDownloaded).toBe(true);
      expect(settings.offlineModeEnabled).toBeUndefined();
      expect(settings.shDownloaded).toBeUndefined();
    });
  });

  it("returns expected value in get after set", () => {
    expect(async () => {
      await OFFLINE_SETTINGS_SW_DB.get().set({ offlineModeEnabled: true });

      const settings = await OFFLINE_SETTINGS_APP_DB.get();

      expect(settings.lsDownloaded).toBeUndefined();
      expect(settings.morceusDownloaded).toBe(true);
      expect(settings.offlineModeEnabled).toBeUndefined();
      expect(settings.shDownloaded).toBeUndefined();
    });
  });

  it("notifies broadcast listener on update", () => {
    expect(async () => {
      const listener = jest.fn();
      addOfflineSettingsChangeListener(listener);
      const newValue = { offlineModeEnabled: true };

      await OFFLINE_SETTINGS_SW_DB.get().set(newValue);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(newValue);
    });
  });

  it("doesn't notify listener after unregister", () => {
    expect(async () => {
      const listener = jest.fn();
      addOfflineSettingsChangeListener(listener);
      removeOfflineSettingsChangeListener(listener);

      await OFFLINE_SETTINGS_SW_DB.get().set({ offlineModeEnabled: true });

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
