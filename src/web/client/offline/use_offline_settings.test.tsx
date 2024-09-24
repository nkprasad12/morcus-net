/**
 * @jest-environment jsdom
 */

global.structuredClone = (x) => JSON.parse(JSON.stringify(x));
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";

import { act, render, screen } from "@testing-library/react";
import user from "@testing-library/user-event";
import { useOfflineSettings } from "@/web/client/offline/use_offline_settings";
import { useEffect, useState } from "react";
import {
  BROADCAST_CHANNEL,
  OFFLINE_SETTINGS_SW_DB,
  type OfflineSettings,
} from "@/web/client/offline/offline_settings_storage";
import { arrayMap } from "@/common/data_structures/collect_map";
import { assertEqual, checkPresent } from "@/common/assert";

const globalListeners = arrayMap<
  FakeBroadcastChannel,
  [string, (e: any) => unknown]
>();

class FakeBroadcastChannel {
  private closed = false;

  constructor(private readonly channel: string) {}

  addEventListener(eType: string, listener: (e: any) => unknown) {
    assertEqual(this.closed, false);
    assertEqual(eType, "message");
    globalListeners.add(this, [this.channel, listener]);
  }

  removeEventListener(eType: string, listener: (e: any) => unknown) {
    assertEqual(this.closed, false);
    assertEqual(eType, "message");
    const listeners = globalListeners.get(this);
    if (listeners === undefined) {
      return;
    }
    for (let i = listeners.length - 1; i >= 0; i--) {
      if (listeners[i][1] === listener) {
        listeners.splice(i, 1);
      }
    }
  }

  close() {
    globalListeners.map.delete(this);
    this.closed = true;
  }

  postMessage(message: any) {
    for (const [channel, items] of globalListeners.map.entries()) {
      if (channel === this) {
        continue;
      }
      for (const [channelName, listener] of items) {
        if (channelName !== this.channel) {
          continue;
        }
        listener({ data: message });
      }
    }
  }
}

beforeEach(() => {
  // eslint-disable-next-line no-global-assign
  indexedDB = new IDBFactory();
});
// @ts-expect-error
global.BroadcastChannel = FakeBroadcastChannel;

afterAll(() => BROADCAST_CHANNEL.get().close());

type Listener = (value: OfflineSettings | undefined) => unknown;

function TestComponent(props: { listener: Listener }) {
  const { listener } = props;
  const settings = useOfflineSettings();
  const [x, setX] = useState(1);

  useEffect(() => {
    listener(settings);
  }, [listener, settings]);

  return <div onClick={() => setX(x + 1)}>Click me: ${x}</div>;
}

function renderWithHook(listener: Listener) {
  const { unmount } = render(<TestComponent listener={listener} />);
  return unmount;
}

describe("useOfflineSettings", () => {
  let broadcastChannel: FakeBroadcastChannel | undefined = undefined;

  beforeEach(() => {
    broadcastChannel = new FakeBroadcastChannel("OfflineSettingsChanged");
  });

  afterEach(() => {
    if (broadcastChannel) {
      broadcastChannel.close();
    }
    globalListeners.map.clear();
  });

  it("doesn't update listeners on unrelated state changes", async () => {
    const listener = jest.fn();
    renderWithHook(listener);
    const initial: OfflineSettings = { shDownloaded: true };
    await act(async () => {
      await OFFLINE_SETTINGS_SW_DB.get().set(initial);
    });
    listener.mockClear();

    await user.click(screen.getByText(/Click me/));
    await user.click(screen.getByText(/Click me/));
    await user.click(screen.getByText(/Click me/));

    expect(listener).not.toHaveBeenCalled();
  });

  it("does not update on equivalent updates", async () => {
    const listener = jest.fn();
    const initial: OfflineSettings = { shDownloaded: true };
    await OFFLINE_SETTINGS_SW_DB.get().set(initial);
    renderWithHook(listener);
    // Only required so that promises floating around after initial setup
    // have time to resolve.
    await user.click(screen.getByText(/Click me/));
    listener.mockClear();

    act(() => {
      checkPresent(broadcastChannel).postMessage({ ...initial });
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it("updates on actually different updates", async () => {
    const listener = jest.fn();
    const initial: OfflineSettings = { shDownloaded: true };
    await OFFLINE_SETTINGS_SW_DB.get().set(initial);
    renderWithHook(listener);
    // Only required so that promises floating around after initial setup
    // have time to resolve.
    await user.click(screen.getByText(/Click me/));
    listener.mockClear();

    const updated = { lsDownloaded: true };
    act(() => {
      checkPresent(broadcastChannel).postMessage(updated);
    });

    expect(listener).toHaveBeenCalledWith(updated);
  });

  it("does not update after unmount", async () => {
    const listener = jest.fn();
    const initial: OfflineSettings = { shDownloaded: true, lsDownloaded: true };
    const initalizer = jest.fn(() => Promise.resolve(initial));
    const unmount = renderWithHook(listener);
    // Only required so that promises floating around after initial setup
    // have time to resolve.
    await user.click(screen.getByText(/Click me/));
    listener.mockClear();
    initalizer.mockClear();

    unmount();
    const updated = { shDownloaded: true };
    act(() => {
      checkPresent(broadcastChannel).postMessage(updated);
    });

    expect(initalizer).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });
});
