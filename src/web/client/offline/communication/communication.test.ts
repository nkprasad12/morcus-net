/**
 * @jest-environment jsdom
 */

import { sendToSw } from "@/web/client/offline/communication/app_comms";
import type {
  BaseResponse,
  ChannelRequest,
} from "@/web/client/offline/communication/comms_types";
import { registerMessageListener } from "@/web/client/offline/communication/sw_comms";

const realNav = global.navigator;

type FakePostMessage = (input: any) => void;
type FakeSource = { postMessage: FakePostMessage };
type FakeEvent = {
  data: any;
  source?: FakeSource;
};
type MessageListener = (e: FakeEvent) => void;
type FakeAddEventListener = (
  eventName: string,
  listener: MessageListener
) => void;

function fakeMessagePair(
  source?: FakeSource
): [FakePostMessage, FakeAddEventListener] {
  const listeners: MessageListener[] = [];
  const fakePost: FakePostMessage = (input) => {
    const event = { data: input, source };
    listeners.forEach((listener) => listener(event));
  };
  const fakeAddListener: FakeAddEventListener = (eventName, listener) => {
    if (eventName === "message") {
      listeners.push(listener);
    }
  };
  return [fakePost, fakeAddListener];
}

describe("Service worker communication utils", () => {
  const COMPLETE_UNSUCCESSFUL: BaseResponse = {
    complete: true,
    success: false,
  };
  const COMPLETE_SUCCESSFUL: BaseResponse = {
    complete: true,
    success: true,
  };
  const IN_PROGRESS: BaseResponse = {
    progress: 57,
  };
  const SET_ACTIVE_REQ: ChannelRequest<"SetActive"> = {
    channel: "SetActive",
    data: { isActive: true },
  };
  const PREPARE_OFFLINE_REQ: ChannelRequest<"PrepareOffline"> = {
    channel: "PrepareOffline",
    data: { resource: "shDict" },
  };

  let cleanup: undefined | (() => unknown) = undefined;

  afterEach(() => {
    cleanup?.();
    global.navigator = realNav;
  });

  function setupSwListener() {
    cleanup = registerMessageListener(
      (_, respond) => respond(COMPLETE_UNSUCCESSFUL),
      (_, respond) => {
        respond(IN_PROGRESS);
        respond(COMPLETE_SUCCESSFUL);
      }
    );
  }

  function setupFakeEvents() {
    const [swPostMessage, appAddEventListener] = fakeMessagePair();
    const source: FakeSource = { postMessage: swPostMessage };
    const [appPostMessage, swAddEventListener] = fakeMessagePair(source);

    // @ts-expect-error
    global.navigator.serviceWorker = {
      getRegistration: () =>
        Promise.resolve({ active: { postMessage: appPostMessage } }),
      addEventListener: appAddEventListener,
    };
    // @ts-expect-error
    global.addEventListener = swAddEventListener;
  }

  it("fails if no service worker is active", async () => {
    // @ts-expect-error
    global.navigator.serviceWorker = {
      getRegistration: () => undefined,
    };

    expect(
      sendToSw({ channel: "SetActive", data: { isActive: true } }, jest.fn())
    ).rejects.toThrowError(/.*No active.*/);
  });

  it("posts message and listens if SW is active.", async () => {
    setupFakeEvents();
    const fakeCallback = jest.fn();

    setupSwListener();
    await sendToSw(SET_ACTIVE_REQ, fakeCallback);

    expect(fakeCallback).toHaveBeenCalledTimes(1);
    expect(fakeCallback).toHaveBeenCalledWith({
      channel: "SetActive",
      data: COMPLETE_UNSUCCESSFUL,
      req: SET_ACTIVE_REQ,
    });
  });

  it("posts message and listens to multi callback event.", async () => {
    setupFakeEvents();
    const fakeCallback = jest.fn();

    setupSwListener();
    await sendToSw(PREPARE_OFFLINE_REQ, fakeCallback);

    expect(fakeCallback).toHaveBeenCalledTimes(2);
    expect(fakeCallback).toHaveBeenCalledWith({
      channel: "PrepareOffline",
      data: IN_PROGRESS,
      req: PREPARE_OFFLINE_REQ,
    });
    expect(fakeCallback).toHaveBeenLastCalledWith({
      channel: "PrepareOffline",
      data: COMPLETE_SUCCESSFUL,
      req: PREPARE_OFFLINE_REQ,
    });
  });

  it("does not mix up event streams.", async () => {
    setupFakeEvents();
    const prepareOfflineCallback = jest.fn();
    const setActiveCallback = jest.fn();

    setupSwListener();
    await Promise.all([
      sendToSw(PREPARE_OFFLINE_REQ, prepareOfflineCallback),
      sendToSw(SET_ACTIVE_REQ, setActiveCallback),
    ]);

    expect(setActiveCallback).toHaveBeenCalledTimes(1);
    expect(setActiveCallback).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "SetActive" })
    );
    expect(prepareOfflineCallback).toHaveBeenCalledTimes(2);
    expect(prepareOfflineCallback).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "PrepareOffline" })
    );
    expect(prepareOfflineCallback).not.toHaveBeenCalledWith(
      expect.objectContaining({ channel: "SetActive" })
    );
  });
});
