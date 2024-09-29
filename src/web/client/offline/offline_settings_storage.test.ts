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
import { FakeBroadcastChannel } from "@/web/client/offline/fake_broadcast_channel";

// @ts-expect-error
global.BroadcastChannel = FakeBroadcastChannel;
console.debug = jest.fn();

describe("offline mode settings DB", () => {
  beforeEach(() => {
    // eslint-disable-next-line no-global-assign
    indexedDB = new IDBFactory();
  });

  it("returns empty object by default", async () => {
    const settings = await OFFLINE_SETTINGS_APP_DB.get();

    expect(settings.lsDownloaded).toBeUndefined();
    expect(settings.morceusDownloaded).toBeUndefined();
    expect(settings.offlineModeEnabled).toBeUndefined();
    expect(settings.shDownloaded).toBeUndefined();
  });

  it("returns expected value in get after set", async () => {
    await OFFLINE_SETTINGS_SW_DB.get().set({ morceusDownloaded: true });

    const settings = await OFFLINE_SETTINGS_APP_DB.get();

    expect(settings.lsDownloaded).toBeUndefined();
    expect(settings.morceusDownloaded).toBe(true);
    expect(settings.offlineModeEnabled).toBeUndefined();
    expect(settings.shDownloaded).toBeUndefined();
  });

  it("notifies broadcast listener on update", async () => {
    const listener = jest.fn();
    const channel = new FakeBroadcastChannel("OfflineSettingsChanged");
    channel.addEventListener("message", listener);
    const newValue = { offlineModeEnabled: true };

    await OFFLINE_SETTINGS_SW_DB.get().set(newValue);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ data: newValue });
  });

  it("doesn't notify listener after unregister", async () => {
    const listener = jest.fn();
    const channel = new FakeBroadcastChannel("OfflineSettingsChanged");
    channel.addEventListener("message", listener);
    channel.removeEventListener("message", listener);

    await OFFLINE_SETTINGS_SW_DB.get().set({ offlineModeEnabled: true });

    expect(listener).not.toHaveBeenCalled();
  });

  test("addOfflineSettingsChangeListener gets callbacks from other channel sources", async () => {
    const listener = jest.fn();
    const channel = new FakeBroadcastChannel("OfflineSettingsChanged");
    addOfflineSettingsChangeListener(listener);

    channel.postMessage("Hi");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ data: "Hi" });
  });

  test("removeOfflineSettingsChangeListener unregisters", async () => {
    const listener = jest.fn();
    const channel = new FakeBroadcastChannel("OfflineSettingsChanged");
    addOfflineSettingsChangeListener(listener);
    removeOfflineSettingsChangeListener(listener);

    channel.postMessage("Hi");

    expect(listener).not.toHaveBeenCalled();
  });
});
