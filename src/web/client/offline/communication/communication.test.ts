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
type FakeEventListenerOp = (
  eventName: string,
  listener: MessageListener
) => void;

function fakeMessaging(
  source?: FakeSource
): [FakePostMessage, FakeEventListenerOp, FakeEventListenerOp] {
  const listeners: MessageListener[] = [];
  const fakePost: FakePostMessage = (input) => {
    const event = { data: input, source };
    listeners.forEach((listener) => listener(event));
  };
  const fakeAddListener: FakeEventListenerOp = (eventName, listener) => {
    if (eventName === "message") {
      listeners.push(listener);
    }
  };
  const fakeRemoveListener: FakeEventListenerOp = (eventName, listener) => {
    if (eventName === "message") {
      for (let i = listeners.length - 1; i >= 0; i--) {
        if (listener === listeners[i]) {
          listeners.splice(i, 1);
        }
      }
    }
  };
  return [fakePost, fakeAddListener, fakeRemoveListener];
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
  const TOGGLE_REQ: ChannelRequest<"OfflineSettingToggled"> = {
    channel: "OfflineSettingToggled",
    data: { settingKey: "offlineModeEnabled", desiredValue: true },
  };

  let cleanup: undefined | (() => unknown) = undefined;

  afterEach(() => {
    cleanup?.();
    global.navigator = realNav;
  });

  function setupSwListener(responses: BaseResponse[]) {
    cleanup = registerMessageListener((_, respond) =>
      responses.forEach((response) => respond(response))
    );
  }

  function setupFakeEvents() {
    const swToApp = fakeMessaging();
    const source: FakeSource = { postMessage: swToApp[0] };
    const [appPostMessage, swAddEventListener] = fakeMessaging(source);

    // @ts-expect-error
    global.navigator.serviceWorker = {
      getRegistration: () =>
        Promise.resolve({ active: { postMessage: appPostMessage } }),
      addEventListener: swToApp[1],
      removeEventListener: swToApp[2],
    };
    // @ts-expect-error
    global.addEventListener = swAddEventListener;
  }

  it("fails if no service worker is active", async () => {
    // @ts-expect-error
    global.navigator.serviceWorker = {
      getRegistration: () => undefined,
    };

    await expect(sendToSw(TOGGLE_REQ, jest.fn())).rejects.toThrow(
      /.*No active.*/
    );
  });

  it("returns immediate error on unknown channel.", async () => {
    setupFakeEvents();
    const fakeCallback = jest.fn();

    setupSwListener([COMPLETE_SUCCESSFUL]);
    const bogusReq = { channel: "Bogus", data: {} };
    // @ts-expect-error
    await sendToSw(bogusReq, fakeCallback);

    expect(fakeCallback).toHaveBeenCalledTimes(1);
    expect(fakeCallback).toHaveBeenCalledWith({
      channel: bogusReq.channel,
      data: COMPLETE_UNSUCCESSFUL,
      req: bogusReq,
    });
  });

  it("posts message and listens if SW is active.", async () => {
    setupFakeEvents();
    const fakeCallback = jest.fn();

    setupSwListener([COMPLETE_SUCCESSFUL]);
    await sendToSw(TOGGLE_REQ, fakeCallback);

    expect(fakeCallback).toHaveBeenCalledTimes(1);
    expect(fakeCallback).toHaveBeenCalledWith({
      channel: TOGGLE_REQ.channel,
      data: COMPLETE_SUCCESSFUL,
      req: TOGGLE_REQ,
    });
  });

  it("posts message and listens to multi callback event.", async () => {
    setupFakeEvents();
    const fakeCallback = jest.fn();

    setupSwListener([IN_PROGRESS, COMPLETE_SUCCESSFUL]);
    await sendToSw(TOGGLE_REQ, fakeCallback);

    expect(fakeCallback).toHaveBeenCalledTimes(2);
    expect(fakeCallback).toHaveBeenCalledWith({
      channel: TOGGLE_REQ.channel,
      data: IN_PROGRESS,
      req: TOGGLE_REQ,
    });
    expect(fakeCallback).toHaveBeenLastCalledWith({
      channel: TOGGLE_REQ.channel,
      data: COMPLETE_SUCCESSFUL,
      req: TOGGLE_REQ,
    });
  });
});
